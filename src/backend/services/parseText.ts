// src/backend/services/parseText.ts
//
// Parses source text that isn't on disk — file contents fetched from GitHub
// after a push, where both the before and after versions need parsing but
// neither exists in the workspace.
//
// The symbol provider needs a real file to work with, so the text is written
// to a temp file first. The original extension is preserved in the temp name
// because that is what VS Code uses to pick a language server.

import * as os from 'os';
import * as path from 'path';
import * as vscode from 'vscode';
import { promises as fsp } from 'fs';
import type { ParsedFunction } from '../../shared/functionRecordsFile';
import { parseFileViaSymbols } from '../../frontend/services/symbolParser';

/**
 * Returns every function in `text`, as if it were the file at
 * `relativeFilePath`.
 *
 * The `filePath` on each result points at the temp file, so callers that need
 * the real path should overwrite it — commitProcessor does this with the path
 * from the push payload.
 */
export async function parseTextForLanguage(
  text: string,
  relativeFilePath: string
): Promise<ParsedFunction[]> {
  const tempPath = path.join(
    os.tmpdir(),
    `funcmanager-${Date.now()}-${Math.random().toString(36).slice(2)}-${path.basename(
      relativeFilePath
    )}`
  );

  await fsp.writeFile(tempPath, text, 'utf-8');

  try {
    const parsed = await parseFileViaSymbols(vscode.Uri.file(tempPath));
    // Report the real path rather than the temp one, so records written from a
    // webhook match those written by a workspace scan.
    return parsed.map((fn) => ({ ...fn, filePath: relativeFilePath }));
  } finally {
    // Best-effort: a leftover temp file is harmless, and failing to delete it
    // should not fail the parse that already succeeded.
    await fsp.unlink(tempPath).catch(() => {});
  }
}