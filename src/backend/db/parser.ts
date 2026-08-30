import { CodeFile } from './fileWalker';
import { LANGUAGE_CONFIGS, ensureLanguageConfigsLoaded } from './languageConfigs';
import fs from 'fs';
import Parser from 'web-tree-sitter'; // ← default import, not { Parser }

export interface ParsedFunction {
  name: string;
  filePath: string;
  lineStart: number;
  lineEnd: number;
  body: string;
}

let engineInitPromise: Promise<void> | null = null;

/** Initializes the core WASM engine once. Must happen before any Parser is
 *  constructed — web-tree-sitter's Parser.init() loads tree-sitter.wasm
 *  itself, separate from any individual language grammar. */
function ensureEngineInitialized(): Promise<void> {
  if (!engineInitPromise) {
    engineInitPromise = Parser.init();
  }
  return engineInitPromise;
}

export async function isLanguageSupported(language: string): Promise<boolean> {
  await ensureLanguageConfigsLoaded(); // now internally guarantees engine init too
  return language in LANGUAGE_CONFIGS;
}

export async function parseFile(file: CodeFile): Promise<ParsedFunction[]> {
  await ensureEngineInitialized();
  await ensureLanguageConfigsLoaded();

  const config = LANGUAGE_CONFIGS[file.language];
  if (!config) return []; // grammar not available — skip, same as before

  const { language, functionNodeTypes } = config;

  const sourceCode = fs.readFileSync(file.path, 'utf-8');

  const parser = new Parser();
  parser.setLanguage(language);
  const tree = parser.parse(sourceCode);
  if (!tree) return [];

  const results: ParsedFunction[] = [];

  function visit(node: any) {
    if (functionNodeTypes.includes(node.type)) {
      const nameNode = node.childForFieldName('name');
      results.push({
        name: nameNode ? nameNode.text : 'anonymous',
        filePath: file.path,
        lineStart: node.startPosition.row + 1,
        lineEnd: node.endPosition.row + 1,
        body: node.text,
      });
    }

    for (const child of node.namedChildren) {
      visit(child);
    }
  }

  visit(tree.rootNode);
  return results;
}