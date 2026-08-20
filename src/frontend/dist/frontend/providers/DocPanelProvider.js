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
exports.DocPanelProvider = void 0;
const vscode = __importStar(require("vscode"));
/**
 * Manages the "Show Doc" side panel: a single reusable webview that
 * displays every documentation entry (written, AI-generated, voice)
 * attached to whichever symbol the user hovered on.
 *
 * The panel opens INSTANTLY with just the symbol's name/location (known
 * synchronously from the hover), then shows a loading state in its content
 * area until the caller pushes the actual entries in via `updateEntries()`.
 * This matters when entries come from a slow lookup (HTTP call to the
 * backend, disk scan, etc.) — the user gets visual feedback right away
 * instead of a dead click while `getDocsForSymbol()` resolves.
 *
 * There is only ever one panel open at a time — calling `show()` again
 * just reveals it and swaps its content, the same way VS Code's own
 * "Problems" or "Output" panels behave.
 */
class DocPanelProvider {
    /** Opens (or reveals + resets) the panel immediately, before entries are known. */
    static show(extensionUri, meta) {
        const column = vscode.ViewColumn.Beside;
        if (DocPanelProvider.currentPanel) {
            DocPanelProvider.currentPanel.panel.reveal(column, /* preserveFocus */ true);
            DocPanelProvider.currentPanel.resetForNewSymbol(meta);
            return;
        }
        const panel = vscode.window.createWebviewPanel(DocPanelProvider.viewType, `Docs: ${meta.symbolName}`, { viewColumn: column, preserveFocus: true }, {
            enableScripts: true,
            retainContextWhenHidden: true,
            localResourceRoots: [
                // NOTE: assumes your build (esbuild/webpack) emits the bundled
                // docPanel.js + docPanel.css into out/frontend/webviews/docPanel.
                // Adjust if your build outputs elsewhere.
                vscode.Uri.joinPath(extensionUri, 'dist', 'webview', 'docPanel'),
                vscode.Uri.joinPath(extensionUri, 'assets'), // folder where recorded audio lives
            ],
        });
        DocPanelProvider.currentPanel = new DocPanelProvider(panel, extensionUri, meta);
    }
    /** Called by the command handler once the (possibly async) lookup resolves. */
    updateEntries(entries) {
        this.currentEntries = entries;
        this.currentError = undefined;
        this.panel.webview.postMessage({ type: 'entries', payload: entries });
    }
    /** Called by the command handler if the lookup fails. */
    updateError(message) {
        this.currentEntries = null;
        this.currentError = message;
        this.panel.webview.postMessage({ type: 'error', message });
    }
    constructor(panel, extensionUri, meta) {
        this.disposables = [];
        /** undefined = still loading, DocEntry[] = loaded (possibly empty), null = load failed. */
        this.currentEntries = undefined;
        this.panel = panel;
        this.extensionUri = extensionUri;
        this.currentMeta = meta;
        this.panel.webview.html = this.getHtml(this.panel.webview);
        this.panel.onDidDispose(() => this.dispose(), null, this.disposables);
        this.panel.webview.onDidReceiveMessage((message) => this.handleMessage(message), null, this.disposables);
    }
    resetForNewSymbol(meta) {
        this.currentMeta = meta;
        this.currentEntries = undefined; // back to loading
        this.currentError = undefined;
        this.panel.title = `Docs: ${meta.symbolName}`;
        this.panel.webview.postMessage({ type: 'meta', payload: meta });
    }
    async handleMessage(message) {
        switch (message.type) {
            case 'ready':
                // Webview just mounted (or remounted after retainContextWhenHidden
                // brought it back) — replay whatever state we currently have.
                this.panel.webview.postMessage({ type: 'meta', payload: this.currentMeta });
                if (this.currentEntries) {
                    this.panel.webview.postMessage({ type: 'entries', payload: this.currentEntries });
                }
                else if (this.currentEntries === null && this.currentError) {
                    this.panel.webview.postMessage({ type: 'error', message: this.currentError });
                }
                break;
            case 'requestAudio': {
                const entry = this.currentEntries?.find((e) => e.id === message.entryId);
                if (entry?.audioPath) {
                    const audioUri = this.panel.webview.asWebviewUri(vscode.Uri.file(entry.audioPath));
                    this.panel.webview.postMessage({
                        type: 'audioUrl',
                        entryId: entry.id,
                        url: audioUri.toString(),
                    });
                }
                break;
            }
            case 'editWritten': {
                const entry = this.currentEntries?.find((e) => e.id === message.entryId);
                vscode.commands.executeCommand('docManager.editDoc', entry ?? this.currentMeta);
                break;
            }
            case 'reRecordVoice':
                vscode.commands.executeCommand('docManager.recordDoc', this.currentMeta);
                break;
            case 'generateWithAI':
                vscode.commands.executeCommand('docManager.generateDoc', this.currentMeta);
                break;
            case 'jumpToSymbol': {
                const doc = await vscode.workspace.openTextDocument(this.currentMeta.filePath);
                await vscode.window.showTextDocument(doc, {
                    selection: new vscode.Range(this.currentMeta.startLine, 0, this.currentMeta.startLine, 0),
                    viewColumn: vscode.ViewColumn.One,
                });
                break;
            }
        }
    }
    getHtml(webview) {
        const cssUri = webview.asWebviewUri(vscode.Uri.joinPath(this.extensionUri, 'dist', 'webview', 'docPanel', 'docPanel.css')); //  LOOK HERE : i guess here is the problem remove out frontend and before webviews add dist but still to chekc with claude
        const jsUri = webview.asWebviewUri(vscode.Uri.joinPath(this.extensionUri, 'dist', 'webview', 'docPanel', 'docPanel.js'));
        const nonce = getNonce();
        return /* html */ `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta http-equiv="Content-Security-Policy"
    content="default-src 'none';
             img-src ${webview.cspSource} data:;
             media-src ${webview.cspSource};
             style-src ${webview.cspSource} 'unsafe-inline';
             script-src 'nonce-${nonce}';" />
  <link href="${cssUri}" rel="stylesheet" />
  <title>Documentation</title>
</head>
<body>
  <div id="root"></div>
  <script nonce="${nonce}" src="${jsUri}"></script>
</body>
</html>`;
    }
    dispose() {
        DocPanelProvider.currentPanel = undefined;
        this.panel.dispose();
        while (this.disposables.length) {
            this.disposables.pop()?.dispose();
        }
    }
}
exports.DocPanelProvider = DocPanelProvider;
DocPanelProvider.viewType = 'docManager.showDocPanel';
function getNonce() {
    let text = '';
    const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    for (let i = 0; i < 32; i++) {
        text += possible.charAt(Math.floor(Math.random() * possible.length));
    }
    return text;
}
