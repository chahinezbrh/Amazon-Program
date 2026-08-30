"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.isLanguageSupported = isLanguageSupported;
exports.parseFile = parseFile;
const languageConfigs_1 = require("./languageConfigs");
const fs_1 = __importDefault(require("fs"));
const web_tree_sitter_1 = __importDefault(require("web-tree-sitter")); // ← default import, not { Parser }
let engineInitPromise = null;
/** Initializes the core WASM engine once. Must happen before any Parser is
 *  constructed — web-tree-sitter's Parser.init() loads tree-sitter.wasm
 *  itself, separate from any individual language grammar. */
function ensureEngineInitialized() {
    if (!engineInitPromise) {
        engineInitPromise = web_tree_sitter_1.default.init();
    }
    return engineInitPromise;
}
async function isLanguageSupported(language) {
    await (0, languageConfigs_1.ensureLanguageConfigsLoaded)(); // now internally guarantees engine init too
    return language in languageConfigs_1.LANGUAGE_CONFIGS;
}
async function parseFile(file) {
    await ensureEngineInitialized();
    await (0, languageConfigs_1.ensureLanguageConfigsLoaded)();
    const config = languageConfigs_1.LANGUAGE_CONFIGS[file.language];
    if (!config)
        return []; // grammar not available — skip, same as before
    const { language, functionNodeTypes } = config;
    const sourceCode = fs_1.default.readFileSync(file.path, 'utf-8');
    const parser = new web_tree_sitter_1.default();
    parser.setLanguage(language);
    const tree = parser.parse(sourceCode);
    if (!tree)
        return [];
    const results = [];
    function visit(node) {
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
