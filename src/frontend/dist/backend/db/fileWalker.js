"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.walk = walk;
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
//sourced from GitHub's own language-detection tool
const IGNORE_DIRS = new Set(['node_modules', '.git', 'dist', 'build', 'vendor', '__pycache__', 'target']);
const EXTENSION_TO_LANGUAGE = new Map();
function initLanguageMap() {
    try {
        const languageMap = require('language-map');
        for (const [langName, langData] of Object.entries(languageMap)) {
            if (langData.type === 'programming' && langData.extensions) {
                for (const ext of langData.extensions) {
                    EXTENSION_TO_LANGUAGE.set(ext.toLowerCase(), langName);
                }
            }
        }
    }
    catch {
        // Fallback for common languages if language-map is not yet installed in frontend
        const fallback = {
            '.js': 'JavaScript',
            '.jsx': 'JavaScript',
            '.mjs': 'JavaScript',
            '.cjs': 'JavaScript',
            '.ts': 'TypeScript',
            '.tsx': 'TSX',
            '.py': 'Python',
            '.java': 'Java',
            '.go': 'Go',
            '.rb': 'Ruby',
            '.php': 'PHP',
            '.rs': 'Rust',
            '.c': 'C',
            '.cpp': 'C++',
            '.cs': 'C#',
            '.kt': 'Kotlin',
            '.swift': 'Swift',
        };
        for (const [ext, lang] of Object.entries(fallback)) {
            EXTENSION_TO_LANGUAGE.set(ext, lang);
        }
    }
}
initLanguageMap();
function walk(dir, files = []) {
    //this is a recursive call so the function descends with the extracted files
    //and the result of each call is pushed into an array so it won't be lost 
    for (const entry of fs_1.default.readdirSync(dir, { withFileTypes: true })) {
        if (IGNORE_DIRS.has(entry.name))
            continue;
        const fullPath = path_1.default.join(dir, entry.name); //the entry name is the file name
        //this one creates the complete path of the file
        if (entry.isDirectory()) {
            walk(fullPath, files);
            //in case it;s a directory another call for the walk function to extract the contained files
        }
        else {
            const ext = path_1.default.extname(entry.name).toLowerCase();
            //if it's not a directory extract its extension
            const language = EXTENSION_TO_LANGUAGE.get(ext);
            if (language) {
                files.push({ path: fullPath, language });
            }
        }
    }
    return files;
}
