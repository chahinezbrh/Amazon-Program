import { diffLines } from 'diff';
import { readFunctionRecordsFile, writeFunctionRecordsFile, createFunctionRecords } from './createFunctionRecords';
import { languageForPath } from '../db/fileWalker';
import { parseTextForLanguage } from './parseText';
import { currentHead, pullLatest, changedFilesBetween, fileContentAtRef } from './gitSync';
import { CodeNotification, DiffLine } from '../../shared/types';
import { FuncManagerStore } from './funcManagerStore';

function buildDiffLines(before: string, after: string): DiffLine[] {
  const changes = diffLines(before, after);
  const result: DiffLine[] = [];
  for (const part of changes) {
    if (!part.added && !part.removed) continue; // matches the existing UI: only add/del lines shown, no context
    const type: DiffLine['type'] = part.added ? 'add' : 'del';
    const prefix = part.added ? '+' : '-';
    for (const line of part.value.split('\n')) {
      if (line === '') continue;
      result.push({ type, text: `${prefix} ${line}` });
    }
  }
  return result;
}

export async function handlePushWebhook(
  repoRoot: string,
  commitAuthor: string,
  commitMessage: string
): Promise<CodeNotification[]> {
  const store = new FuncManagerStore(repoRoot);

  await pullLatest(repoRoot);

  const newSha = await currentHead(repoRoot);
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

  const oldRecords = await readFunctionRecordsFile(repoRoot);
  const changedFiles = await changedFilesBetween(repoRoot, oldSha, newSha);
  console.log(`[handlePushWebhook] changedFiles = ${JSON.stringify(changedFiles)}`);

  const newRecords = await createFunctionRecords(repoRoot);

  const notifications: CodeNotification[] = [];

  for (const relFile of changedFiles) {
    const oldFns = oldRecords.files[relFile] ?? [];
    const newFns = newRecords.files[relFile] ?? [];
    console.log(`[handlePushWebhook] ${relFile}: oldFns=${oldFns.length} newFns=${newFns.length}`);
    if (newFns.length === 0) continue;

    const oldByName = new Map(oldFns.map((f) => [f.name, f]));
    const language = languageForPath(relFile);

    for (const fn of newFns) {
      const oldFn = oldByName.get(fn.name);
      const isNew = !oldFn;
      const isChanged = !!oldFn && oldFn.hash !== fn.hash;
      console.log(`[handlePushWebhook] ${relFile}/${fn.name}: isNew=${isNew} isChanged=${isChanged} oldHash=${oldFn?.hash} newHash=${fn.hash}`);
      if (!isNew && !isChanged) continue;

      if (isChanged) fn.previousHash = oldFn!.hash;

      let beforeBody = '';
      if (oldFn && language) {
        const beforeText = await fileContentAtRef(repoRoot, oldSha, relFile);
        if (beforeText) {
          const parsed = await parseTextForLanguage(beforeText, relFile, language);
          beforeBody = parsed.find((p) => p.name === fn.name)?.body ?? '';
        }
      }

      let afterBody = '';
      if (language) {
        const afterText = await fileContentAtRef(repoRoot, newSha, relFile);
        if (afterText) {
          const parsed = await parseTextForLanguage(afterText, relFile, language);
          afterBody = parsed.find((p) => p.name === fn.name)?.body ?? '';
        }
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
        changeType: isNew ? 'Function added' : 'Logic changed',
        diffLines: buildDiffLines(beforeBody, afterBody),
      });
    }
  }

  console.log(`[handlePushWebhook] built ${notifications.length} notifications`);
  await writeFunctionRecordsFile(repoRoot, newRecords);
  store.setLastProcessedSha(newSha);

  return notifications;
}