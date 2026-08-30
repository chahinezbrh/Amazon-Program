"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.LANGUAGE_CONFIGS = void 0;
exports.ensureEngineInitialized = ensureEngineInitialized;
exports.ensureLanguageConfigsLoaded = ensureLanguageConfigsLoaded;
const path = __importStar(require("path"));
const web_tree_sitter_1 = __importDefault(require("web-tree-sitter"));
const fs_1 = __importDefault(require("fs"));
// Path to each language's prebuilt .wasm grammar, shipped by tree-sitter-wasms.
// require.resolve locates the actual installed package on disk regardless of
// node_modules nesting, so this doesn't hardcode a relative path guess.
function wasmPathFor(pkgFile) {
    const resolvedPkg = require.resolve('tree-sitter-wasms/package.json');
    const wasmPath = path.join(path.dirname(resolvedPkg), 'out', pkgFile);
    console.log('[languageConfigs] resolved tree-sitter-wasms package.json at:', resolvedPkg);
    console.log('[languageConfigs] computed wasm path:', wasmPath);
    console.log('[languageConfigs] file exists on disk:', fs_1.default.existsSync(wasmPath));
    return wasmPath;
}
const rawConfigs = {
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
exports.LANGUAGE_CONFIGS = {};
let engineInitPromise = null;
/** Loads the core WASM engine. Single source of truth for this — parser.ts
 *  and changeClassifier.ts import THIS instead of keeping their own
 *  separate copy, so engine init always happens exactly once and always
 *  before any Language.load() call, regardless of which function (parser.ts's
 *  isLanguageSupported vs parseFile, or changeClassifier.ts) is called first. */
function ensureEngineInitialized() {
    if (!engineInitPromise) {
        engineInitPromise = web_tree_sitter_1.default.init();
    }
    return engineInitPromise;
}
let loadPromise = null;
/** Loads every available .wasm grammar into LANGUAGE_CONFIGS. Safe to call
 *  many times — only does the actual work once, subsequent calls reuse the
 *  same in-flight/completed promise. Must resolve before isLanguageSupported
 *  or any parseFile call can return correct results. */
function ensureLanguageConfigsLoaded() {
    if (loadPromise)
        return loadPromise;
    loadPromise = (async () => {
        // Engine MUST be ready before any Language.load() call. Previously,
        // isLanguageSupported() called this function directly without the
        // engine ever having been initialized first — every Language.load()
        // below threw, was swallowed silently, and LANGUAGE_CONFIGS stayed
        // empty for the whole session, making every file look unsupported.
        await ensureEngineInitialized();
        for (const [languageName, { wasmFile, functionNodeTypes }] of Object.entries(rawConfigs)) {
            const wasmPath = wasmPathFor(wasmFile);
            if (!fs_1.default.existsSync(wasmPath)) {
                console.error(`[languageConfigs] Missing wasm file for ${languageName} at ${wasmPath}`);
                continue;
            }
            try {
                const language = await web_tree_sitter_1.default.Language.load(wasmPath); // ← Parser.Language, not bare Language
                exports.LANGUAGE_CONFIGS[languageName] = { language, functionNodeTypes };
            }
            catch (err) {
                console.error(`[languageConfigs] Failed to load grammar for ${languageName}:`, err instanceof Error ? err.message : err);
                console.error(err);
            }
        }
    })();
    return loadPromise;
}
