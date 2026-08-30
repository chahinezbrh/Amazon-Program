// src/backend/services/changeClassifier.ts
//
// Classifies a function-level change as "logic" (behaviour could differ) or
// "syntax" (formatting, comments, renamed identifiers, reworded string
// content, or the tree's meaningful structure is otherwise identical).
// Heuristic, not a proof of behavioural equivalence — see the caveat on
// classifyChange().
//
// Uses web-tree-sitter, the WebAssembly build, rather than the native one.
// Native tree-sitter needs a C++ toolchain to install, and a binary compiled
// for Node will not load in the extension host's Electron runtime — so it
// would have to be rebuilt per platform and again on every VS Code update.
// WASM has neither problem and parses identically.

import * as path from 'path';
import { Parser, Language } from 'web-tree-sitter';

export type ChangeKind = 'logic' | 'syntax';

/** Language id → grammar filename under grammars/. Add a language by dropping
 *  its .wasm here and adding one line. */
const GRAMMAR_FILES: Record<string, string> = {
  javascript: 'tree-sitter-javascript.wasm',
  javascriptreact: 'tree-sitter-javascript.wasm',
  typescript: 'tree-sitter-typescript.wasm',
  typescriptreact: 'tree-sitter-tsx.wasm',
  python: 'tree-sitter-python.wasm',
  go: 'tree-sitter-go.wasm',
  java: 'tree-sitter-java.wasm',
  rust: 'tree-sitter-rust.wasm',
  ruby: 'tree-sitter-ruby.wasm',
  php: 'tree-sitter-php.wasm',
};

/** Node types whose internal chunking can vary purely due to content
 *  (unicode width, where an f-string interpolation sits, escape sequences)
 *  without any behavioural change. The node AND its subtree are skipped,
 *  since its children are exactly this kind of content noise — string_content
 *  pieces, comment text, docstring text. */
const IGNORED_TYPES = new Set(['comment', 'string_content', 'escape_sequence']);

let initialised = false;
/** Grammars are a few hundred KB each and never change at runtime, so they are
 *  compiled once and reused. */
const grammarCache = new Map<string, Language | null>();
let grammarDir: string | undefined;

/** Must be called once from activate(), with the extension's install path —
 *  the .wasm files ship inside the extension and their location is not
 *  knowable from this module. */
export function initGrammars(extensionPath: string): void {
  grammarDir = path.join(extensionPath, 'grammars');
}

async function loadGrammar(language: string): Promise<Language | null> {
  const file = GRAMMAR_FILES[language];
  if (!file || !grammarDir) return null;

  const cached = grammarCache.get(language);
  if (cached !== undefined) return cached;

  if (!initialised) {
    await Parser.init();
    initialised = true;
  }

  try {
    const grammar = await Language.load(path.join(grammarDir, file));
    grammarCache.set(language, grammar);
    return grammar;
  } catch {
    // A missing or corrupt .wasm shouldn't crash the push handler.
    grammarCache.set(language, null);
    return null;
  }
}

/** Sequence of AST node types in document order — includes operator and
 *  keyword tokens (their own node type in tree-sitter, e.g. '<' vs '>'), skips
 *  comments and string content, and never records leaf text. So a renamed
 *  variable or a reworded comment doesn't count as a structural difference,
 *  but a changed operator, added statement, or altered condition does. */
async function structuralSignature(
  sourceCode: string,
  language: string
): Promise<string[] | null> {
  const grammar = await loadGrammar(language);
  if (!grammar) return null;

  const parser = new Parser();
  parser.setLanguage(grammar);

  const tree = parser.parse(sourceCode);
  if (!tree) return null;

  const types: string[] = [];

  const visit = (node: { type: string; children: unknown[] }) => {
    if (IGNORED_TYPES.has(node.type)) return; // skip node AND its subtree
    types.push(node.type);
    for (const child of node.children) {
      if (child) visit(child as { type: string; children: unknown[] });
    }
  };

  visit(tree.rootNode as unknown as { type: string; children: unknown[] });
  tree.delete(); // WASM memory is not garbage-collected — free it explicitly
  return types;
}

/**
 * Longest Common Subsequence length between two type sequences.
 *
 * Using LCS instead of strict positional equality means a single inserted or
 * removed node only affects the diff *around* that node — it doesn't cascade
 * into treating every subsequent node as different because indices shifted.
 */
function lcsLength(a: string[], b: string[]): number {
  const n = a.length;
  const m = b.length;
  let prev: number[] = new Array(m + 1).fill(0);

  for (let i = 1; i <= n; i++) {
    const curr: number[] = new Array(m + 1).fill(0);
    for (let j = 1; j <= m; j++) {
      curr[j] =
        a[i - 1] === b[j - 1]
          ? (prev[j - 1] ?? 0) + 1
          : Math.max(prev[j] ?? 0, curr[j - 1] ?? 0);
    }
    prev = curr;
  }

  return prev[m] ?? 0;
}

/**
 * Heuristic, not a proof: two functions with identical node-type sequences can
 * still behave differently, because leaf text is deliberately ignored —
 * swapping one identifier for another in scope is invisible here. It errs
 * toward "syntax" in that narrow case and toward "logic" everywhere else,
 * which is the safer direction for a change the user might need to review.
 */
export async function classifyChange(
  beforeBody: string,
  afterBody: string,
  language: string
): Promise<ChangeKind> {
  const beforeShape = await structuralSignature(beforeBody, language);
  const afterShape = await structuralSignature(afterBody, language);

  // Parse failure (no grammar shipped for this language, malformed snippet) —
  // default to "logic", since over-flagging beats silently hiding a change.
  if (!beforeShape || !afterShape) return 'logic';

  // Fast path — identical shape, skip the diff entirely.
  if (
    beforeShape.length === afterShape.length &&
    beforeShape.every((t, i) => t === afterShape[i])
  ) {
    return 'syntax';
  }

  // Shapes differ in count and/or order — measure how much of the meaningful
  // structure still lines up as a subsequence. Because IGNORED_TYPES already
  // stripped content-driven noise, anything left over after the LCS is a
  // genuine insertion, deletion or reorder.
  const common = lcsLength(beforeShape, afterShape);
  const changedNodes = Math.max(beforeShape.length, afterShape.length) - common;

  return changedNodes === 0 ? 'syntax' : 'logic';
}