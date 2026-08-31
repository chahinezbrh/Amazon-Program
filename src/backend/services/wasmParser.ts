// src/backend/services/wasmParser.ts
//
// Loads WebAssembly grammars and extracts functions from source text.
//
// One module owns grammar loading so the function parser and the change
// classifier share a cache — grammars are a few hundred KB each and compiling
// one twice is wasted work.
//
// WASM rather than native tree-sitter: the native binding compiles as C++17
// while current Electron requires C++20, so it cannot be built for the
// extension host at all. WASM also ships one portable file per grammar rather
// than a binary per platform.

import * as path from 'path';
import { promises as fsp } from 'fs';
import { Parser, Language } from 'web-tree-sitter';
import { LANGUAGE_CONFIGS } from '../db/languageConfigs';
import type { ParsedFunction } from '../../shared/functionRecordsFile';

let initialised = false;
let grammarDir: string | undefined;
const grammarCache = new Map<string, Language | null>();

/** Called once from activate(). The .wasm files ship inside the extension and
 *  their location is only knowable from the activation context. */
export function initGrammars(extensionPath: string): void {
  grammarDir = path.join(extensionPath, 'grammars');
  console.log('[grammar] dir:', grammarDir);
}

export async function loadGrammar(language: string): Promise<Language | null> {
  const config = LANGUAGE_CONFIGS[language];
  if (!config) return null;

  if (!grammarDir) {
    console.log('[grammar] initGrammars was never called');
    return null;
  }

  const cached = grammarCache.get(language);
  if (cached !== undefined) return cached;

  if (!initialised) {
    try {
      await Parser.init();
      initialised = true;
    } catch (err) {
      console.log('[grammar] Parser.init failed:', (err as Error)?.stack);
      return null;
    }
  }

  try {
    // Read the bytes ourselves rather than passing a path: web-tree-sitter
    // resolves paths differently depending on whether it believes it is in
    // Node or a browser, and the extension host is neither cleanly.
    const bytes = await fsp.readFile(path.join(grammarDir, config.wasmFile));
    const grammar = await Language.load(bytes);
    grammarCache.set(language, grammar);
    return grammar;
  } catch (err) {
    // Cache the failure so a broken .wasm isn't retried for every file.
    console.log('[grammar] load failed:', config.wasmFile, (err as Error)?.stack);
    grammarCache.set(language, null);
    return null;
  }
}

/**
 * Extracts every function from `source`.
 *
 * Takes text rather than a path so the same code serves a workspace scan and a
 * webhook, where the "file" is content fetched from GitHub that exists nowhere
 * on disk.
 */
export async function parseSource(
  source: string,
  filePath: string,
  language: string
): Promise<ParsedFunction[]> {
  const config = LANGUAGE_CONFIGS[language];
  const grammar = await loadGrammar(language);
  if (!config || !grammar) return [];

  const parser = new Parser();
  parser.setLanguage(grammar);

  const tree = parser.parse(source);
  if (!tree) return [];

  const results: ParsedFunction[] = [];
  const wanted = new Set(config.functionNodeTypes);

  const visit = (node: any) => {
    if (wanted.has(node.type)) {
      const nameNode = node.childForFieldName('name');
      results.push({
        name: nameNode ? nameNode.text : 'anonymous',
        filePath,
        // 1-indexed, matching what the native parser produced, so
        // functions.json keeps the same shape.
        lineStart: node.startPosition.row + 1,
        lineEnd: node.endPosition.row + 1,
        body: node.text,
      });
    }

    for (const child of node.namedChildren) {
      if (child) visit(child);
    }
  };

  visit(tree.rootNode);

  // WASM memory is not garbage-collected — a leaked tree per file adds up
  // fast across a repo scan.
  tree.delete();

  return results;
}