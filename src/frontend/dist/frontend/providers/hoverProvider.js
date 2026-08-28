"use strict";
// src/frontend/providers/hoverProvider.ts
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
exports.HoverProvider = void 0;
const vscode = __importStar(require("vscode"));
const docClient_1 = require("../services/docClient");
/** Symbol kinds we attach documentation to. Variables are included because
 *  `const parse = () => {}` is reported as a Variable, not a Function. */
const DOCUMENTABLE_KINDS = new Set([
    vscode.SymbolKind.Function,
    vscode.SymbolKind.Method,
    vscode.SymbolKind.Constructor,
    vscode.SymbolKind.Variable,
]);
class HoverProvider {
    async provideHover(document, position) {
        const symbols = await vscode.commands.executeCommand('vscode.executeDocumentSymbolProvider', document.uri);
        if (!symbols?.length)
            return null;
        // Returns null unless the cursor is on the NAME itself, so hovering
        // `function`, a parameter, or anything in the body shows nothing at all
        // rather than an unhelpful "no docs available".
        const symbol = findSymbolByName(symbols, position);
        if (!symbol)
            return null;
        const meta = {
            symbolName: symbol.name,
            filePath: document.uri.fsPath,
            startLine: symbol.range.start.line,
            endLine: symbol.range.end.line,
        };
        let entries;
        try {
            entries = await (0, docClient_1.getDocsForSymbol)(meta);
        }
        catch {
            entries = [];
        }
        return new vscode.Hover(buildMarkdown(meta, entries), symbol.selectionRange);
    }
}
exports.HoverProvider = HoverProvider;
/**
 * Walks the symbol tree looking for a symbol whose NAME the cursor sits on.
 *
 * DocumentSymbol carries two ranges: `range` spans the whole declaration
 * (signature + body), while `selectionRange` spans just the identifier. Testing
 * `selectionRange` is what restricts the hover to the function name.
 *
 * Children are searched first so a method inside a class wins over the class.
 */
function findSymbolByName(symbols, position) {
    for (const symbol of symbols) {
        // Only descend into symbols that actually contain the cursor.
        if (symbol.range.contains(position)) {
            const child = findSymbolByName(symbol.children, position);
            if (child)
                return child;
        }
        if (DOCUMENTABLE_KINDS.has(symbol.kind) &&
            symbol.selectionRange.contains(position)) {
            return symbol;
        }
    }
    return null;
}
function buildMarkdown(meta, entries) {
    const md = new vscode.MarkdownString();
    md.isTrusted = true; // required for command: links to be clickable
    md.supportHtml = false;
    const args = encodeURIComponent(JSON.stringify(meta));
    if (entries.length === 0) {
        md.appendMarkdown(`**${meta.symbolName}** — no documentation yet\n\n`);
        md.appendMarkdown(`[Write docs](command:docManager.editDoc?${args}) · ` +
            `[Generate with AI](command:docManager.generateDoc?${args}) · ` +
            `[Record memory](command:docManager.recordDoc?${args})`);
        return md;
    }
    const counts = entries.reduce((acc, e) => {
        acc[e.type] = (acc[e.type] ?? 0) + 1;
        return acc;
    }, {});
    const summary = Object.entries(counts)
        .map(([type, n]) => (n > 1 ? `${n} ${type}` : type))
        .join(' · ');
    const stale = entries.filter((e) => e.isStale).length;
    md.appendMarkdown(`**${meta.symbolName}** — ${summary}\n\n`);
    if (stale > 0) {
        md.appendMarkdown(`$(warning) ${stale} ${stale === 1 ? 'entry has' : 'entries have'} ` +
            `gone stale since the code changed\n\n`);
        md.supportThemeIcons = true;
    }
    md.appendMarkdown(`[Full docs](command:docManager.showDocPanel?${args})`);
    return md;
}
