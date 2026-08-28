// src/frontend/providers/hoverProvider.ts

import * as vscode from 'vscode';
import type { SymbolMeta, DocEntry } from '../../shared/types';
import { getDocsForSymbol } from '../services/docClient';

/** Symbol kinds we attach documentation to. Variables are included because
 *  `const parse = () => {}` is reported as a Variable, not a Function. */
const DOCUMENTABLE_KINDS = new Set<vscode.SymbolKind>([
  vscode.SymbolKind.Function,
  vscode.SymbolKind.Method,
  vscode.SymbolKind.Constructor,
  vscode.SymbolKind.Variable,
]);

export class HoverProvider implements vscode.HoverProvider {
  async provideHover(
    document: vscode.TextDocument,
    position: vscode.Position
  ): Promise<vscode.Hover | null> {
    const symbols = await vscode.commands.executeCommand<
      vscode.DocumentSymbol[] | undefined
    >('vscode.executeDocumentSymbolProvider', document.uri);

    if (!symbols?.length) return null;

    // Returns null unless the cursor is on the NAME itself, so hovering
    // `function`, a parameter, or anything in the body shows nothing at all
    // rather than an unhelpful "no docs available".
    const symbol = findSymbolByName(symbols, position);
    if (!symbol) return null;

    const meta: SymbolMeta = {
      symbolName: symbol.name,
      filePath: document.uri.fsPath,
      startLine: symbol.range.start.line,
      endLine: symbol.range.end.line,
    };

    let entries: DocEntry[];
    try {
      entries = await getDocsForSymbol(meta);
    } catch {
      entries = [];
    }

    return new vscode.Hover(
      buildMarkdown(meta, entries),
      symbol.selectionRange
    );
  }
}

/**
 * Walks the symbol tree looking for a symbol whose NAME the cursor sits on.
 *
 * DocumentSymbol carries two ranges: `range` spans the whole declaration
 * (signature + body), while `selectionRange` spans just the identifier. Testing
 * `selectionRange` is what restricts the hover to the function name.
 *
 * Children are searched first so a method inside a class wins over the class.
 */
function findSymbolByName(
  symbols: vscode.DocumentSymbol[],
  position: vscode.Position
): vscode.DocumentSymbol | null {
  for (const symbol of symbols) {
    // Only descend into symbols that actually contain the cursor.
    if (symbol.range.contains(position)) {
      const child = findSymbolByName(symbol.children, position);
      if (child) return child;
    }

    if (
      DOCUMENTABLE_KINDS.has(symbol.kind) &&
      symbol.selectionRange.contains(position)
    ) {
      return symbol;
    }
  }
  return null;
}

function buildMarkdown(meta: SymbolMeta, entries: DocEntry[]): vscode.MarkdownString {
  const md = new vscode.MarkdownString();
  md.isTrusted = true; // required for command: links to be clickable
  md.supportHtml = false;

  const args = encodeURIComponent(JSON.stringify(meta));

  if (entries.length === 0) {
    md.appendMarkdown(`**${meta.symbolName}** — no documentation yet\n\n`);
    md.appendMarkdown(
      `[Write docs](command:docManager.editDoc?${args}) · ` +
      `[Generate with AI](command:docManager.generateDoc?${args}) · ` +
      `[Record memory](command:docManager.recordDoc?${args})`
    );
    return md;
  }

  const counts = entries.reduce<Record<string, number>>((acc, e) => {
    acc[e.type] = (acc[e.type] ?? 0) + 1;
    return acc;
  }, {});

  const summary = Object.entries(counts)
    .map(([type, n]) => (n > 1 ? `${n} ${type}` : type))
    .join(' · ');

  const stale = entries.filter((e) => e.isStale).length;

  md.appendMarkdown(`**${meta.symbolName}** — ${summary}\n\n`);
  if (stale > 0) {
    md.appendMarkdown(
      `$(warning) ${stale} ${stale === 1 ? 'entry has' : 'entries have'} ` +
      `gone stale since the code changed\n\n`
    );
    md.supportThemeIcons = true;
  }
  md.appendMarkdown(`[Full docs](command:docManager.showDocPanel?${args})`);

  return md;
}