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
const DocPanelProvider_1 = require("./DocPanelProvider");
const docClient_1 = require("../services/docClient");
class FunctionHoverProvider {
    constructor(context) {
        this.context = context;
        this.currentName = ''; // ← added
        this.currentFilePath = ''; // ← added
    }
    async showForFunction(functionName, filePath) {
        this.currentName = functionName; // ← added — actually stores it
        this.currentFilePath = filePath; // ← added
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
                if (message.command === 'openFullDocs') {
                    const meta = {
                        symbolName: this.currentName,
                        filePath: this.currentFilePath,
                        startLine: 0,
                        endLine: 0,
                    };
                    DocPanelProvider_1.DocPanelProvider.show(this.context.extensionUri, meta);
                    this.fetchDocEntries(meta).then((entries) => {
                        DocPanelProvider_1.DocPanelProvider.currentPanel?.updateEntries(entries);
                    });
                }
                else {
                    console.log('Received from webview:', message);
                }
            });
        }
        this.panel.webview.html = this.getHtml(this.panel.webview);
        setTimeout(() => {
            this.panel?.webview.postMessage({ command: 'setData', data: functionData });
        }, 200);
    }
    async fetchDocEntries(meta) {
        try {
            return await (0, docClient_1.getDocsForSymbol)(meta);
        }
        catch {
            // Fallback mock if doc service is unavailable or running in standalone test
            return [
                {
                    id: '1',
                    type: 'written',
                    content: `Docs for ${meta.symbolName}`,
                    author: 'Unknown',
                    createdAt: new Date().toISOString(),
                    symbolName: meta.symbolName,
                    filePath: meta.filePath,
                    startLine: meta.startLine,
                    endLine: meta.endLine,
                    isStale: false,
                },
            ];
        }
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
        return {
            id: '1',
            name: functionName,
            durationSec: 47,
        };
    }
}
exports.FunctionHoverProvider = FunctionHoverProvider;
