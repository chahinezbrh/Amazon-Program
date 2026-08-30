"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const web_tree_sitter_1 = __importDefault(require("web-tree-sitter"));
const path_1 = __importDefault(require("path"));
async function main() {
    await web_tree_sitter_1.default.init();
    const wasmPath = path_1.default.join(__dirname, 'node_modules', 'tree-sitter-wasms', 'out', 'tree-sitter-javascript.wasm');
    const lang = await web_tree_sitter_1.default.Language.load(wasmPath);
    console.log('Loaded successfully:', lang);
}
main().catch((err) => console.error('Failed:', err));
