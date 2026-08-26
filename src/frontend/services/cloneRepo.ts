// src/frontend/services/cloneRepo.ts
//
// Git-related helpers: cloning a remote repo directly into the open
// workspace folder, and reading the remote URL of an already-local repo.

import simpleGit from 'simple-git';
import * as path from 'path';
import { promises as fs } from 'fs';

export function repoFolderNameFrom(repoUrl: string): string {
  const cleaned = repoUrl.trim().replace(/\.git$/, '').replace(/\/$/, '');
  const match = cleaned.match(/github\.com[/:]([^/]+)\/([^/]+)$/);
  if (!match) {
    throw new Error(`Could not parse a GitHub owner/repo from "${repoUrl}"`);
  }
  const [, owner, repo] = match;
  return `${owner}__${repo}`;
}

/**
 * Clones (or pulls, if already cloned) the given GitHub repo into a
 * subfolder of `workspaceRoot` — the currently open VS Code workspace —
 * instead of a hidden global-storage location. Returns the local path to
 * the cloned repo, which is what gets indexed and where .funcmanager /
 * .docmanager end up.
 */
export async function cloneOrUpdateRepo(
  workspaceRoot: string,
  repoUrl: string,
  onProgress?: (message: string) => void
): Promise<string> {
  const folderName = repoFolderNameFrom(repoUrl);
  const targetPath = path.join(workspaceRoot, folderName);

  const alreadyCloned = await fs
    .access(path.join(targetPath, '.git'))
    .then(() => true)
    .catch(() => false);

  const git = simpleGit();

  if (alreadyCloned) {
    onProgress?.('Repository already cloned — pulling latest changes…');
    await simpleGit(targetPath).pull();
  } else {
    onProgress?.('Cloning repository…');
    await git.clone(repoUrl, targetPath); // full clone — no --depth, so commitProcessor's
                                            // git show/git diff across old/new SHAs always has
                                            // the history it needs
  }

  return targetPath;
}

export async function getRemoteUrl(repoPath: string): Promise<string | undefined> {
  try {
    const git = simpleGit(repoPath);
    const remotes = await git.getRemotes(true);
    const origin = remotes.find((r) => r.name === 'origin');
    return origin?.refs?.fetch;
  } catch {
    return undefined;
  }
}