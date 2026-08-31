// src/backend/db/languageConfigs.ts
//
// Maps a language to its WebAssembly grammar and the node types that count as
// a function.
//
// Keys are language-map names — "JavaScript", "Python", "C++" — because that
// is what fileWalker's EXTENSION_TO_LANGUAGE produces. NOT VS Code language
// ids. Getting this wrong means every lookup misses silently and nothing is
// ever parsed.

export interface LanguageConfig {
  /** Filename under the extension's grammars/ directory. */
  wasmFile: string;
  functionNodeTypes: string[];
}

export const LANGUAGE_CONFIGS: Record<string, LanguageConfig> = {
  JavaScript: {
    wasmFile: 'tree-sitter-javascript.wasm',
    functionNodeTypes: [
      'function_declaration',
      'function_expression',
      'method_definition',
      'arrow_function',
    ],
  },
  TypeScript: {
    wasmFile: 'tree-sitter-typescript.wasm',
    functionNodeTypes: [
      'function_declaration',
      'function_expression',
      'method_definition',
      'arrow_function',
    ],
  },
  TSX: {
    wasmFile: 'tree-sitter-tsx.wasm',
    functionNodeTypes: [
      'function_declaration',
      'function_expression',
      'method_definition',
      'arrow_function',
    ],
  },
  Python: {
    wasmFile: 'tree-sitter-python.wasm',
    functionNodeTypes: ['function_definition'],
  },
  Java: {
    wasmFile: 'tree-sitter-java.wasm',
    functionNodeTypes: ['method_declaration', 'constructor_declaration'],
  },
  Go: {
    wasmFile: 'tree-sitter-go.wasm',
    functionNodeTypes: ['function_declaration', 'method_declaration'],
  },
  Ruby: {
    wasmFile: 'tree-sitter-ruby.wasm',
    functionNodeTypes: ['method', 'singleton_method'],
  },
  PHP: {
    wasmFile: 'tree-sitter-php.wasm',
    functionNodeTypes: ['function_definition', 'method_declaration'],
  },
  Rust: {
    wasmFile: 'tree-sitter-rust.wasm',
    functionNodeTypes: ['function_item'],
  },
  C: {
    wasmFile: 'tree-sitter-c.wasm',
    functionNodeTypes: ['function_definition'],
  },
  'C++': {
    wasmFile: 'tree-sitter-cpp.wasm',
    functionNodeTypes: ['function_definition'],
  },
  // Note the underscore — that is how tree-sitter-wasms names this one.
  'C#': {
    wasmFile: 'tree-sitter-c_sharp.wasm',
    functionNodeTypes: ['method_declaration', 'local_function_statement'],
  },
};

export function isLanguageSupported(language: string): boolean {
  return language in LANGUAGE_CONFIGS;
}