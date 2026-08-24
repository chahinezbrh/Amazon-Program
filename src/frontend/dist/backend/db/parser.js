"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.isLanguageSupported = isLanguageSupported;
exports.parseFile = parseFile;
const languageConfigs_1 = require("./languageConfigs");
const fs_1 = __importDefault(require("fs"));
const tree_sitter_1 = __importDefault(require("tree-sitter"));
function isLanguageSupported(language) {
    return language in languageConfigs_1.LANGUAGE_CONFIGS;
}
function parseFile(file) {
    const config = languageConfigs_1.LANGUAGE_CONFIGS[file.language];
    if (!config)
        return []; // if not isntalled skip
    const sourceCode = fs_1.default.readFileSync(file.path, 'utf-8');
    const parser = new tree_sitter_1.default();
    parser.setLanguage(config.grammar);
    const tree = parser.parse(sourceCode);
    const results = [];
    function visit(node) {
        if (config.functionNodeTypes.includes(node.type)) {
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
