import * as path from 'path';
import Parser from 'web-tree-sitter';
import fs from 'fs';

export interface LanguageConfig {
  language: InstanceType<typeof Parser.Language>; // loaded WASM grammar, not a native binding
  functionNodeTypes: string[];
}

// Path to each language's prebuilt .wasm grammar, shipped by tree-sitter-wasms.
// require.resolve locates the actual installed package on disk regardless of
// node_modules nesting, so this doesn't hardcode a relative path guess.
function wasmPathFor(pkgFile: string): string {
  const resolvedPkg = require.resolve('tree-sitter-wasms/package.json');
  const wasmPath = path.join(path.dirname(resolvedPkg), 'out', pkgFile);
  console.log('[languageConfigs] resolved tree-sitter-wasms package.json at:', resolvedPkg);
  console.log('[languageConfigs] computed wasm path:', wasmPath);
  console.log('[languageConfigs] file exists on disk:', fs.existsSync(wasmPath));
  return wasmPath;
}

const rawConfigs: Record<string, { wasmFile: string; functionNodeTypes: string[] }> = {
  JavaScript: {
    wasmFile: 'tree-sitter-javascript.wasm',
    functionNodeTypes: ['function_declaration', 'method_definition', 'arrow_function'],
  },
  TypeScript: {
    wasmFile: 'tree-sitter-typescript.wasm',
    functionNodeTypes: ['function_declaration', 'method_definition', 'arrow_function'],
  },
  TSX: {
    wasmFile: 'tree-sitter-tsx.wasm',
    functionNodeTypes: ['function_declaration', 'method_definition', 'arrow_function'],
  },
  Python: {
    wasmFile: 'tree-sitter-python.wasm',
    functionNodeTypes: ['function_definition'],
  },
  Java: {
    wasmFile: 'tree-sitter-java.wasm',
    functionNodeTypes: ['method_declaration'],
  },
  Go: {
    wasmFile: 'tree-sitter-go.wasm',
    functionNodeTypes: ['function_declaration', 'method_declaration'],
  },
  Ruby: {
    wasmFile: 'tree-sitter-ruby.wasm',
    functionNodeTypes: ['method'],
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
  'C#': {
    wasmFile: 'tree-sitter-c_sharp.wasm', // tree-sitter-wasms uses an underscore here, not a hyphen
    functionNodeTypes: ['method_declaration', 'local_function_statement'],
  },

};

// Populated lazily by ensureLanguageConfigsLoaded() — empty until then, since
// loading a .wasm grammar is inherently async and this module can't top-level-await.
export const LANGUAGE_CONFIGS: Record<string, LanguageConfig> = {};

let engineInitPromise: Promise<void> | null = null;

/** Loads the core WASM engine. Single source of truth for this — parser.ts
 *  and changeClassifier.ts import THIS instead of keeping their own
 *  separate copy, so engine init always happens exactly once and always
 *  before any Language.load() call, regardless of which function (parser.ts's
 *  isLanguageSupported vs parseFile, or changeClassifier.ts) is called first. */
export function ensureEngineInitialized(): Promise<void> {
  if (!engineInitPromise) {
    engineInitPromise = Parser.init();
  }
  return engineInitPromise;
}

let loadPromise: Promise<void> | null = null;

/** Loads every available .wasm grammar into LANGUAGE_CONFIGS. Safe to call
 *  many times — only does the actual work once, subsequent calls reuse the
 *  same in-flight/completed promise. Must resolve before isLanguageSupported
 *  or any parseFile call can return correct results. */
export function ensureLanguageConfigsLoaded(): Promise<void> {
  if (loadPromise) return loadPromise;

  loadPromise = (async () => {
    // Engine MUST be ready before any Language.load() call. Previously,
    // isLanguageSupported() called this function directly without the
    // engine ever having been initialized first — every Language.load()
    // below threw, was swallowed silently, and LANGUAGE_CONFIGS stayed
    // empty for the whole session, making every file look unsupported.
    await ensureEngineInitialized();

    for (const [languageName, { wasmFile, functionNodeTypes }] of Object.entries(rawConfigs)) {

      const wasmPath = wasmPathFor(wasmFile);
      if (!fs.existsSync(wasmPath)) {
        console.error(`[languageConfigs] Missing wasm file for ${languageName} at ${wasmPath}`);
        continue;
      }

      try {
        const language = await Parser.Language.load(wasmPath); // ← Parser.Language, not bare Language
        LANGUAGE_CONFIGS[languageName] = { language, functionNodeTypes };
      } catch (err) {
        console.error(`[languageConfigs] Failed to load grammar for ${languageName}:`, err instanceof Error ? err.message : err);
        console.error(err);
      }
    }
  })();

  return loadPromise;
}