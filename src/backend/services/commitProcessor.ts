import { diffLines } from 'diff'; // npm install diff
import { readFunctionRecordsFile, writeFunctionRecordsFile, createFunctionRecords } from './createFunctionRecords';
import { languageForPath } from '../db/fileWalker';
import { parseTextForLanguage } from './parseText';
import { currentHead, pullLatest, changedFilesBetween, fileContentAtRef } from './gitSync';
import { CodeNotification, DiffLine } from '../../shared/types';

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
  const oldSha = await currentHead(repoRoot);
  const oldRecords = await readFunctionRecordsFile(repoRoot); // snapshot BEFORE pulling

  await pullLatest(repoRoot);

  const newSha = await currentHead(repoRoot);
  if (newSha === oldSha) return [];

  const changedFiles = await changedFilesBetween(repoRoot, oldSha, newSha);

  // Full re-scan — same call createFunctionRecords always does; this
  // already overwrites functions.json with fresh hashes (no previousHash yet).
  const newRecords = await createFunctionRecords(repoRoot);

  const notifications: CodeNotification[] = [];

  for (const relFile of changedFiles) {
    const oldFns = oldRecords.files[relFile] ?? [];
    const newFns = newRecords.files[relFile] ?? [];
    if (newFns.length === 0) continue; // deleted or unsupported file — skip for now

    const oldByName = new Map(oldFns.map((f) => [f.name, f]));
    const language = languageForPath(relFile);

    for (const fn of newFns) {
      const oldFn = oldByName.get(fn.name);
      const isNew = !oldFn;
      const isChanged = !!oldFn && oldFn.hash !== fn.hash;
      if (!isNew && !isChanged) continue;

      if (isChanged) fn.previousHash = oldFn!.hash; // annotate the record we'll persist

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

  // persist the previousHash annotations we just added onto newRecords
  await writeFunctionRecordsFile(repoRoot, newRecords);

  return notifications;
}