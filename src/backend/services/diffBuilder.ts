import { diffLines } from 'diff'; // npm install diff

export interface DiffLine {
  type: 'add' | 'del' | 'ctx';
  text: string;
}

export function buildDiff(before: string, after: string): DiffLine[] {
  const changes = diffLines(before, after);
  const result: DiffLine[] = [];

  for (const part of changes) {
    const prefix = part.added ? '+' : part.removed ? '-' : ' ';
    const type: DiffLine['type'] = part.added ? 'add' : part.removed ? 'del' : 'ctx';
    for (const line of part.value.split('\n')) {
      if (line === '') continue;
      result.push({ type, text: `${prefix} ${line}` });
    }
  }
  return result;
}