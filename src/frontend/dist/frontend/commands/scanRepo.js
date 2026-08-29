"use strict";
// src/frontend/commands/scanRepo.ts
//
// Walks every source file in the repo, reads the documentation comment above
// each function, and writes them into .docmanager/docs.json as 'source' entries.
//
// Runs in the extension host rather than the service layer because the exact
// start line of each function comes from VS Code's language servers
// (executeDocumentSymbolProvider), which regex-based detection can't match.
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
exports.scanRepo = scanRepo;
const vscode = __importStar(require("vscode"));
const commentExtractor_1 = require("../../backend/services/commentExtractor");
const docFileStore_1 = require("../../backend/services/docFileStore");
const DocPanelProvider_1 = require("../providers/DocPanelProvider");
const docClient_1 = require("../services/docClient");
const SOURCE_GLOB = '**/*.{js,jsx,mjs,cjs,ts,tsx,py,java,cs,cpp,cc,h,hpp,c,go,rs,php,rb,kt,swift,scala,dart,lua}';
const IGNORE = '**/{node_modules,out,dist,build,.git,.docmanager}/**';
const DOCUMENTABLE_KINDS = new Set([
    vscode.SymbolKind.Function,
    vscode.SymbolKind.Method,
    vscode.SymbolKind.Constructor,
    vscode.SymbolKind.Class,
]);
/** A scan walks every source file, so it is slow enough that a double-click
 *  would otherwise start a second run. Two concurrent scans do a
 *  read-modify-write of the same docs.json and the slower one wins, silently
 *  discarding the other's results. */
let running = false;
async function scanRepo() {
    if (running)
        return;
    running = true;
    try {
        await run();
    }
    finally {
        running = false;
    }
}
async function run() {
    const folder = vscode.workspace.workspaceFolders?.[0];
    if (!folder) {
        vscode.window.showErrorMessage('Doc Manager: open a folder first.');
        return;
    }
    const repoRoot = folder.uri.fsPath;
    await vscode.window.withProgress({ location: vscode.ProgressLocation.Notification, title: 'Doc Manager' }, async (progress) => {
        const files = await vscode.workspace.findFiles(SOURCE_GLOB, IGNORE);
        if (files.length === 0) {
            vscode.window.showInformationMessage('Doc Manager: no source files found.');
            return;
        }
        const doc = await (0, docFileStore_1.readDocFile)(repoRoot);
        let found = 0;
        let scanned = 0;
        for (const uri of files) {
            scanned++;
            progress.report({
                message: `Reading comments… (${scanned}/${files.length})`,
            });
            const results = await scanFile(uri);
            if (results.length === 0)
                continue;
            const fileKey = (0, docFileStore_1.relativeKeyFor)(repoRoot, uri.fsPath);
            const fileDocs = doc.files[fileKey] ?? {};
            for (const { name, startLine, endLine, source } of results) {
                const existing = fileDocs[name] ?? {
                    name,
                    lineStart: startLine,
                    lineEnd: endLine,
                    hash: 'STUB_HASH',
                    memories: [],
                };
                // Replace rather than append: re-scanning after editing a comment
                // should update the entry, not stack a second copy on top. Line
                // numbers are refreshed too, since code moves between scans.
                fileDocs[name] = {
                    ...existing,
                    lineStart: startLine,
                    lineEnd: endLine,
                    memories: existing.memories ?? [],
                    sourceDoc: source,
                };
                found++;
            }
            doc.files[fileKey] = fileDocs;
        }
        if (found === 0) {
            vscode.window.showInformationMessage('Doc Manager: no documented functions found.');
            return;
        }
        progress.report({ message: 'Writing docs.json…' });
        await (0, docFileStore_1.writeDocFile)(repoRoot, doc);
        await refreshOpenPanel();
        vscode.window.showInformationMessage(`Doc Manager: imported comments from ${found} function${found === 1 ? '' : 's'}.`);
    });
}
async function scanFile(uri) {
    const symbols = await vscode.commands.executeCommand('vscode.executeDocumentSymbolProvider', uri);
    if (!symbols?.length)
        return [];
    const document = await vscode.workspace.openTextDocument(uri);
    const lines = document.getText().split('\n');
    const results = [];
    walk(symbols, (symbol) => {
        if (!DOCUMENTABLE_KINDS.has(symbol.kind))
            return;
        const comment = (0, commentExtractor_1.extractCommentAbove)(lines, symbol.range.start.line);
        if (!comment)
            return;
        results.push({
            name: symbol.name,
            startLine: symbol.range.start.line,
            endLine: symbol.range.end.line,
            source: {
                content: comment.content,
                commentLine: comment.startLine,
                isDocBlock: comment.isDocBlock,
                extractedAt: new Date().toISOString(),
            },
        });
    });
    return results;
}
function walk(symbols, visit) {
    for (const symbol of symbols) {
        visit(symbol);
        walk(symbol.children, visit);
    }
}
/** The panel shows one symbol; a scan is repo-wide. Re-reading the current
 *  symbol may well show no change — that is correct, not a failure. */
async function refreshOpenPanel() {
    const panel = DocPanelProvider_1.DocPanelProvider.currentPanel;
    if (!panel)
        return;
    try {
        panel.updateEntries(await (0, docClient_1.getDocsForSymbol)(panel.getCurrentMeta()));
    }
    catch {
        // A failed refresh should not fail the scan — the import already landed.
    }
}
