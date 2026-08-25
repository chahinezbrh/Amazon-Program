import * as vscode from 'vscode';
import * as path from 'path';
import { DocEntry, SymbolMeta } from '../../shared/types';

/**
 * docManagerReader.ts
 * ------------------------------------------------------------------
 * The native hover's "no voice memory" message must reflect ONLY what's
 * recorded locally in the workspace's `.docmanager` folder — it must not
 * depend on the network doc client (docClient.ts / getDocsForSymbol),
 * which can be slow, offline, or out of sync with what's on disk.
 *
 * ASSUMPTION — adjust to match your actual .docmanager layout:
 * one JSON file per source file, mirroring its relative path, e.g.
 *
 *   <workspaceRoot>/.docmanager/src/utils/parser.ts.json
 *
 * containing an array of DocEntry objects for every symbol documented
 * in that file:
 *
 *   [
 *     { "type": "voice", "symbolName": "parseInput", "durationSeconds": 47, "content": "..." },
 *     { "type": "written", "symbolName": "parseInput", "content": "..." }
 *   ]
 *
 * If your .docmanager folder is structured differently (e.g. one file
 * per symbol, or a single index.json), only `readDocManagerFile` below
 * needs to change — everything else stays the same.
 * ------------------------------------------------------------------
 */

function getDocManagerFileUri(meta: SymbolMeta): vscode.Uri | undefined {
  const workspaceFolder = vscode.workspace.getWorkspaceFolder(vscode.Uri.file(meta.filePath));
  if (!workspaceFolder) return undefined;

  const relativePath = path.relative(workspaceFolder.uri.fsPath, meta.filePath);
  return vscode.Uri.joinPath(workspaceFolder.uri, '.docmanager', `${relativePath}.json`);
}

async function readDocManagerFile(uri: vscode.Uri): Promise<DocEntry[]> {
  try {
    const raw = await vscode.workspace.fs.readFile(uri);
    const parsed = JSON.parse(Buffer.from(raw).toString('utf8'));
    return Array.isArray(parsed) ? (parsed as DocEntry[]) : [];
  } catch {
    // File doesn't exist yet, or isn't valid JSON — treat as "nothing recorded".
    return [];
  }
}

/**
 * Returns only the doc entries for `meta.symbolName`, read exclusively
 * from the local `.docmanager` folder. Never throws, never hits the network.
 */
export async function getDocManagerEntries(meta: SymbolMeta): Promise<DocEntry[]> {
  const fileUri = getDocManagerFileUri(meta);
  if (!fileUri) return [];

  const entries = await readDocManagerFile(fileUri);
  return entries.filter((e) => e.symbolName === meta.symbolName);
}