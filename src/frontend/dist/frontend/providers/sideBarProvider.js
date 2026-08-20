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
exports.SideBarProvider = void 0;
const vscode = __importStar(require("vscode"));
const path = __importStar(require("path"));
/**
 * SideBarProvider — registers a VS Code WebviewView in the activity-bar
 * sidebar panel. It watches the active editor and parses function names
 * from the current file, then pushes them to the webview.
 */
class SideBarProvider {
    constructor(_extensionUri) {
        this._extensionUri = _extensionUri;
        this._disposables = [];
    }
    /** Called by VS Code when the view becomes visible. */
    resolveWebviewView(webviewView, _context, _token) {
        this._view = webviewView;
        webviewView.webview.options = {
            enableScripts: true,
            localResourceRoots: [
                vscode.Uri.joinPath(this._extensionUri, 'dist', 'webview', 'sideBar'),
            ],
        };
        webviewView.webview.html = this._getHtml(webviewView.webview);
        // Handle messages from the webview
        webviewView.webview.onDidReceiveMessage((message) => {
            switch (message.command) {
                case 'selectFunction':
                    this._jumpToFunction(message.functionName);
                    break;
                case 'recordMemory':
                    vscode.commands.executeCommand('yourExtension.recordMemory');
                    break;
                case 'openNotifications':
                    vscode.commands.executeCommand('yourExtension.showNotificationCenter', message.filter);
                    break;
            }
        }, null, this._disposables);
        // Push data whenever the active editor changes
        this._disposables.push(vscode.window.onDidChangeActiveTextEditor(() => this._pushData()), vscode.workspace.onDidChangeTextDocument((e) => {
            if (vscode.window.activeTextEditor?.document === e.document) {
                this._pushData();
            }
        }));
        // Initial push
        this._pushData();
    }
    /** Send current file + function names to the webview. */
    async _pushData() {
        const editor = vscode.window.activeTextEditor;
        if (!this._view)
            return;
        if (!editor || !editor.document || editor.document.isUntitled) {
            this._view.webview.postMessage({
                command: 'setData',
                fileName: '',
                filePath: '',
                functions: [],
                noFile: true,
            });
            return;
        }
        const filePath = editor.document.fileName;
        const fileName = path.basename(filePath);
        // Indicate loading while asking backend
        this._view.webview.postMessage({
            command: 'setLoading',
            fileName,
        });
        const functions = await this._fetchFunctionsFromBackend(editor.document);
        this._view.webview.postMessage({
            command: 'setData',
            fileName,
            filePath,
            functions,
            noFile: false,
        });
    }
    /**
     * Sends a request to the backend service to retrieve parsed functions
     * and their memory status for the selected file, with fallback parser.
     */
    async _fetchFunctionsFromBackend(document) {
        const filePath = document.fileName;
        const content = document.getText();
        try {
            // Backend endpoint to request function list for current file
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 1200);
            const response = await fetch('http://localhost:3000/api/functions', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    filePath,
                    content,
                    language: document.languageId,
                }),
                signal: controller.signal,
            });
            clearTimeout(timeoutId);
            if (response.ok) {
                const data = await response.json();
                if (Array.isArray(data.functions) && data.functions.length > 0) {
                    return data.functions.map((fn, idx) => ({
                        name: fn.name,
                        hasMemory: Boolean(fn.hasMemory),
                        isSelected: idx === 0,
                    }));
                }
            }
        }
        catch {
            // Backend is starting up or offline — use fallback parser
        }
        // Fallback: local parser
        return this._parseFunctions(document);
    }
    /**
     * Very lightweight regex-based function name extractor.
     * Works for JS/TS/Python/Go — good enough for a sidebar list.
     */
    _parseFunctions(document) {
        const text = document.getText();
        const results = [];
        const seen = new Set();
        // Patterns that match common function declaration styles
        const patterns = [
            // JS/TS: function foo(  |  async function foo(  |  export function foo(
            /(?:export\s+)?(?:async\s+)?function\s+([A-Za-z_$][A-Za-z0-9_$]*)\s*\(/g,
            // Arrow / method: const foo = (  |  foo = (  |  foo: (
            /(?:const|let|var)\s+([A-Za-z_$][A-Za-z0-9_$]*)\s*=\s*(?:async\s*)?\(/g,
            // Class method: public/private/protected foo(
            /(?:(?:public|private|protected|static|async)\s+)+([A-Za-z_$][A-Za-z0-9_$]*)\s*\(/g,
            // Python: def foo(
            /def\s+([A-Za-z_][A-Za-z0-9_]*)\s*\(/g,
            // Go: func foo(
            /func\s+([A-Za-z_][A-Za-z0-9_]*)\s*\(/g,
        ];
        for (const pattern of patterns) {
            let match;
            pattern.lastIndex = 0;
            while ((match = pattern.exec(text)) !== null) {
                const name = match[1];
                if (!seen.has(name)) {
                    seen.add(name);
                    results.push({ name, hasMemory: false, isSelected: results.length === 0 });
                }
            }
        }
        return results;
    }
    /** Try to find and reveal the function definition in the active editor. */
    _jumpToFunction(functionName) {
        const editor = vscode.window.activeTextEditor;
        if (!editor)
            return;
        const text = editor.document.getText();
        const index = text.indexOf(functionName);
        if (index === -1)
            return;
        const position = editor.document.positionAt(index);
        editor.selection = new vscode.Selection(position, position);
        editor.revealRange(new vscode.Range(position, position), vscode.TextEditorRevealType.InCenter);
    }
    /** HTML shell that loads the bundled JS + CSS. */
    _getHtml(webview) {
        const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'dist', 'webview', 'sideBar', 'sideBar.js'));
        const cssUri = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'dist', 'webview', 'sideBar', 'sideBar.css'));
        return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <link rel="stylesheet" href="${cssUri}" />
  <style>
    html, body { margin: 0; padding: 0; height: 100%; background: transparent; }
  </style>
</head>
<body>
  <div id="root"></div>
  <script src="${scriptUri}"></script>
</body>
</html>`;
    }
    dispose() {
        this._disposables.forEach((d) => d.dispose());
        this._disposables = [];
    }
}
exports.SideBarProvider = SideBarProvider;
SideBarProvider.viewId = 'amazonProgram.sideBar';
