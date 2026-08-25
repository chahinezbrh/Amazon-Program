"use strict";
// src/frontend/providers/RecordPanelProvider.ts
//
// Hosts the recording webview.
//
// Recording MUST happen in a webview: MediaRecorder and getUserMedia are
// browser APIs, and the extension host is plain Node with no microphone
// access. The captured audio crosses back as base64 over postMessage, which is
// the only route across the webview boundary without a local server.
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
exports.RecordPanelProvider = void 0;
const vscode = __importStar(require("vscode"));
const audioStore_1 = require("../../backend/services/audioStore");
const docClient_1 = require("../services/docClient");
const DocPanelProvider_1 = require("./DocPanelProvider");
class RecordPanelProvider {
    static show(extensionUri, meta) {
        // Only one recorder at a time: two open panels would both hold the
        // microphone, and the second getUserMedia call typically fails.
        RecordPanelProvider.current?.panel.dispose();
        const panel = vscode.window.createWebviewPanel(RecordPanelProvider.viewType, `Record: ${meta.symbolName}`, { viewColumn: vscode.ViewColumn.Beside, preserveFocus: false }, {
            enableScripts: true,
            // Deliberately false: a retained panel keeps the microphone stream
            // alive in the background, leaving the OS recording indicator lit.
            retainContextWhenHidden: false,
            localResourceRoots: [
                vscode.Uri.joinPath(extensionUri, 'dist', 'webview', 'recordPanel'),
            ],
        });
        RecordPanelProvider.current = new RecordPanelProvider(panel, extensionUri, meta);
    }
    constructor(panel, extensionUri, meta) {
        this.disposables = [];
        this.panel = panel;
        this.extensionUri = extensionUri;
        this.meta = meta;
        this.panel.webview.html = this.getHtml(panel.webview);
        this.panel.onDidDispose(() => this.dispose(), null, this.disposables);
        this.panel.webview.onDidReceiveMessage((message) => this.handleMessage(message), null, this.disposables);
    }
    async handleMessage(message) {
        switch (message.type) {
            case 'ready':
                this.panel.webview.postMessage({ type: 'meta', payload: this.meta });
                break;
            case 'cancel':
                this.panel.dispose();
                break;
            case 'recorded':
                await this.persist(message);
                break;
        }
    }
    async persist(message) {
        const folder = vscode.workspace.getWorkspaceFolder(vscode.Uri.file(this.meta.filePath));
        if (!folder) {
            vscode.window.showErrorMessage('Doc Manager: this file is outside the workspace.');
            return;
        }
        // Optional note. Whisper or VS Code Speech could fill this automatically
        // later — the transcript field is already in the storage format.
        const transcript = await vscode.window.showInputBox({
            prompt: 'Add a short transcript or note (optional)',
            placeHolder: 'What does this recording explain?',
        });
        try {
            const id = `${Date.now().toString(36)}${Math.random()
                .toString(36)
                .slice(2, 8)}`;
            const extension = message.mimeType.includes('ogg') ? 'ogg' : 'webm';
            const audioUrl = await (0, audioStore_1.saveAudio)(folder.uri.fsPath, id, message.base64, extension);
            await (0, docClient_1.saveDoc)({
                type: 'voice',
                meta: this.meta,
                audioUrl,
                author: (0, docClient_1.currentAuthor)(),
                durationSec: Math.round(message.durationSec),
                ...(transcript ? { transcript } : {}),
            });
            this.panel.dispose();
            // Push the new memory straight into the open doc panel.
            const doc = DocPanelProvider_1.DocPanelProvider.currentPanel;
            if (doc)
                doc.updateEntries(await (0, docClient_1.getDocsForSymbol)(this.meta));
            vscode.window.showInformationMessage(`Doc Manager: voice memo saved for ${this.meta.symbolName}.`);
        }
        catch (err) {
            vscode.window.showErrorMessage(`Doc Manager: could not save recording — ${err instanceof Error ? err.message : 'unknown error'}`);
        }
    }
    getHtml(webview) {
        const base = vscode.Uri.joinPath(this.extensionUri, 'dist', 'webview', 'recordPanel');
        const cssUri = webview.asWebviewUri(vscode.Uri.joinPath(base, 'recordPanel.css'));
        const jsUri = webview.asWebviewUri(vscode.Uri.joinPath(base, 'recordPanel.js'));
        const nonce = getNonce();
        // media-src blob: is required for the local playback preview — without it
        // the CSP blocks the object URL and the preview is silently empty.
        return /* html */ `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta http-equiv="Content-Security-Policy"
    content="default-src 'none';
             media-src blob:;
             style-src ${webview.cspSource} 'unsafe-inline';
             script-src 'nonce-${nonce}';" />
  <link href="${cssUri}" rel="stylesheet" />
  <title>Record</title>
</head>
<body>
  <div id="root"></div>
  <script nonce="${nonce}" src="${jsUri}"></script>
</body>
</html>`;
    }
    dispose() {
        RecordPanelProvider.current = undefined;
        this.panel.dispose();
        while (this.disposables.length)
            this.disposables.pop()?.dispose();
    }
}
exports.RecordPanelProvider = RecordPanelProvider;
RecordPanelProvider.viewType = 'docManager.recordPanel';
function getNonce() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let text = '';
    for (let i = 0; i < 32; i++) {
        text += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return text;
}
