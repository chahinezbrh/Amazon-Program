"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.handlePushWebhook = handlePushWebhook;
const diff_1 = require("diff");
const createFunctionRecords_1 = require("./createFunctionRecords");
const fileWalker_1 = require("../db/fileWalker");
const parseText_1 = require("./parseText");
const gitSync_1 = require("./gitSync");
const funcManagerStore_1 = require("./funcManagerStore");
const changeClassifier_1 = require("./changeClassifier");
function buildDiffLines(before, after) {
    const changes = (0, diff_1.diffLines)(before, after);
    const result = [];
    for (const part of changes) {
        if (!part.added && !part.removed)
            continue; // matches the existing UI: only add/del lines shown, no context
        const type = part.added ? 'add' : 'del';
        const prefix = part.added ? '+' : '-';
        for (const line of part.value.split('\n')) {
            if (line === '')
                continue;
            result.push({ type, text: `${prefix} ${line}` });
        }
    }
    return result;
}
async function handlePushWebhook(repoRoot, commitAuthor, commitMessage) {
    const store = new funcManagerStore_1.FuncManagerStore(repoRoot);
    await (0, gitSync_1.pullLatest)(repoRoot);
    const newSha = await (0, gitSync_1.currentHead)(repoRoot);
    const storedSha = store.getLastProcessedSha();
    if (storedSha === null) {
        // Genuinely the first webhook ever processed for this repo — nothing
        // to diff against yet. Establish the baseline now so the NEXT push
        // has something real to compare, instead of falling back to newSha
        // again and silently masking every future change.
        console.log(`[handlePushWebhook] first run ever — establishing baseline at ${newSha}, no notifications this time`);
        store.setLastProcessedSha(newSha);
        return [];
    }
    const oldSha = storedSha;
    console.log(`[handlePushWebhook] oldSha(stored) = ${oldSha}, newSha = ${newSha}`);
    if (newSha === oldSha) {
        console.log(`[handlePushWebhook] already processed this commit — exiting`);
        return [];
    }
    const oldRecords = await (0, createFunctionRecords_1.readFunctionRecordsFile)(repoRoot);
    const changedFiles = await (0, gitSync_1.changedFilesBetween)(repoRoot, oldSha, newSha);
    console.log(`[handlePushWebhook] changedFiles = ${JSON.stringify(changedFiles)}`);
    const newRecords = await (0, createFunctionRecords_1.createFunctionRecords)(repoRoot);
    const notifications = [];
    for (const relFile of changedFiles) {
        const oldFns = oldRecords.files[relFile] ?? [];
        const newFns = newRecords.files[relFile] ?? [];
        console.log(`[handlePushWebhook] ${relFile}: oldFns=${oldFns.length} newFns=${newFns.length}`);
        if (newFns.length === 0)
            continue;
        const oldByName = new Map(oldFns.map((f) => [f.name, f]));
        const language = (0, fileWalker_1.languageForPath)(relFile);
        for (const fn of newFns) {
            const oldFn = oldByName.get(fn.name);
            const isNew = !oldFn;
            const isChanged = !!oldFn && oldFn.hash !== fn.hash;
            console.log(`[handlePushWebhook] ${relFile}/${fn.name}: isNew=${isNew} isChanged=${isChanged} oldHash=${oldFn?.hash} newHash=${fn.hash}`);
            if (!isNew && !isChanged)
                continue;
            if (isChanged)
                fn.previousHash = oldFn.hash;
            let beforeBody = '';
            if (oldFn && language) {
                const beforeText = await (0, gitSync_1.fileContentAtRef)(repoRoot, oldSha, relFile);
                if (beforeText) {
                    const parsed = await (0, parseText_1.parseTextForLanguage)(beforeText, relFile, language);
                    beforeBody = parsed.find((p) => p.name === fn.name)?.body ?? '';
                }
            }
            let afterBody = '';
            if (language) {
                const afterText = await (0, gitSync_1.fileContentAtRef)(repoRoot, newSha, relFile);
                if (afterText) {
                    const parsed = await (0, parseText_1.parseTextForLanguage)(afterText, relFile, language);
                    afterBody = parsed.find((p) => p.name === fn.name)?.body ?? '';
                }
            }
            let changeType;
            if (isNew) {
                changeType = 'Function added';
            }
            else if (language && beforeBody && afterBody) {
                changeType = (await (0, changeClassifier_1.classifyChange)(beforeBody, afterBody, language)) === 'syntax'
                    ? 'Syntax changed'
                    : 'Logic changed';
            }
            else {
                changeType = 'Logic changed'; // couldn't resolve a body to compare — safer default
            }
            notifications.push({
                id: `notif-${newSha}-${relFile}-${fn.name}`,
                type: 'modification',
                title: `${fn.name}() — ${isNew ? 'new function' : 'logic changed'}`,
                functionName: `${fn.name}()`,
                filePath: relFile,
                lineRange: `line ${fn.lineStart}-${fn.lineEnd}`,
                startLine: fn.lineStart,
                endLine: fn.lineEnd,
                description: commitMessage,
                timestamp: new Date().toISOString(),
                affectedAuthor: commitAuthor,
                status: 'critical',
                changeType, // now real, not hardcoded
                diffLines: buildDiffLines(beforeBody, afterBody),
            });
        }
    }
    console.log(`[handlePushWebhook] built ${notifications.length} notifications`);
    await (0, createFunctionRecords_1.writeFunctionRecordsFile)(repoRoot, newRecords);
    store.setLastProcessedSha(newSha);
    return notifications;
}
