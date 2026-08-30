import simpleGit, { SimpleGit } from 'simple-git';

const gitFor = (repoRoot: string): SimpleGit => simpleGit(repoRoot);

export async function currentHead(repoRoot: string): Promise<string> {
  return (await gitFor(repoRoot).revparse(['HEAD'])).trim();
}

export async function pullLatest(repoRoot: string): Promise<void> {
  await gitFor(repoRoot).pull();
}

export async function changedFilesBetween(
  repoRoot: string,
  fromSha: string,
  toSha: string
): Promise<string[]> {
  const diff = await gitFor(repoRoot).diff(['--name-only', `${fromSha}..${toSha}`]);
  return diff.split('\n').map((l) => l.trim()).filter(Boolean);
}

/** Returns null if the file didn't exist at that ref (added or deleted). */
export async function fileContentAtRef(
  repoRoot: string,
  ref: string,
  relativeFilePath: string
): Promise<string | null> {
  try {
    return await gitFor(repoRoot).show([`${ref}:${relativeFilePath}`]);
  } catch {
    return null;
  }
}