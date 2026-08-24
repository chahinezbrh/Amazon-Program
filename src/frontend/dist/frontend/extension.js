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
exports.activate = activate;
exports.deactivate = deactivate;
const vscode = __importStar(require("vscode"));
const FunctionHoverProvider_1 = require("./providers/FunctionHoverProvider");
const DocPanelProvider_1 = require("./providers/DocPanelProvider");
const sideBarProvider_1 = require("./providers/sideBarProvider");
const playMemoryProvider_1 = require("./providers/playMemoryProvider");
const modificationNotifProvider_1 = require("./providers/modificationNotifProvider");
const connectRepoProvider_1 = require("./providers/connectRepoProvider");
function activate(context) {
    const hoverProvider = new FunctionHoverProvider_1.FunctionHoverProvider(context);
    // Check if workspace functions are indexed on first run; prompt if not
    connectRepoProvider_1.ConnectRepoProvider.checkAndPrompt(context);
    const connectRepoCommand = vscode.commands.registerCommand('yourExtension.connectRepo', () => {
        connectRepoProvider_1.ConnectRepoProvider.show(context);
    });
    // ── Test command — same as connectRepoCommand for now, kept
    // separate so it can diverge later (e.g. mock data) without
    // touching the "real" entry point.
    const testConnectRepoCommand = vscode.commands.registerCommand('yourExtension.testConnectRepo', () => {
        connectRepoProvider_1.ConnectRepoProvider.show(context);
    });
    const testPopupCommand = vscode.commands.registerCommand('yourExtension.testPopup', () => {
        hoverProvider.showForFunction('authenticateUser', 'src/auth/middleware.js');
    });
    const testDocPanelCommand = vscode.commands.registerCommand('yourExtension.testDocPanel', () => {
        const mockMeta = {
            symbolName: 'authenticateUser',
            filePath: 'src/auth/middleware.js',
            startLine: 10,
            endLine: 25,
        };
        DocPanelProvider_1.DocPanelProvider.show(context.extensionUri, mockMeta);
        setTimeout(() => {
            const mockEntries = [
                {
                    id: '1',
                    type: 'written',
                    content: 'This function checks the user session token and returns the authenticated user.',
                    author: 'Unknown',
                    createdAt: new Date().toISOString(),
                    symbolName: mockMeta.symbolName,
                    filePath: mockMeta.filePath,
                    startLine: mockMeta.startLine,
                    endLine: mockMeta.endLine,
                    isStale: false
                },
                {
                    id: '2',
                    type: 'ai',
                    content: 'AI-generated summary: validates a bearer token against the session store.',
                    author: 'Unknown',
                    createdAt: new Date().toISOString(),
                    symbolName: mockMeta.symbolName,
                    filePath: mockMeta.filePath,
                    startLine: mockMeta.startLine,
                    endLine: mockMeta.endLine,
                    isStale: false
                },
                {
                    id: '3',
                    type: 'voice',
                    audioPath: 'C:\\path\\to\\some\\recording.mp3',
                    author: 'Unknown',
                    createdAt: new Date().toISOString(),
                    symbolName: mockMeta.symbolName,
                    filePath: mockMeta.filePath,
                    startLine: mockMeta.startLine,
                    endLine: mockMeta.endLine,
                    isStale: false
                },
            ];
            DocPanelProvider_1.DocPanelProvider.currentPanel?.updateEntries(mockEntries);
        }, 500);
    });
    const sideBarProvider = new sideBarProvider_1.SideBarProvider(context.extensionUri);
    const sideBarView = vscode.window.registerWebviewViewProvider(sideBarProvider_1.SideBarProvider.viewId, sideBarProvider);
    const testSideBarCommand = vscode.commands.registerCommand('yourExtension.testSideBar', () => {
        vscode.commands.executeCommand(`${sideBarProvider_1.SideBarProvider.viewId}.focus`);
    });
    const testPlayMemoryCommand = vscode.commands.registerCommand('yourExtension.testPlayMemory', () => {
        playMemoryProvider_1.PlayMemoryProvider.show(context.extensionUri, {
            functionName: 'authenticateUser',
            filePath: 'src/auth/middleware.js',
            durationSec: 47,
            transcript: 'This function checks whether the incoming request has a valid session token before allowing access.',
        });
    });
    // ── Notification Center Commands & View ─────────────────
    const showNotifCenterCommand = vscode.commands.registerCommand('yourExtension.showNotificationCenter', (filter) => {
        modificationNotifProvider_1.ModificationNotifProvider.show(context.extensionUri, filter || 'all');
    });
    const testModificationNotifCommand = vscode.commands.registerCommand('yourExtension.testModificationNotif', () => {
        modificationNotifProvider_1.ModificationNotifProvider.show(context.extensionUri, 'all');
    });
    const notificationsWebviewProvider = {
        resolveWebviewView(webviewView) {
            webviewView.webview.options = {
                enableScripts: true,
            };
            webviewView.webview.html = `<!DOCTYPE html>
      <html>
        <head>
          <style>
            body {
              font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
              padding: 20px 16px;
              color: #c8cdd0;
              background-color: #1e2122;
              display: flex;
              flex-direction: column;
              gap: 12px;
              user-select: none;
            }
            .header {
              font-size: 11px;
              font-weight: 700;
              letter-spacing: 1px;
              color: #7a8490;
              text-transform: uppercase;
            }
            .desc {
              font-size: 12px;
              color: #9ca3af;
              line-height: 1.4;
            }
            .open-btn {
              background-color: #2a2f31;
              color: #f0f3f6;
              border: 1.5px solid rgba(58, 200, 171, 0.4);
              padding: 9px 14px;
              border-radius: 999px;
              cursor: pointer;
              font-size: 12px;
              font-weight: 600;
              transition: all 0.15s ease;
              text-align: center;
              margin-top: 4px;
            }
            .open-btn:hover {
              background-color: rgba(58, 200, 171, 0.12);
              border-color: #3ac8ab;
              color: #3ac8ab;
            }
          </style>
        </head>
        <body>
          <div class="header">Notification Center</div>
          <div class="desc">Review code modifications affecting recorded memories.</div>
          <button class="open-btn" onclick="openCenter()">
            Open Notification Center
          </button>
          <script>
            const vscode = acquireVsCodeApi();
            function openCenter() {
              vscode.postMessage({ command: 'open' });
            }
            document.body.addEventListener('click', () => {
              vscode.postMessage({ command: 'open' });
            }, { once: true });
          </script>
        </body>
      </html>`;
            webviewView.webview.onDidReceiveMessage((msg) => {
                if (msg.command === 'open') {
                    modificationNotifProvider_1.ModificationNotifProvider.show(context.extensionUri, 'modifications');
                }
            });
        },
    };
    const notificationsView = vscode.window.registerWebviewViewProvider('amazonProgram.notificationsView', notificationsWebviewProvider);
    context.subscriptions.push(connectRepoCommand, testConnectRepoCommand, testPopupCommand, testDocPanelCommand, sideBarView, testSideBarCommand, testPlayMemoryCommand, showNotifCenterCommand, testModificationNotifCommand, notificationsView);
    setTimeout(() => {
        vscode.commands.executeCommand(`${sideBarProvider_1.SideBarProvider.viewId}.focus`).then(undefined, () => { });
    }, 300);
}
function deactivate() { }
