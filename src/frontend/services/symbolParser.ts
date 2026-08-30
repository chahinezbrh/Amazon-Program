// src/frontend/services/symbolParser.ts
//
// Extracts functions from a file using VS Code's language servers, replacing
// the tree-sitter parser in db/parser.ts.
//
// Tree-sitter is a native module: it needs a C++ toolchain to install, and a
// binary compiled for Node won't load in the extension host's Electron
// runtime. The symbol provider has neither problem, works for every language
// the user has an extension for, and is more accurate for languages with a
// real language server — it resolves overloads and type-aware edge cases a
// grammar alone can't.
//
// The trade-off: a language with no extension installed yields no symbols, and
// the file is skipped. Callers should report that rather than silently
// indexing zero functions.

import * as vscode from 'vscode';
import type { ParsedFunction } from '../../shared/functionRecordsFile';

const FUNCTION_KINDS = new Set<vscode.SymbolKind>([
  vscode.SymbolKind.Function,
  vscode.SymbolKind.Method,
  vscode.SymbolKind.Constructor,
]);

/**
 * Returns every function in the file, including methods nested inside classes.
 *
 * Line numbers are 1-indexed to match what db/parser.ts produced, so
 * functions.json keeps the same shape as before.
 */
export async function parseFileViaSymbols(
  uri: vscode.Uri
): Promise<ParsedFunction[]> {
  let symbols: vscode.DocumentSymbol[] | undefined;

  try {
    symbols = await vscode.commands.executeCommand<vscode.DocumentSymbol[] | undefined>(
      'vscode.executeDocumentSymbolProvider',
      uri
    );
  } catch {
    // A language server that errors or times out is not a reason to fail the
    // whole scan — treat it the same as an unsupported file.
    return [];
  }

  if (!symbols || symbols.length === 0) return [];

  const document = await vscode.workspace.openTextDocument(uri);
  const results: ParsedFunction[] = [];

  visit(symbols, document, uri.fsPath, results);
  return results;
}

function visit(
  symbols: vscode.DocumentSymbol[],
  document: vscode.TextDocument,
  filePath: string,
  out: ParsedFunction[]
): void {
  for (const symbol of symbols) {
    if (FUNCTION_KINDS.has(symbol.kind)) {
      out.push({
        name: symbol.name,
        filePath,
        // symbol.range spans the whole declaration, signature through closing
        // brace — which is what the hash needs to detect a changed body.
        lineStart: symbol.range.start.line + 1,
        lineEnd: symbol.range.end.line + 1,
        body: document.getText(symbol.range),
      });
    }

    // Recurse regardless of kind: methods live inside a Class symbol, which is
    // not itself in FUNCTION_KINDS.
    visit(symbol.children, document, filePath, out);
  }
}

/** True when the language server can supply symbols for this file. Useful for
 *  telling the user which files were skipped and why. */
export async function hasSymbolSupport(uri: vscode.Uri): Promise<boolean> {
  try {
    const symbols = await vscode.commands.executeCommand<vscode.DocumentSymbol[] | undefined>(
      'vscode.executeDocumentSymbolProvider',
      uri
    );
    return Boolean(symbols && symbols.length > 0);
  } catch {
    return false;
  }
}