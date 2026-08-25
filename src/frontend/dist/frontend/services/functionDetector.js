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
Object.defineProperty(exports, "__esModule", { value: true });
exports.detectFunctionAtPosition = detectFunctionAtPosition;
const vscode = __importStar(require("vscode"));
const FUNCTION_KINDS = new Set([
    vscode.SymbolKind.Function,
    vscode.SymbolKind.Method,
    vscode.SymbolKind.Constructor,
]);
const JS_LIKE_PATTERNS = [
    /^\s*(?:export\s+)?(?:default\s+)?(?:async\s+)?function\s*\*?\s*([A-Za-z_$][A-Za-z0-9_$]*)\s*[(<]/,
    /^\s*(?:export\s+)?(?:const|let|var)\s+([A-Za-z_$][A-Za-z0-9_$]*)\s*=\s*(?:async\s*)?(?:\([^)]*\)|[A-Za-z_$][A-Za-z0-9_$]*)\s*=>/,
    /^\s*(?:export\s+)?(?:const|let|var)\s+([A-Za-z_$][A-Za-z0-9_$]*)\s*=\s*(?:async\s*)?function\s*\*?\s*(?:[A-Za-z_$][A-Za-z0-9_$]*)?\s*\(/,
    /^\s*(?:public|private|protected|static|readonly|async|\s)*([A-Za-z_$][A-Za-z0-9_$]*)\s*(?:<[^>]*>)?\s*\([^)]*\)\s*(?::\s*[^;{]+)?\s*\{?/,
];
const FALLBACK_PATTERNS = {
    python: [/^\s*(?:async\s+)?def\s+([A-Za-z_][A-Za-z0-9_]*)\s*[(:]/],
    javascript: JS_LIKE_PATTERNS,
    typescript: JS_LIKE_PATTERNS,
    javascriptreact: JS_LIKE_PATTERNS,
    typescriptreact: JS_LIKE_PATTERNS,
    go: [/^\s*func\s+(?:\([^)]*\)\s*)?([A-Za-z_][A-Za-z0-9_]*)\s*(?:\[[^\]]*\])?\s*\(/],
    rust: [/^\s*(?:pub(?:\([^)]*\))?\s+)?(?:async\s+)?(?:unsafe\s+)?(?:extern\s+(?:"[^"]*"\s+)?)?fn\s+([A-Za-z_][A-Za-z0-9_]*)\s*[(<]/],
    ruby: [/^\s*def\s+(?:self\.)?([A-Za-z_][A-Za-z0-9_?!=]*)/],
    php: [/^\s*(?:public|private|protected|static|final|\s)*function\s+([A-Za-z_][A-Za-z0-9_]*)\s*\(/],
    java: [/^\s*(?:public|private|protected|static|final|native|synchronized|abstract|\s)*[\w<>\[\],\s]+\s+([A-Za-z_][A-Za-z0-9_]*)\s*\([^;{]*\)/],
    csharp: [/^\s*(?:public|private|protected|internal|static|async|override|virtual|abstract|sealed|\s)*[\w<>\[\],\s]+\s+([A-Za-z_][A-Za-z0-9_]*)\s*(?:<[^>]*>)?\s*\(/],
    cpp: [/^\s*(?:(?:inline|static|virtual|explicit|friend|constexpr)\s+)*(?:[\w:*&<>]+\s+)+([A-Za-z_][A-Za-z0-9_]*)\s*\([^;{]*\)/],
    c: [/^\s*(?:(?:inline|static)\s+)*(?:[\w:*&<>]+\s+)+([A-Za-z_][A-Za-z0-9_]*)\s*\([^;{]*\)/],
    kotlin: [/^\s*(?:public|private|protected|internal|suspend|override|fun|\s)*fun\s+(?:<[^>]*>\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*\(/],
    swift: [/^\s*(?:public|private|fileprivate|internal|open|static|class|override|mutating|async|\s)*func\s+([A-Za-z_][A-Za-z0-9_]*)\s*[(<]/],
};
const GENERIC_PATTERNS = [
    /(?:function|def|func|fn|fun|sub)\s+([A-Za-z_$][A-Za-z0-9_$]*)\s*[(<:]/,
];
/**
 * Detects whether the cursor/hover position is on a function declaration's name.
 * Returns information about the detected function, or null if position is not on a function name.
 */
async function detectFunctionAtPosition(document, position) {
    const viaSymbols = await detectViaSymbolProvider(document, position);
    if (viaSymbols)
        return viaSymbols;
    // Fallback to pattern matching across languages
    return detectViaFallbackPattern(document, position);
}
async function detectViaSymbolProvider(document, position) {
    let symbols;
    try {
        symbols = await vscode.commands.executeCommand('vscode.executeDocumentSymbolProvider', document.uri);
    }
    catch {
        return null;
    }
    if (!symbols || !Array.isArray(symbols) || symbols.length === 0)
        return null;
    return searchSymbols(symbols, position, document);
}
/**
 * Recursively inspect DocumentSymbols / SymbolInformation to find the function
 * whose name token contains the position.
 */
function searchSymbols(symbols, position, document) {
    for (const sym of symbols) {
        if ('selectionRange' in sym && 'range' in sym) {
            // DocumentSymbol branch
            const docSym = sym;
            if (!docSym.range.contains(position))
                continue;
            if (docSym.children && Array.isArray(docSym.children) && docSym.children.length > 0) {
                const child = searchSymbols(docSym.children, position, document);
                if (child)
                    return child;
            }
            if (docSym.selectionRange.contains(position)) {
                if (FUNCTION_KINDS.has(docSym.kind)) {
                    return {
                        name: docSym.name,
                        range: docSym.range,
                        selectionRange: docSym.selectionRange,
                    };
                }
                // Check if Variable/Property is an arrow function
                if (docSym.kind === vscode.SymbolKind.Variable ||
                    docSym.kind === vscode.SymbolKind.Property) {
                    const lineText = document.lineAt(docSym.selectionRange.start.line).text;
                    if (/(?:=>|function)/.test(lineText)) {
                        return {
                            name: docSym.name,
                            range: docSym.range,
                            selectionRange: docSym.selectionRange,
                        };
                    }
                }
            }
            return null;
        }
        else if ('location' in sym) {
            // SymbolInformation branch
            const infoSym = sym;
            if (infoSym.location && infoSym.location.range.contains(position)) {
                if (FUNCTION_KINDS.has(infoSym.kind)) {
                    const wordRange = document.getWordRangeAtPosition(position, /[A-Za-z_$][A-Za-z0-9_$]*/);
                    if (wordRange) {
                        const word = document.getText(wordRange);
                        // Symbol names may include signature like 'myFunc(arg)', extract identifier
                        const cleanName = infoSym.name.split('(')[0].trim();
                        if (word === cleanName) {
                            return {
                                name: cleanName,
                                range: infoSym.location.range,
                                selectionRange: wordRange,
                            };
                        }
                    }
                }
            }
        }
    }
    return null;
}
function detectViaFallbackPattern(document, position) {
    const patterns = FALLBACK_PATTERNS[document.languageId] ?? GENERIC_PATTERNS;
    const wordRange = document.getWordRangeAtPosition(position, /[A-Za-z_$][A-Za-z0-9_$]*/);
    if (!wordRange)
        return null;
    const word = document.getText(wordRange);
    const line = document.lineAt(position.line);
    for (const pattern of patterns) {
        const match = pattern.exec(line.text);
        if (!match || match[1] !== word)
            continue;
        const nameStart = line.text.indexOf(word, match.index);
        if (nameStart === -1)
            continue;
        const selectionRange = new vscode.Range(position.line, nameStart, position.line, nameStart + word.length);
        if (!selectionRange.contains(position))
            continue;
        const range = new vscode.Range(position.line, 0, position.line, line.text.length);
        return { name: word, range, selectionRange };
    }
    return null;
}
