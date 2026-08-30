// src/frontend/services/repoConfig.ts
//
// Stores small, repo-level metadata (currently just the resolved GitHub URL)
// alongside functions.json, so later features — like a webhook listener —
// can map an incoming GitHub event back to the right local folder.

import { promises as fs } from 'fs';
import * as path from 'path';

interface RepoConfig {
  repoUrl?: string;
  connectedAt: string;
}

const CONFIG_DIR = '.funcmanager';
const CONFIG_FILE = 'config.json';

export function repoConfigPathFor(repoRoot: string): string {
  return path.join(repoRoot, CONFIG_DIR, CONFIG_FILE);
}

export async function writeRepoConfig(repoRoot: string, config: RepoConfig): Promise<void> {
  const target = repoConfigPathFor(repoRoot);
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.writeFile(target, JSON.stringify(config, null, 2) + '\n', 'utf8');
}

export async function readRepoConfig(repoRoot: string): Promise<RepoConfig | undefined> {
  try {
    const raw = await fs.readFile(repoConfigPathFor(repoRoot), 'utf8');
    return JSON.parse(raw);
  } catch {
    return undefined;
  }
}