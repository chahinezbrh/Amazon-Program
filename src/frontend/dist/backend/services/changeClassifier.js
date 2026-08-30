"use strict";
// src/backend/services/changeClassifier.ts
//
// Classifies a function-level change as "logic" (behavior could differ) or
// "syntax" (only formatting, comments, renamed identifiers, reworded string
// content, or the tree's meaningful structure is otherwise identical).
// Heuristic, not a proof of behavioral equivalence — see the caveat below
// classifyChange().
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.classifyChange = classifyChange;
const web_tree_sitter_1 = __importDefault(require("web-tree-sitter"));
const languageConfigs_1 = require("../db/languageConfigs");
/** Node types whose internal chunking can vary purely due to content
 *  (unicode width, where an f-string interpolation sits, escape sequences)
 *  without any behavioral change. We skip the node AND everything under
 *  it, since its children are exactly this kind of content noise —
 *  string_content pieces, comment text, docstring text. */
const IGNORED_TYPES = new Set([
    'comment',
    'string_content',
    'escape_sequence',
]);
let engineInitPromise = null;
/** Same WASM engine init as parser.ts — Parser.init() loads the core
 *  tree-sitter.wasm runtime once, shared across every Parser instance in
 *  the process regardless of which file calls it first. */
function ensureEngineInitialized() {
    if (!engineInitPromise) {
        engineInitPromise = web_tree_sitter_1.default.init();
    }
    return engineInitPromise;
}
/** Sequence of AST node types in document order — includes operator/keyword
 *  tokens (their own node type in tree-sitter, e.g. '<' vs '>'), skips
 *  comments and string content, and never records leaf text — so a renamed
 *  variable or a reworded comment/string doesn't count as a structural
 *  difference, but a changed operator, added statement, or altered
 *  condition does. */
async function structuralSignature(sourceCode, language) {
    await ensureEngineInitialized();
    await (0, languageConfigs_1.ensureLanguageConfigsLoaded)();
    const config = languageConfigs_1.LANGUAGE_CONFIGS[language];
    if (!config)
        return null;
    const parser = new web_tree_sitter_1.default();
    parser.setLanguage(config.language);
    const tree = parser.parse(sourceCode);
    if (!tree)
        return null;
    const types = [];
    function visit(node) {
        if (IGNORED_TYPES.has(node.type))
            return; // skip node AND its subtree — pure content
        types.push(node.type);
        for (const child of node.children) {
            visit(child);
        }
    }
    visit(tree.rootNode);
    return types;
}
/**
 * Longest Common Subsequence length between two type sequences.
 *
 * Using LCS instead of strict positional equality means a single inserted
 * or removed node (e.g. from string-chunk splitting, or a genuinely added
 * statement) only affects the diff *around* that node — it doesn't cascade
 * into treating every subsequent node as "different" just because indices
 * shifted by one.
 */
function lcsLength(a, b) {
    const n = a.length;
    const m = b.length;
    let prev = new Array(m + 1).fill(0);
    for (let i = 1; i <= n; i++) {
        const curr = new Array(m + 1).fill(0);
        for (let j = 1; j <= m; j++) {
            curr[j] = a[i - 1] === b[j - 1]
                ? prev[j - 1] + 1
                : Math.max(prev[j], curr[j - 1]);
        }
        prev = curr;
    }
    return prev[m];
}
async function classifyChange(beforeBody, afterBody, language) {
    const beforeShape = await structuralSignature(beforeBody, language);
    const afterShape = await structuralSignature(afterBody, language);
    // Parse failure (unsupported language, malformed snippet) — default to
    // "logic" since over-flagging is safer than silently hiding a real change.
    if (!beforeShape || !afterShape)
        return 'logic';
    // Fast path — identical shape, skip the diff entirely.
    if (beforeShape.length === afterShape.length &&
        beforeShape.every((t, i) => t === afterShape[i])) {
        return 'syntax';
    }
    // Shapes differ in count and/or order — measure how much of the
    // meaningful structure still lines up as a subsequence. Because
    // IGNORED_TYPES already stripped out content-driven noise, any node left
    // over after the LCS is a genuine structural insertion, deletion, or
    // reorder — an added statement, a swapped operator, a new branch — not
    // just leaf text drifting.
    const common = lcsLength(beforeShape, afterShape);
    const maxLen = Math.max(beforeShape.length, afterShape.length);
    const changedNodes = maxLen - common;
    return changedNodes === 0 ? 'syntax' : 'logic';
}
