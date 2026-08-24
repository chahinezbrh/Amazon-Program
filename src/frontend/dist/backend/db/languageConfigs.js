"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.LANGUAGE_CONFIGS = void 0;
// Each entry attempts to require its grammar package.
// If the package isn't installed, the require throws — we catch it
// and simply leave that language out of the map, instead of crashing.
function tryLoadGrammar(loader) {
    try {
        return loader();
    }
    catch {
        return null; // package not installed yet — safe to skip
    }
}
const rawConfigs = {
    JavaScript: {
        loader: () => require('tree-sitter-javascript'),
        functionNodeTypes: ['function_declaration', 'method_definition', 'arrow_function'],
    },
    TypeScript: {
        loader: () => require('tree-sitter-typescript').typescript,
        functionNodeTypes: ['function_declaration', 'method_definition', 'arrow_function'],
    },
    TSX: {
        loader: () => require('tree-sitter-typescript').tsx,
        functionNodeTypes: ['function_declaration', 'method_definition', 'arrow_function'],
    },
    Python: {
        loader: () => require('tree-sitter-python'),
        functionNodeTypes: ['function_definition'],
    },
    Java: {
        loader: () => require('tree-sitter-java'),
        functionNodeTypes: ['method_declaration'],
    },
    Go: {
        loader: () => require('tree-sitter-go'),
        functionNodeTypes: ['function_declaration', 'method_declaration'],
    },
    Ruby: {
        loader: () => require('tree-sitter-ruby'),
        functionNodeTypes: ['method'],
    },
    PHP: {
        loader: () => require('tree-sitter-php').php,
        functionNodeTypes: ['function_definition', 'method_declaration'],
    },
    Rust: {
        loader: () => require('tree-sitter-rust'),
        functionNodeTypes: ['function_item'],
    },
    C: {
        loader: () => require('tree-sitter-c'),
        functionNodeTypes: ['function_definition'],
    },
    'C++': {
        loader: () => require('tree-sitter-cpp'),
        functionNodeTypes: ['function_definition'],
    },
    'C#': {
        loader: () => require('tree-sitter-c-sharp'),
        functionNodeTypes: ['method_declaration', 'local_function_statement'],
    },
    Kotlin: {
        loader: () => require('tree-sitter-kotlin'),
        functionNodeTypes: ['function_declaration'],
    },
    Swift: {
        loader: () => require('tree-sitter-swift'),
        functionNodeTypes: ['function_declaration'],
    },
};
// Build the final map, skipping any language whose package isn't installed
exports.LANGUAGE_CONFIGS = {};
for (const [language, { loader, functionNodeTypes }] of Object.entries(rawConfigs)) {
    const grammar = tryLoadGrammar(loader);
    if (grammar) {
        exports.LANGUAGE_CONFIGS[language] = { grammar, functionNodeTypes };
    }
}
