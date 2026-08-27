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
exports.ModificationNotifProvider = void 0;
const vscode = __importStar(require("vscode"));
const funcManagerStore_1 = require("../../backend/services/funcManagerStore");
/**
 * ModificationNotifProvider — Manages the Notification Center webview panel.
 * Displays alerts about code changes affecting recorded memories with filters,
 * review actions, and recording new memories.
 */
class ModificationNotifProvider {
    /** Opens (or reveals) the Notification Center panel. */
    static show(extensionUri, initialFilter = 'all') {
        const column = vscode.ViewColumn.Beside;
        if (ModificationNotifProvider.currentPanel) {
            ModificationNotifProvider.currentPanel.panel.reveal(column, true);
            ModificationNotifProvider.currentPanel.sendData(initialFilter);
            return;
        }
        const panel = vscode.window.createWebviewPanel(ModificationNotifProvider.viewType, 'Notification Center', { viewColumn: column, preserveFocus: true }, {
            enableScripts: true,
            retainContextWhenHidden: true,
            localResourceRoots: [
                vscode.Uri.joinPath(extensionUri, 'dist', 'webview', 'modificationNotif'),
            ],
        });
        // Load whatever's already been persisted for this repo (from past webhook
        // pushes) so reopening the panel doesn't start empty every time.
        const repoRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
        const initialNotifications = repoRoot ? new funcManagerStore_1.FuncManagerStore(repoRoot).getNotifications() : [];
        ModificationNotifProvider.currentPanel = new ModificationNotifProvider(panel, extensionUri, initialFilter, initialNotifications);
    }
    constructor(panel, extensionUri, initialFilter, initialNotifications = []) {
        this.initialFilter = initialFilter;
        this.disposables = [];
        this.panel = panel;
        this.extensionUri = extensionUri;
        this.notifications = initialNotifications;
        this.panel.webview.html = this.getHtml(this.panel.webview);
        setTimeout(() => {
            this.sendData(this.initialFilter);
        }, 200);
        this.panel.onDidDispose(() => this.dispose(), null, this.disposables);
        this.panel.webview.onDidReceiveMessage((message) => this.handleMessage(message), null, this.disposables);
    }
    updateNotifications(notifications) {
        this.notifications = notifications;
        this.sendData();
    }
    sendData(activeFilter) {
        this.panel.webview.postMessage({
            command: 'setData',
            notifications: this.notifications,
            activeFilter: activeFilter || undefined,
        });
    }
    async handleMessage(message) {
        switch (message.command) {
            case 'ready':
                this.sendData(this.initialFilter);
                break;
            case 'reviewNotification': {
                const notif = message.notification;
                if (!notif)
                    return;
                try {
                    // Open the file in the workspace
                    const workspaceFolders = vscode.workspace.workspaceFolders;
                    let fileUri;
                    if (vscode.Uri.parse(notif.filePath).scheme === 'file') {
                        fileUri = vscode.Uri.file(notif.filePath);
                    }
                    else if (workspaceFolders && workspaceFolders.length > 0) {
                        fileUri = vscode.Uri.joinPath(workspaceFolders[0].uri, notif.filePath);
                    }
                    else {
                        fileUri = vscode.Uri.file(notif.filePath);
                    }
                    const doc = await vscode.workspace.openTextDocument(fileUri);
                    const line = Math.max(0, (notif.startLine || 1) - 1);
                    const endLine = Math.max(line, (notif.endLine || notif.startLine || 1) - 1);
                    await vscode.window.showTextDocument(doc, {
                        selection: new vscode.Range(line, 0, endLine, 0),
                        viewColumn: vscode.ViewColumn.One,
                    });
                }
                catch (err) {
                    vscode.window.showErrorMessage(`Unable to open file: ${notif.filePath}`);
                }
                break;
            }
            case 'recordNewMemory': {
                const notif = message.notification;
                vscode.commands.executeCommand('yourExtension.recordMemory', notif);
                vscode.window.showInformationMessage(`Recording new memory for ${notif.functionName}...`);
                break;
            }
            case 'markResolved': {
                const id = message.id;
                this.notifications = this.notifications.map((n) => n.id === id ? { ...n, status: 'resolved' } : n);
                this.persistStatus(id, 'resolved');
                this.sendData();
                break;
            }
            case 'markReviewed': {
                const id = message.id;
                this.notifications = this.notifications.map((n) => n.id === id ? { ...n, status: 'reviewed' } : n);
                this.persistStatus(id, 'reviewed');
                this.sendData();
                break;
            }
        }
    }
    /** Writes the status change back to notifications.json so it survives the
     *  panel being closed/reopened, not just the in-memory `this.notifications`. */
    persistStatus(id, status) {
        const repoRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
        if (!repoRoot)
            return;
        new funcManagerStore_1.FuncManagerStore(repoRoot).updateNotificationStatus(id, status);
    }
    getHtml(webview) {
        const jsUri = webview.asWebviewUri(vscode.Uri.joinPath(this.extensionUri, 'dist', 'webview', 'modificationNotif', 'modificationNotif.js'));
        const cssUri = webview.asWebviewUri(vscode.Uri.joinPath(this.extensionUri, 'dist', 'webview', 'modificationNotif', 'modificationNotif.css'));
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
  <title>Notification Center</title>
</head>
<body>
  <div id="root"></div>
  <script nonce="${nonce}" src="${jsUri}"></script>
</body>
</html>`;
    }
    dispose() {
        ModificationNotifProvider.currentPanel = undefined;
        this.panel.dispose();
        while (this.disposables.length) {
            this.disposables.pop()?.dispose();
        }
    }
}
exports.ModificationNotifProvider = ModificationNotifProvider;
ModificationNotifProvider.viewType = 'amazonProgram.modificationNotif';
function getNonce() {
    let text = '';
    const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    for (let i = 0; i < 32; i++) {
        text += possible.charAt(Math.floor(Math.random() * possible.length));
    }
    return text;
}
