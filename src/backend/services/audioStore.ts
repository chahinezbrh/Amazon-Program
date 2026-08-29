// src/backend/services/audioStore.ts
//
// Writes recorded audio into the repo alongside docs.json.

// No vscode import: takes a repo root and raw bytes, same as docFileStore.

import { promises as fs } from 'fs';
import * as path from 'path';

const AUDIO_DIR = path.join('.docmanager', 'audio');

/** Stored paths are repo-relative with forward slashes so a recording made on
 *  Windows still resolves after a teammate clones on Linux. Resolve to an
 *  absolute path only at playback time. */
export function audioRelativePath(id: string, extension = 'webm'): string {
  return `${AUDIO_DIR.split(path.sep).join('/')}/${id}.${extension}`;
}

export function audioAbsolutePath(repoRoot: string, relative: string): string {
  return path.join(repoRoot, ...relative.split('/'));
}

/**
 * Writes a recording and returns the repo-relative path to store in docs.json.
 *
 * `base64` is the raw audio as it arrived from the webview — MediaRecorder
 * produces a Blob, and base64 over postMessage is the only way across the
 * webview boundary without a local server.
 */
export async function saveAudio(
  repoRoot: string,
  id: string,
  base64: string,
  extension = 'webm'
): Promise<string> {
  const relative = audioRelativePath(id, extension);
  const target = audioAbsolutePath(repoRoot, relative);

  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.writeFile(target, Buffer.from(base64, 'base64'));

  return relative;
}

/** Called when a memory is deleted, so orphaned audio doesn't accumulate.
 *  A missing file is not an error — the entry may predate the file, or the
 *  file may already have been cleaned up. */
export async function deleteAudio(
  repoRoot: string,
  relative: string
): Promise<void> {
  try {
    await fs.unlink(audioAbsolutePath(repoRoot, relative));
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err;
  }
}