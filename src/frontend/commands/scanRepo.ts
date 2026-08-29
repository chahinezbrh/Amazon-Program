// src/frontend/commands/scanRepo.ts
//
// Walks every source file in the repo, reads the documentation comment above
// each function, and writes them into .docmanager/docs.json as 'source' entries.
//
// Runs in the extension host rather than the service layer because the exact
// start line of each function comes from VS Code's language servers
// (executeDocumentSymbolProvider), which regex-based detection can't match.

import * as vscode from 'vscode';
import { extractCommentAbove } from '../../backend/services/commentExtractor';
import {
  readDocFile,
  writeDocFile,
  relativeKeyFor,
} from '../../backend/services/docFileStore';
import type { StoredFunction, StoredSourceDoc } from '../../shared/docFile';
import { DocPanelProvider } from '../providers/DocPanelProvider';
import { getDocsForSymbol } from '../services/docClient';

const SOURCE_GLOB = '**/*.{js,jsx,mjs,cjs,ts,tsx,py,java,cs,cpp,cc,h,hpp,c,go,rs,php,rb,kt,swift,scala,dart,lua}';
const IGNORE = '**/{node_modules,out,dist,build,.git,.docmanager}/**';

const DOCUMENTABLE_KINDS = new Set<vscode.SymbolKind>([
  vscode.SymbolKind.Function,
  vscode.SymbolKind.Method,
  vscode.SymbolKind.Constructor,
  vscode.SymbolKind.Class,
]);

/** A scan walks every source file, so it is slow enough that a double-click
 *  would otherwise start a second run. Two concurrent scans do a
 *  read-modify-write of the same docs.json and the slower one wins, silently
 *  discarding the other's results. */
let running = false;

export async function scanRepo(): Promise<void> {
  if (running) return;
  running = true;
  try {
    await run();
  } finally {
    running = false;
  }
}

async function run(): Promise<void> {
  const folder = vscode.workspace.workspaceFolders?.[0];
  if (!folder) {
    vscode.window.showErrorMessage('Doc Manager: open a folder first.');
    return;
  }
  const repoRoot = folder.uri.fsPath;

  await vscode.window.withProgress(
    { location: vscode.ProgressLocation.Notification, title: 'Doc Manager' },
    async (progress) => {
      const files = await vscode.workspace.findFiles(SOURCE_GLOB, IGNORE);
      if (files.length === 0) {
        vscode.window.showInformationMessage('Doc Manager: no source files found.');
        return;
      }

      const doc = await readDocFile(repoRoot);
      let found = 0;
      let scanned = 0;

      for (const uri of files) {
        scanned++;
        progress.report({
          message: `Reading comments… (${scanned}/${files.length})`,
        });

        const results = await scanFile(uri);
        if (results.length === 0) continue;

        const fileKey = relativeKeyFor(repoRoot, uri.fsPath);
        const fileDocs = doc.files[fileKey] ?? {};

        for (const { name, startLine, endLine, source } of results) {
          const existing: StoredFunction = fileDocs[name] ?? {
            name,
            lineStart: startLine,
            lineEnd: endLine,
            hash: 'STUB_HASH',
            memories: [],
          };

          // Replace rather than append: re-scanning after editing a comment
          // should update the entry, not stack a second copy on top. Line
          // numbers are refreshed too, since code moves between scans.
          fileDocs[name] = {
            ...existing,
            lineStart: startLine,
            lineEnd: endLine,
            memories: existing.memories ?? [],
            sourceDoc: source,
          };
          found++;
        }

        doc.files[fileKey] = fileDocs;
      }

      if (found === 0) {
        vscode.window.showInformationMessage(
          'Doc Manager: no documented functions found.'
        );
        return;
      }

      progress.report({ message: 'Writing docs.json…' });
      await writeDocFile(repoRoot, doc);
      await refreshOpenPanel();

      vscode.window.showInformationMessage(
        `Doc Manager: imported comments from ${found} function${found === 1 ? '' : 's'}.`
      );
    }
  );
}

// ---------------------------------------------------------------------------

interface ScanResult {
  name: string;
  startLine: number;
  endLine: number;
  source: StoredSourceDoc;
}

async function scanFile(uri: vscode.Uri): Promise<ScanResult[]> {
  const symbols = await vscode.commands.executeCommand<
    vscode.DocumentSymbol[] | undefined
  >('vscode.executeDocumentSymbolProvider', uri);
  if (!symbols?.length) return [];

  const document = await vscode.workspace.openTextDocument(uri);
  const lines = document.getText().split('\n');
  const results: ScanResult[] = [];

  walk(symbols, (symbol) => {
    if (!DOCUMENTABLE_KINDS.has(symbol.kind)) return;

    const comment = extractCommentAbove(lines, symbol.range.start.line);
    if (!comment) return;

    results.push({
      name: symbol.name,
      startLine: symbol.range.start.line,
      endLine: symbol.range.end.line,
      source: {
        content: comment.content,
        commentLine: comment.startLine,
        isDocBlock: comment.isDocBlock,
        extractedAt: new Date().toISOString(),
      },
    });
  });

  return results;
}

function walk(
  symbols: vscode.DocumentSymbol[],
  visit: (s: vscode.DocumentSymbol) => void
): void {
  for (const symbol of symbols) {
    visit(symbol);
    walk(symbol.children, visit);
  }
}

/** The panel shows one symbol; a scan is repo-wide. Re-reading the current
 *  symbol may well show no change — that is correct, not a failure. */
async function refreshOpenPanel(): Promise<void> {
  const panel = DocPanelProvider.currentPanel;
  if (!panel) return;

  try {
    panel.updateEntries(await getDocsForSymbol(panel.getCurrentMeta()));
  } catch {
    // A failed refresh should not fail the scan — the import already landed.
  }
}