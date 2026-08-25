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
exports.HoverProvider = void 0;
const vscode = __importStar(require("vscode"));
const path = __importStar(require("path"));
const functionDetector_1 = require("../services/functionDetector");
const docClient_1 = require("../services/docClient");
const docManagerReader_1 = require("../services/docManagerReader");
const DocPanelProvider_1 = require("./DocPanelProvider");
const recordPanelProvider_1 = require("./recordPanelProvider");
const playMemoryProvider_1 = require("./playMemoryProvider");
const hoverIcons_1 = require("./hoverIcons");
class HoverProvider {
    constructor(context) {
        this.context = context;
        this.disposables = [];
    }
    /**
     * Called by VS Code when the user hovers over text in any document.
     * Renders the hover ONLY if hovering on a function's name.
     */
    async provideHover(document, position) {
        const detected = await (0, functionDetector_1.detectFunctionAtPosition)(document, position);
        if (!detected) {
            return null; // Not a function name — do not show hover
        }
        const meta = {
            symbolName: detected.name,
            filePath: document.uri.fsPath,
            startLine: detected.range.start.line,
            endLine: detected.range.end.line,
        };
        const args = encodeURIComponent(JSON.stringify([meta]));
        // Read voice memory state locally from .docmanager via docManagerReader
        const docManagerEntries = await (0, docManagerReader_1.getDocManagerEntries)(meta);
        const voiceDoc = docManagerEntries.find((d) => d.type === 'voice');
        const hasVoiceMemory = Boolean(voiceDoc);
        const durationSec = voiceDoc?.durationSeconds ?? 47;
        const mins = Math.floor(durationSec / 60);
        const secs = durationSec % 60;
        const formattedDuration = `${mins}:${secs < 10 ? '0' : ''}${secs}`;
        const md = new vscode.MarkdownString('', true);
        md.isTrusted = true;
        md.supportHtml = true;
        md.supportThemeIcons = true;
        // Header buttons (Top row: 3 pill buttons ONLY)
        const addMemoryBtn = `[![+ Add memory](${(0, hoverIcons_1.getAddMemorySvg)()})](command:yourExtension.recordDoc?${args})`;
        const aiDocsBtn = `[![AI docs](${(0, hoverIcons_1.getAiDocsSvg)()})](command:docManager.aiDocs?${args})`;
        const writeDocsBtn = `[![Write docs](${(0, hoverIcons_1.getWriteDocsSvg)()})](command:docManager.writeDocs?${args})`;
        md.appendMarkdown(`${addMemoryBtn}&nbsp;&nbsp;${aiDocsBtn}&nbsp;&nbsp;${writeDocsBtn}`);
        md.appendMarkdown(`\n\n---\n\n`);
        // Voice memory content (Middle section)
        if (hasVoiceMemory) {
            const labelImg = `![Voice memory](${(0, hoverIcons_1.getVoiceMemoryLabelSvg)()})`;
            const voicePill = `[![Play voice memory](${(0, hoverIcons_1.getVoiceMemorySvg)(formattedDuration)})](command:docManager.playVoice?${args})`;
            md.appendMarkdown(`${labelImg}\n\n${voicePill}\n\n`);
        }
        else {
            const noMemoryImg = `![There is no voice memory !](${(0, hoverIcons_1.getNoMemorySvg)()})`;
            md.appendMarkdown(`${noMemoryImg}\n\n`);
        }
        // Bottom footer section
        md.appendMarkdown(`---\n\n`);
        const fullDocsBtn = `[![Full Docs](${(0, hoverIcons_1.getFooterFullDocsSvg)()})](command:docManager.showDocPanel?${args})`;
        if (hasVoiceMemory) {
            const playMemoryFooterBtn = `[![Play memory](${(0, hoverIcons_1.getFooterPlayMemorySvg)()})](command:docManager.playVoice?${args})`;
            md.appendMarkdown(`&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;${playMemoryFooterBtn}&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;|&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;${fullDocsBtn}`);
        }
        else {
            md.appendMarkdown(`&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;${fullDocsBtn}`);
        }
        return new vscode.Hover(md, detected.selectionRange);
    }
    /**
     * Opens or reveals the Function Hover Popup Webview for a specific function.
     */
    async showForFunction(functionName, filePath, startLine = 0, endLine = 0) {
        const meta = {
            symbolName: functionName,
            filePath,
            startLine,
            endLine,
        };
        this.currentMeta = meta;
        const functionData = await this.fetchFunctionData(meta);
        if (this.panel) {
            this.panel.reveal(vscode.ViewColumn.Beside, true);
            this.panel.title = `Function: ${functionName}`;
            this.panel.webview.postMessage({ command: 'setData', data: functionData });
            return;
        }
        this.panel = vscode.window.createWebviewPanel('functionHoverPopup', `Function: ${functionName}`, { viewColumn: vscode.ViewColumn.Beside, preserveFocus: true }, {
            enableScripts: true,
            retainContextWhenHidden: true,
            localResourceRoots: [
                vscode.Uri.file(path.join(this.context.extensionPath, 'dist', 'webview')),
                ...(vscode.workspace.workspaceFolders?.map((f) => f.uri) ?? []),
            ],
        });
        this.panel.onDidDispose(() => {
            this.panel = undefined;
            while (this.disposables.length) {
                this.disposables.pop()?.dispose();
            }
        }, null, this.disposables);
        this.panel.webview.onDidReceiveMessage((message) => this.handleWebviewMessage(message), null, this.disposables);
        this.panel.webview.html = this.getHtml(this.panel.webview);
        setTimeout(() => {
            this.panel?.webview.postMessage({ command: 'setData', data: functionData });
        }, 200);
    }
    async handleWebviewMessage(message) {
        if (!this.currentMeta)
            return;
        switch (message.command) {
            case 'ready': {
                const functionData = await this.fetchFunctionData(this.currentMeta);
                this.panel?.webview.postMessage({ command: 'setData', data: functionData });
                break;
            }
            case 'openFullDocs': {
                DocPanelProvider_1.DocPanelProvider.show(this.context.extensionUri, this.currentMeta);
                try {
                    const entries = await (0, docClient_1.getDocsForSymbol)(this.currentMeta);
                    DocPanelProvider_1.DocPanelProvider.currentPanel?.updateEntries(entries);
                }
                catch {
                    // Fallback handled by DocPanelProvider
                }
                break;
            }
            case 'addMemory': {
                recordPanelProvider_1.RecordPanelProvider.show(this.context.extensionUri, this.currentMeta);
                break;
            }
            case 'playMemory': {
                let transcript = 'Playing memory for ' + this.currentMeta.symbolName;
                let durationSec = 47;
                try {
                    const docs = await (0, docClient_1.getDocsForSymbol)(this.currentMeta);
                    const voice = docs.find((d) => d.type === 'voice');
                    if (voice?.durationSeconds)
                        durationSec = voice.durationSeconds;
                    if (voice?.content)
                        transcript = voice.content;
                }
                catch { }
                playMemoryProvider_1.PlayMemoryProvider.show(this.context.extensionUri, {
                    functionName: this.currentMeta.symbolName,
                    filePath: this.currentMeta.filePath,
                    durationSec,
                    transcript,
                });
                break;
            }
            case 'generateAiDocs': {
                vscode.commands.executeCommand('docManager.aiDocs', this.currentMeta);
                break;
            }
            case 'writeDocs': {
                vscode.commands.executeCommand('docManager.writeDocs', this.currentMeta);
                break;
            }
            default:
                console.log('[HoverProvider] Webview message:', message);
        }
    }
    async fetchFunctionData(meta) {
        // Whether a voice memory exists — and its duration — must reflect ONLY
        // what's recorded locally in the workspace's `.docmanager` folder
        // (see docManagerReader.ts). This must not depend on the (possibly
        // slow/offline) network doc client, same as the native hover above.
        const docManagerEntries = await (0, docManagerReader_1.getDocManagerEntries)(meta);
        const voiceDoc = docManagerEntries.find((d) => d.type === 'voice');
        const hasVoiceMemory = Boolean(voiceDoc);
        const durationSec = voiceDoc?.durationSeconds ?? 47;
        // Doc count (used for "Full docs") can still come from the network
        // client — it's not what gates the "no voice memory" message.
        let docs = [];
        try {
            docs = await (0, docClient_1.getDocsForSymbol)(meta);
        }
        catch {
            docs = [];
        }
        return {
            id: meta.symbolName,
            name: meta.symbolName,
            filePath: meta.filePath,
            hasMemory: hasVoiceMemory,
            durationSec,
            docsCount: docs.length,
        };
    }
    getHtml(webview) {
        const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(this.context.extensionUri, 'dist', 'webview', 'functionHoverPopup.js'));
        const cssUri = webview.asWebviewUri(vscode.Uri.joinPath(this.context.extensionUri, 'dist', 'webview', 'functionHoverPopup.css'));
        const nonce = getNonce();
        return /* html */ `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy"
    content="default-src 'none';
             img-src ${webview.cspSource} data:;
             media-src ${webview.cspSource} blob:;
             style-src ${webview.cspSource} 'unsafe-inline' https://fonts.googleapis.com;
             font-src https://fonts.gstatic.com;
             script-src 'nonce-${nonce}';" />
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;600&display=swap">
  <link rel="stylesheet" href="${cssUri}">
  <style>
    html, body {
      margin: 0;
      padding: 0;
      background-color: #1a1d1e;
      overflow: hidden;
    }
  </style>
</head>
<body>
  <div id="root"></div>
  <script nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
    }
}
exports.HoverProvider = HoverProvider;
function getNonce() {
    let text = '';
    const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    for (let i = 0; i < 32; i++) {
        text += possible.charAt(Math.floor(Math.random() * possible.length));
    }
    return text;
}
