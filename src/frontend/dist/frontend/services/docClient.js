"use strict";
// src/frontend/services/docClient.ts
//
// With docs stored as files in the repo, there is no server: the extension host
// reads and writes them directly.
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
exports.hashSymbol = hashSymbol;
exports.currentAuthor = currentAuthor;
exports.getDocsForSymbol = getDocsForSymbol;
exports.saveDoc = saveDoc;
const vscode = __importStar(require("vscode"));
const docService = __importStar(require("../../backend/services/docService"));
/**
 * TEMPORARY STUB.
 *
 * Rayhane's change-detection module already hashes function bodies; this will
 * be replaced by a call into it rather than a second implementation, since two
 * different normalisations would make every doc report as permanently stale.
 *
 * Returning a constant (not null, not empty) keeps codeHash a plain string, so
 * every stored `writtenAtHash` / `hashAtRecording` equals the current `hash` and
 * everything reads isStale: false. Staleness can still be exercised by editing
 * a hash by hand in a .docmanager JSON file.
 */
const STUB_HASH = 'STUB_HASH';
async function hashSymbol(_meta) {
    return STUB_HASH;
}
function repoRootFor(filePath) {
    const folder = vscode.workspace.getWorkspaceFolder(vscode.Uri.file(filePath));
    if (!folder) {
        throw new Error('This file is not inside an open workspace folder.');
    }
    return folder.uri.fsPath;
}
function currentAuthor() {
    return (vscode.workspace.getConfiguration('docManager').get('author') ??
        'Unknown');
}
async function getDocsForSymbol(meta) {
    return docService.getDocsForSymbol(repoRootFor(meta.filePath), meta);
}
async function saveDoc(request) {
    const codeHash = await hashSymbol(request.meta);
    return docService.saveDoc(repoRootFor(request.meta.filePath), {
        ...request,
        codeHash,
    });
}
