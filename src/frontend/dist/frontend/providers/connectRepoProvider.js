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
exports.ConnectRepoProvider = void 0;
const vscode = __importStar(require("vscode"));
const fs_1 = require("fs");
const createFunctionRecords_1 = require("../../backend/services/createFunctionRecords");
const sideBarProvider_1 = require("./sideBarProvider");
const cloneRepo_1 = require("../services/cloneRepo");
const repoConfig_1 = require("../services/repoConfig");
const githubAuth_1 = require("../../backend/services/githubAuth");
const githubWebhookRegistration_1 = require("../../backend/services/githubWebhookRegistration");
const config_1 = require("../../backend/config");
/**
 * ConnectRepoProvider — Manages the "Connect your repo" first-time onboarding webview.
 *
 * Shown when the user opens a workspace for the first time without an existing
 * .funcmanager/functions.json file, or triggered manually via command.
 */
class ConnectRepoProvider {
    /**
     * Checks if the workspace already has function records; if not, opens the Connect Repo panel.
     */
    static async checkAndPrompt(context) {
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (!workspaceFolders || workspaceFolders.length === 0) {
            // No folder open — still show the panel, just for the "paste a GitHub URL" path.
            // Connecting via "open workspace" simply won't be available until a folder is opened.
            ConnectRepoProvider.show(context);
            return;
        }
        const rootPath = workspaceFolders[0].uri.fsPath;
        const recordsPath = (0, createFunctionRecords_1.functionRecordsPathFor)(rootPath);
        try {
            await fs_1.promises.access(recordsPath);
            // Already indexed for this workspace — don't show the panel automatically
        }
        catch {
            ConnectRepoProvider.show(context);
        }
    }
    /**
     * Opens or reveals the Connect Repo panel.
     */
    static show(context) {
        const column = vscode.ViewColumn.Active;
        if (ConnectRepoProvider.currentPanel) {
            ConnectRepoProvider.currentPanel.panel.reveal(column);
            return;
        }
        const panel = vscode.window.createWebviewPanel(ConnectRepoProvider.viewType, 'Connect Your Repo', column, {
            enableScripts: true,
            retainContextWhenHidden: true,
            localResourceRoots: [
                vscode.Uri.joinPath(context.extensionUri, 'dist', 'webview', 'connectRepo'),
            ],
        });
        ConnectRepoProvider.currentPanel = new ConnectRepoProvider(panel, context);
    }
    constructor(panel, context) {
        this.context = context;
        this.disposables = [];
        this.panel = panel;
        this.panel.webview.html = this.getHtml(this.panel.webview);
        this.panel.onDidDispose(() => this.dispose(), null, this.disposables);
        this.panel.webview.onDidReceiveMessage((message) => this.handleMessage(message), null, this.disposables);
    }
    async handleMessage(message) {
        switch (message.command) {
            case 'ready': {
                const workspaceFolders = vscode.workspace.workspaceFolders;
                const workspaceName = workspaceFolders?.[0]?.name || '';
                this.panel.webview.postMessage({
                    command: 'initData',
                    workspaceName,
                });
                break;
            }
            case 'connectRepo': {
                await this.runIndexing(message.repoUrl);
                break;
            }
            case 'close': {
                this.dispose();
                vscode.commands.executeCommand(`${sideBarProvider_1.SideBarProvider.viewId}.focus`).then(undefined, () => { });
                break;
            }
        }
    }
    async runIndexing(repoUrl) {
        let rootPath;
        let clonedIntoNewFolder = false; // track whether we need to switch the workspace afterward
        if (repoUrl && repoUrl.trim().length > 0) {
            const workspaceFolders = vscode.workspace.workspaceFolders;
            let destinationFolder;
            if (workspaceFolders && workspaceFolders.length > 0) {
                destinationFolder = workspaceFolders[0].uri.fsPath;
            }
            else {
                const selected = await vscode.window.showOpenDialog({
                    canSelectFiles: false,
                    canSelectFolders: true,
                    canSelectMany: false,
                    openLabel: 'Select folder',
                    title: 'Choose where to clone the repository',
                });
                if (!selected || selected.length === 0) {
                    this.panel.webview.postMessage({
                        command: 'setStatus',
                        status: 'error',
                        error: 'No folder selected. Choose a destination folder to continue.',
                    });
                    return;
                }
                destinationFolder = selected[0].fsPath;
                clonedIntoNewFolder = true; // no workspace was open before — we'll need to open one after
            }
            try {
                this.panel.webview.postMessage({
                    command: 'setStatus',
                    status: 'loading',
                    message: 'Cloning repository…',
                });
                rootPath = await (0, cloneRepo_1.cloneOrUpdateRepo)(destinationFolder, repoUrl.trim(), (message) => {
                    this.panel.webview.postMessage({ command: 'setStatus', status: 'loading', message });
                });
            }
            catch (err) {
                this.panel.webview.postMessage({
                    command: 'setStatus',
                    status: 'error',
                    error: err?.message || 'Failed to clone the repository. Check the URL and try again.',
                });
                return;
            }
        }
        else {
            const workspaceFolders = vscode.workspace.workspaceFolders;
            if (!workspaceFolders || workspaceFolders.length === 0) {
                this.panel.webview.postMessage({
                    command: 'setStatus',
                    status: 'error',
                    error: 'No open workspace folder found. Open a folder first, or paste a GitHub URL to clone one.',
                });
                return;
            }
            rootPath = workspaceFolders[0].uri.fsPath;
        }
        try {
            this.panel.webview.postMessage({
                command: 'setStatus',
                status: 'loading',
                message: 'Scanning files and extracting functions…',
            });
            const records = await (0, createFunctionRecords_1.createFunctionRecords)(rootPath);
            const filesCount = Object.keys(records.files).length;
            const functionsCount = Object.values(records.files).reduce((acc, list) => acc + list.length, 0);
            const resolvedRepoUrl = repoUrl?.trim() || (await (0, cloneRepo_1.getRemoteUrl)(rootPath));
            await (0, repoConfig_1.writeRepoConfig)(rootPath, {
                repoUrl: resolvedRepoUrl,
                connectedAt: new Date().toISOString(),
            });
            // Only register a live webhook when this connection came from a pasted
            // GitHub URL — the "open existing workspace" path may not even be a
            // GitHub repo, and if it is, connecting a webhook silently on an
            // already-open folder would be surprising.
            if (repoUrl && repoUrl.trim().length > 0 && resolvedRepoUrl) {
                this.panel.webview.postMessage({
                    command: 'setStatus',
                    status: 'loading',
                    message: 'Setting up live commit notifications…',
                });
                const githubToken = await (0, githubAuth_1.getOrPromptGithubToken)(this.context, resolvedRepoUrl);
                if (!githubToken) {
                    vscode.window.showWarningMessage('No GitHub token provided — live commit notifications will not work until one is added.');
                }
                else {
                    try {
                        await (0, githubWebhookRegistration_1.registerGithubWebhook)({
                            repoUrl: resolvedRepoUrl,
                            githubToken,
                            relayWebhookUrl: config_1.RELAY_WEBHOOK_URL,
                            webhookSecret: config_1.RELAY_WEBHOOK_SECRET,
                        });
                    }
                    catch (err) {
                        vscode.window.showErrorMessage(`Failed to register GitHub webhook: ${err.message}`);
                        // non-fatal — indexing already succeeded, so we don't return here
                    }
                }
            }
            this.panel.webview.postMessage({
                command: 'setStatus',
                status: 'success',
                message: 'Repository indexed successfully!',
                stats: { filesCount, functionsCount },
            });
            vscode.window.showInformationMessage(`✓ CMS Memory: Indexed ${functionsCount} functions across ${filesCount} files.`);
            // If we cloned into a folder that wasn't already the open workspace,
            // switch VS Code to open it now — this reloads the window.
            if (clonedIntoNewFolder) {
                vscode.commands.executeCommand('vscode.openFolder', vscode.Uri.file(rootPath));
            }
        }
        catch (err) {
            console.error('[ConnectRepoProvider] Error indexing repo:', err);
            this.panel.webview.postMessage({
                command: 'setStatus',
                status: 'error',
                error: err?.message || 'An unexpected error occurred while parsing the repository.',
            });
        }
    }
    dispose() {
        ConnectRepoProvider.currentPanel = undefined;
        this.panel.dispose();
        while (this.disposables.length) {
            const d = this.disposables.pop();
            if (d)
                d.dispose();
        }
    }
    getHtml(webview) {
        const jsUri = webview.asWebviewUri(vscode.Uri.joinPath(this.context.extensionUri, 'dist', 'webview', 'connectRepo', 'connectRepo.js'));
        const cssUri = webview.asWebviewUri(vscode.Uri.joinPath(this.context.extensionUri, 'dist', 'webview', 'connectRepo', 'connectRepo.css'));
        const nonce = getNonce();
        return /* html */ `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta http-equiv="Content-Security-Policy"
    content="default-src 'none';
             img-src ${webview.cspSource} data:;
             style-src ${webview.cspSource} 'unsafe-inline';
             script-src 'nonce-${nonce}';" />
  <link href="${cssUri}" rel="stylesheet" />
  <title>Connect your repo</title>
</head>
<body>
  <div id="root"></div>
  <script nonce="${nonce}" src="${jsUri}"></script>
</body>
</html>`;
    }
}
exports.ConnectRepoProvider = ConnectRepoProvider;
ConnectRepoProvider.viewType = 'amazonProgram.connectRepo';
function getNonce() {
    let text = '';
    const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    for (let i = 0; i < 32; i++) {
        text += possible.charAt(Math.floor(Math.random() * possible.length));
    }
    return text;
}
