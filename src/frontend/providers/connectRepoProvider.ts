import * as vscode from 'vscode';
import { promises as fs } from 'fs';
import { createFunctionRecords, functionRecordsPathFor } from '../../backend/services/createFunctionRecords';
import { SideBarProvider } from './sideBarProvider';
import { cloneOrUpdateRepo, getRemoteUrl } from '../services/cloneRepo';
import { writeRepoConfig } from '../services/repoConfig';
import { getOrPromptGithubToken } from '../../backend/services/githubAuth';
import { registerGithubWebhook } from '../../backend/services/githubWebhookRegistration';
import { RELAY_WEBHOOK_URL, RELAY_WEBHOOK_SECRET } from '../../backend/config';
/**
 * ConnectRepoProvider — Manages the "Connect your repo" first-time onboarding webview.
 *
 * Shown when the user opens a workspace for the first time without an existing
 * .funcmanager/functions.json file, or triggered manually via command.
 */
export class ConnectRepoProvider {
    public static currentPanel: ConnectRepoProvider | undefined;
    private static readonly viewType = 'amazonProgram.connectRepo';

    private readonly panel: vscode.WebviewPanel;
    private disposables: vscode.Disposable[] = [];

    /**
     * Checks if the workspace already has function records; if not, opens the Connect Repo panel.
     */
    public static async checkAndPrompt(context: vscode.ExtensionContext) {
        const workspaceFolders = vscode.workspace.workspaceFolders;

        if (!workspaceFolders || workspaceFolders.length === 0) {
            // No folder open — still show the panel, just for the "paste a GitHub URL" path.
            // Connecting via "open workspace" simply won't be available until a folder is opened.
            ConnectRepoProvider.show(context);
            return;
        }

        const folder = workspaceFolders?.[0];
        if (!folder) {
            vscode.window.showErrorMessage('Doc Manager: open a folder first.');
            return;
        } 

        const rootPath = folder.uri.fsPath;
        const recordsPath = functionRecordsPathFor(rootPath);

        try {
            await fs.access(recordsPath);
            // Already indexed for this workspace — don't show the panel automatically
        } catch {
            ConnectRepoProvider.show(context);
        }
    }

    /**
     * Opens or reveals the Connect Repo panel.
     */
    public static show(context: vscode.ExtensionContext) {
        const column = vscode.ViewColumn.Active;

        if (ConnectRepoProvider.currentPanel) {
            ConnectRepoProvider.currentPanel.panel.reveal(column);
            return;
        }

        const panel = vscode.window.createWebviewPanel(
            ConnectRepoProvider.viewType,
            'Connect Your Repo',
            column,
            {
                enableScripts: true,
                retainContextWhenHidden: true,
                localResourceRoots: [
                    vscode.Uri.joinPath(context.extensionUri, 'out', 'webviews', 'connectRepo'),
                ],
            }
        );

        ConnectRepoProvider.currentPanel = new ConnectRepoProvider(panel, context);
    }

    private constructor(
        panel: vscode.WebviewPanel,
        private readonly context: vscode.ExtensionContext
    ) {
        this.panel = panel;

        this.panel.webview.html = this.getHtml(this.panel.webview);

        this.panel.onDidDispose(() => this.dispose(), null, this.disposables);

        this.panel.webview.onDidReceiveMessage(
            (message) => this.handleMessage(message),
            null,
            this.disposables
        );
    }

    private async handleMessage(message: { command: string; repoUrl?: string;[key: string]: any }) {
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
                vscode.commands.executeCommand(`${SideBarProvider.viewId}.focus`).then(undefined, () => { });
                break;
            }
        }
    }

    private async runIndexing(repoUrl?: string) {
        let rootPath: string;
        let clonedIntoNewFolder = false; // track whether we need to switch the workspace afterward

        if (repoUrl && repoUrl.trim().length > 0) {
            const workspaceFolders = vscode.workspace.workspaceFolders;
            let destinationFolder: string;

            const folder = workspaceFolders?.[0];
            if (folder) {
                 destinationFolder = folder.uri.fsPath;
            } else {
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
                
                const picked = selected?.[0];
                if (!picked) return;
                destinationFolder = picked.fsPath;

                clonedIntoNewFolder = true; // no workspace was open before — we'll need to open one after
            }

            try {
                this.panel.webview.postMessage({
                    command: 'setStatus',
                    status: 'loading',
                    message: 'Cloning repository…',
                });

                rootPath = await cloneOrUpdateRepo(destinationFolder, repoUrl.trim(), (message) => {
                    this.panel.webview.postMessage({ command: 'setStatus', status: 'loading', message });
                });
            } catch (err: any) {
                this.panel.webview.postMessage({
                    command: 'setStatus',
                    status: 'error',
                    error: err?.message || 'Failed to clone the repository. Check the URL and try again.',
                });
                return;
            }
        } else {
            const workspaceFolders = vscode.workspace.workspaceFolders;
            if (!workspaceFolders || workspaceFolders.length === 0) {
                this.panel.webview.postMessage({
                    command: 'setStatus',
                    status: 'error',
                    error: 'No open workspace folder found. Open a folder first, or paste a GitHub URL to clone one.',
                });
                return;
            }

            const folder = workspaceFolders?.[0];
            if (!folder) return;
            rootPath = folder.uri.fsPath;

        }

        try {
            this.panel.webview.postMessage({
                command: 'setStatus',
                status: 'loading',
                message: 'Scanning files and extracting functions…',
            });

            const records = await createFunctionRecords(rootPath);

            const filesCount = Object.keys(records.files).length;
            const functionsCount = Object.values(records.files).reduce(
                (acc, list) => acc + list.length,
                0
            );

            const resolvedRepoUrl = repoUrl?.trim() || (await getRemoteUrl(rootPath));
            if (!resolvedRepoUrl) {
                vscode.window.showErrorMessage(
                'Doc Manager: no repository URL found. Enter one, or open a folder with a git remote.'
                );
                return;
            }
            await writeRepoConfig(rootPath, { repoUrl: resolvedRepoUrl, connectedAt: new Date().toISOString(),});
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

                const githubToken = await getOrPromptGithubToken(this.context, resolvedRepoUrl);
                if (!githubToken) {
                    vscode.window.showWarningMessage(
                        'No GitHub token provided — live commit notifications will not work until one is added.'
                    );
                } else {
                    try {
                        await registerGithubWebhook({
                            repoUrl: resolvedRepoUrl,
                            githubToken,
                            relayWebhookUrl: RELAY_WEBHOOK_URL,
                            webhookSecret: RELAY_WEBHOOK_SECRET,
                        });
                    } catch (err: any) {
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

            vscode.window.showInformationMessage(
                `✓ CMS Memory: Indexed ${functionsCount} functions across ${filesCount} files.`
            );

            // If we cloned into a folder that wasn't already the open workspace,
            // switch VS Code to open it now — this reloads the window.
            if (clonedIntoNewFolder) {
                vscode.commands.executeCommand('vscode.openFolder', vscode.Uri.file(rootPath));
            }
        } catch (err: any) {
            console.error('[ConnectRepoProvider] Error indexing repo:', err);
            this.panel.webview.postMessage({
                command: 'setStatus',
                status: 'error',
                error: err?.message || 'An unexpected error occurred while parsing the repository.',
            });
        }
    }

    public dispose() {
        ConnectRepoProvider.currentPanel = undefined;
        this.panel.dispose();
        while (this.disposables.length) {
            const d = this.disposables.pop();
            if (d) d.dispose();
        }
    }

    private getHtml(webview: vscode.Webview): string {
        const jsUri = webview.asWebviewUri(
            vscode.Uri.joinPath(this.context.extensionUri, 'out', 'webviews', 'connectRepo', 'connectRepo.js')
        );
        const cssUri = webview.asWebviewUri(
            vscode.Uri.joinPath(this.context.extensionUri, 'out', 'webviews', 'connectRepo', 'connectRepo.css')
        );
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

function getNonce(): string {
    let text = '';
    const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    for (let i = 0; i < 32; i++) {
        text += possible.charAt(Math.floor(Math.random() * possible.length));
    }
    return text;
}