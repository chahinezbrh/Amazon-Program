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
exports.FunctionHoverProvider = void 0;
const vscode = __importStar(require("vscode"));
const path = __importStar(require("path"));
class FunctionHoverProvider {
    constructor(context) {
        this.context = context;
    }
    async showForFunction(functionName, filePath) {
        const functionData = await this.fetchFunctionData(functionName, filePath);
        if (!this.panel) {
            this.panel = vscode.window.createWebviewPanel('functionHoverPopup', 'Function Docs', { viewColumn: vscode.ViewColumn.Beside, preserveFocus: true }, {
                enableScripts: true,
                localResourceRoots: [
                    vscode.Uri.file(path.join(this.context.extensionPath, 'dist', 'webview')),
                ],
            });
            this.panel.onDidDispose(() => {
                this.panel = undefined;
            });
            this.panel.webview.onDidReceiveMessage((message) => {
                console.log('Received from webview:', message);
                // handle message.command: 'playMemory', 'addMemory', 'generateAiDocs', 'writeDocs', 'openFullDocs'
            });
        }
        this.panel.webview.html = this.getHtml(this.panel.webview);
        // give the webview a moment to mount before sending data
        setTimeout(() => {
            this.panel?.webview.postMessage({ command: 'setData', data: functionData });
        }, 200);
    }
    getHtml(webview) {
        const scriptPath = vscode.Uri.file(path.join(this.context.extensionPath, 'dist', 'webview', 'functionHoverPopup.js'));
        const cssPath = vscode.Uri.file(path.join(this.context.extensionPath, 'dist', 'webview', 'functionHoverPopup.css'));
        const scriptUri = webview.asWebviewUri(scriptPath);
        const cssUri = webview.asWebviewUri(cssPath);
        return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <link rel="stylesheet" href="${cssUri}">
  <style>
    body { margin: 0; padding: 0; background: transparent; }
  </style>
</head>
<body>
  <div id="root"></div>
  <script src="${scriptUri}"></script>
</body>
</html>`;
    }
    async fetchFunctionData(functionName, filePath) {
        // TEMP mock — swap for a real fetch() to your backend once it's running
        return {
            id: '1',
            name: functionName,
            durationSec: 47,
        };
    }
}
exports.FunctionHoverProvider = FunctionHoverProvider;
