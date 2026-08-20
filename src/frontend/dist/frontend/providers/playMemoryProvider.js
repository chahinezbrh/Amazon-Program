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
exports.PlayMemoryProvider = void 0;
const vscode = __importStar(require("vscode"));
/**
 * PlayMemoryProvider — opens a "Now Playing" panel to the right of the editor.
 *
 * Singleton: calling show() a second time just reveals the existing panel and
 * pushes new data to it, exactly like DocPanelProvider.
 */
class PlayMemoryProvider {
    /** Opens (or reveals) the panel and sends memory data to the webview. */
    static show(extensionUri, data) {
        const column = vscode.ViewColumn.Beside;
        if (PlayMemoryProvider.currentPanel) {
            PlayMemoryProvider.currentPanel.panel.reveal(column, /* preserveFocus */ true);
            PlayMemoryProvider.currentPanel.sendData(data);
            return;
        }
        const panel = vscode.window.createWebviewPanel(PlayMemoryProvider.viewType, `▶ ${data.functionName}`, { viewColumn: column, preserveFocus: true }, {
            enableScripts: true,
            retainContextWhenHidden: true,
            localResourceRoots: [
                vscode.Uri.joinPath(extensionUri, 'dist', 'webview', 'playMemory'),
            ],
        });
        PlayMemoryProvider.currentPanel = new PlayMemoryProvider(panel, extensionUri, data);
    }
    constructor(panel, extensionUri, initialData) {
        this.extensionUri = extensionUri;
        this.disposables = [];
        this.panel = panel;
        this.extensionPath = extensionUri.fsPath;
        this.panel.webview.html = this.getHtml(this.panel.webview);
        // Send data once the webview has mounted
        setTimeout(() => {
            this.sendData(initialData);
        }, 200);
        this.panel.onDidDispose(() => this.dispose(), null, this.disposables);
        this.panel.webview.onDidReceiveMessage((message) => this.handleMessage(message), null, this.disposables);
    }
    sendData(data) {
        this.panel.title = `▶ ${data.functionName}`;
        this.panel.webview.postMessage({ command: 'setMemoryData', data });
    }
    handleMessage(message) {
        switch (message.command) {
            case 'closePlayMemory':
                this.dispose();
                break;
            case 'playMemoryToggle':
                // Hook up real audio playback from the backend here later
                console.log('[PlayMemoryProvider] toggle playback for:', message.functionName);
                break;
        }
    }
    getHtml(webview) {
        const jsUri = webview.asWebviewUri(vscode.Uri.joinPath(this.extensionUri, 'dist', 'webview', 'playMemory', 'playMemory.js'));
        const cssUri = webview.asWebviewUri(vscode.Uri.joinPath(this.extensionUri, 'dist', 'webview', 'playMemory', 'playMemory.css'));
        const nonce = getNonce();
        return /* html */ `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta http-equiv="Content-Security-Policy"
    content="default-src 'none';
             img-src ${webview.cspSource} data:;
             style-src ${webview.cspSource} 'unsafe-inline' https://fonts.googleapis.com;
             font-src https://fonts.gstatic.com;
             script-src 'nonce-${nonce}';" />
  <link href="${cssUri}" rel="stylesheet" />
  <title>Now Playing</title>
</head>
<body>
  <div id="root"></div>
  <script nonce="${nonce}" src="${jsUri}"></script>
</body>
</html>`;
    }
    dispose() {
        PlayMemoryProvider.currentPanel = undefined;
        this.panel.dispose();
        while (this.disposables.length) {
            this.disposables.pop()?.dispose();
        }
    }
}
exports.PlayMemoryProvider = PlayMemoryProvider;
PlayMemoryProvider.viewType = 'amazonProgram.playMemory';
function getNonce() {
    let text = '';
    const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    for (let i = 0; i < 32; i++) {
        text += possible.charAt(Math.floor(Math.random() * possible.length));
    }
    return text;
}
