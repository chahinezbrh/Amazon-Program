// src/backend/services/changeClassifier.ts
//
// Classifies a function-level change as "logic" (behaviour could differ) or
// "syntax" (only formatting, comments, renamed identifiers, reworded string
// content, or the tree's meaningful structure is otherwise identical).
// Heuristic, not a proof of behavioural equivalence — see the caveat on
// classifyChange().
//
// Grammar loading lives in wasmParser so the parser and this share one cache.

import { Parser } from 'web-tree-sitter';
import { loadGrammar } from './wasmParser';

export type ChangeKind = 'logic' | 'syntax';

/** Node types whose internal chunking can vary purely due to content (unicode
 *  width, where an f-string interpolation sits, escape sequences) without any
 *  behavioural change. The node AND its subtree are skipped, since its children
 *  are exactly this kind of content noise — string_content pieces, comment
 *  text, docstring text. */
const IGNORED_TYPES = new Set(['comment', 'string_content', 'escape_sequence']);

/** Sequence of AST node types in document order — includes operator and keyword
 *  tokens (their own node type in tree-sitter, e.g. '<' vs '>'), skips comments
 *  and string content, and never records leaf text. So a renamed variable or a
 *  reworded comment doesn't count as a structural difference, but a changed
 *  operator, added statement, or altered condition does. */
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

  const visit = (node: any) => {
    if (IGNORED_TYPES.has(node.type)) return; // skip node AND its subtree
    types.push(node.type);
    for (const child of node.children) {
      if (child) visit(child);
    }
  };

  visit(tree.rootNode);
  tree.delete(); // WASM memory is not garbage-collected
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
 * toward "syntax" in that narrow case and toward "logic" everywhere else.
 */
export async function classifyChange(
  beforeBody: string,
  afterBody: string,
  language: string
): Promise<ChangeKind> {
  const beforeShape = await structuralSignature(beforeBody, language);
  const afterShape = await structuralSignature(afterBody, language);

  // Parse failure (no grammar for this language, malformed snippet) — default
  // to "logic", since over-flagging beats silently hiding a real change.
  if (!beforeShape || !afterShape) return 'logic';

  // Fast path — identical shape, skip the diff entirely.
  if (
    beforeShape.length === afterShape.length &&
    beforeShape.every((t, i) => t === afterShape[i])
  ) {
    return 'syntax';
  }

  const common = lcsLength(beforeShape, afterShape);
  const changedNodes = Math.max(beforeShape.length, afterShape.length) - common;

  return changedNodes === 0 ? 'syntax' : 'logic';
}