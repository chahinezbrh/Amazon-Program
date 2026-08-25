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
exports.getDocManagerEntries = getDocManagerEntries;
const vscode = __importStar(require("vscode"));
const path = __importStar(require("path"));
/**
 * docManagerReader.ts
 * ------------------------------------------------------------------
 * The native hover's "no voice memory" message must reflect ONLY what's
 * recorded locally in the workspace's `.docmanager` folder — it must not
 * depend on the network doc client (docClient.ts / getDocsForSymbol),
 * which can be slow, offline, or out of sync with what's on disk.
 *
 * ASSUMPTION — adjust to match your actual .docmanager layout:
 * one JSON file per source file, mirroring its relative path, e.g.
 *
 *   <workspaceRoot>/.docmanager/src/utils/parser.ts.json
 *
 * containing an array of DocEntry objects for every symbol documented
 * in that file:
 *
 *   [
 *     { "type": "voice", "symbolName": "parseInput", "durationSeconds": 47, "content": "..." },
 *     { "type": "written", "symbolName": "parseInput", "content": "..." }
 *   ]
 *
 * If your .docmanager folder is structured differently (e.g. one file
 * per symbol, or a single index.json), only `readDocManagerFile` below
 * needs to change — everything else stays the same.
 * ------------------------------------------------------------------
 */
function getDocManagerFileUri(meta) {
    const workspaceFolder = vscode.workspace.getWorkspaceFolder(vscode.Uri.file(meta.filePath));
    if (!workspaceFolder)
        return undefined;
    const relativePath = path.relative(workspaceFolder.uri.fsPath, meta.filePath);
    return vscode.Uri.joinPath(workspaceFolder.uri, '.docmanager', `${relativePath}.json`);
}
async function readDocManagerFile(uri) {
    try {
        const raw = await vscode.workspace.fs.readFile(uri);
        const parsed = JSON.parse(Buffer.from(raw).toString('utf8'));
        return Array.isArray(parsed) ? parsed : [];
    }
    catch {
        // File doesn't exist yet, or isn't valid JSON — treat as "nothing recorded".
        return [];
    }
}
/**
 * Returns only the doc entries for `meta.symbolName`, read exclusively
 * from the local `.docmanager` folder. Never throws, never hits the network.
 */
async function getDocManagerEntries(meta) {
    const fileUri = getDocManagerFileUri(meta);
    if (!fileUri)
        return [];
    const entries = await readDocManagerFile(fileUri);
    return entries.filter((e) => e.symbolName === meta.symbolName);
}
