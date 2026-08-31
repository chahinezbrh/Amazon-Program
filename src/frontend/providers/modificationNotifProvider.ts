import * as vscode from 'vscode';
import { CodeNotification } from '../../shared/types';
import { FuncManagerStore } from '../../backend/services/funcManagerStore';

/**
 * ModificationNotifProvider — Manages the Notification Center webview panel.
 * Displays alerts about code changes affecting recorded memories with filters,
 * review actions, and recording new memories.
 */
export class ModificationNotifProvider {
  public static currentPanel: ModificationNotifProvider | undefined;
  private static readonly viewType = 'amazonProgram.modificationNotif';

  private readonly panel: vscode.WebviewPanel;
  private readonly extensionUri: vscode.Uri;
  private disposables: vscode.Disposable[] = [];

  private notifications: CodeNotification[];

  /** Opens (or reveals) the Notification Center panel. */
  public static show(extensionUri: vscode.Uri, initialFilter: string = 'all') {
    const column = vscode.ViewColumn.Beside;

    if (ModificationNotifProvider.currentPanel) {
      ModificationNotifProvider.currentPanel.panel.reveal(column, true);
      ModificationNotifProvider.currentPanel.sendData(initialFilter);
      return;
    }

    const panel = vscode.window.createWebviewPanel(
      ModificationNotifProvider.viewType,
      'Notification Center',
      { viewColumn: column, preserveFocus: true },
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [
          vscode.Uri.joinPath(extensionUri, 'out', 'webviews', 'modificationNotif'),
        ],
      }
    );

    // Load whatever's already been persisted for this repo (from past webhook
    // pushes) so reopening the panel doesn't start empty every time.
    const repoRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    const initialNotifications = repoRoot ? new FuncManagerStore(repoRoot).getNotifications() : [];

    ModificationNotifProvider.currentPanel = new ModificationNotifProvider(
      panel,
      extensionUri,
      initialFilter,
      initialNotifications
    );
  }

  private constructor(
    panel: vscode.WebviewPanel,
    extensionUri: vscode.Uri,
    private initialFilter: string,
    initialNotifications: CodeNotification[] = []
  ) {
    this.panel = panel;
    this.extensionUri = extensionUri;
    this.notifications = initialNotifications;

    this.panel.webview.html = this.getHtml(this.panel.webview);

    setTimeout(() => {
      this.sendData(this.initialFilter);
    }, 200);

    this.panel.onDidDispose(() => this.dispose(), null, this.disposables);

    this.panel.webview.onDidReceiveMessage(
      (message) => this.handleMessage(message),
      null,
      this.disposables
    );
  }

  public updateNotifications(notifications: CodeNotification[]) {
    this.notifications = notifications;
    this.sendData();
  }

  private sendData(activeFilter?: string) {
    this.panel.webview.postMessage({
      command: 'setData',
      notifications: this.notifications,
      activeFilter: activeFilter || undefined,
    });
  }

  private async handleMessage(message: { command: string; [key: string]: any }) {
    switch (message.command) {
      case 'ready':
        this.sendData(this.initialFilter);
        break;

      case 'reviewNotification': {
        const notif = message.notification as CodeNotification;
        if (!notif) return;

        try {
          // Open the file in the workspace
                   // Notifications store repo-relative paths, so resolve against the
          // workspace unless the path is already absolute.
          const folder = vscode.workspace.workspaceFolders?.[0];
          const fileUri =
            vscode.Uri.parse(notif.filePath).scheme === 'file' || !folder
              ? vscode.Uri.file(notif.filePath)
              : vscode.Uri.joinPath(folder.uri, notif.filePath);

          const doc = await vscode.workspace.openTextDocument(fileUri);
          const line = Math.max(0, (notif.startLine || 1) - 1);
          const endLine = Math.max(line, (notif.endLine || notif.startLine || 1) - 1);

          await vscode.window.showTextDocument(doc, {
            selection: new vscode.Range(line, 0, endLine, 0),
            viewColumn: vscode.ViewColumn.One,
          });
        } catch (err) {
          vscode.window.showErrorMessage(`Unable to open file: ${notif.filePath}`);
        }
        break;
      }

            case 'seeDocs': {
        const notif = message.notification as CodeNotification;
        if (!notif) break;

        const folder = vscode.workspace.workspaceFolders?.[0];
        if (!folder) break;

        // Notifications carry the function name with "()" appended and a
        // repo-relative path; SymbolMeta wants neither.
        vscode.commands.executeCommand('docManager.showDocPanel', {
          symbolName: notif.functionName.replace(/\(\)$/, ''),
          filePath: vscode.Uri.joinPath(folder.uri, notif.filePath).fsPath,
          startLine: Math.max(0, (notif.startLine || 1) - 1),
          endLine: Math.max(0, (notif.endLine || notif.startLine || 1) - 1),
        });
        break;
      }

      case 'markResolved': {
        const id = message.id;
        this.notifications = this.notifications.map((n) =>
          n.id === id ? { ...n, status: 'resolved' } : n
        );
        this.persistStatus(id, 'resolved');
        this.sendData();
        break;
      }

      case 'markReviewed': {
        const id = message.id;
        this.notifications = this.notifications.map((n) =>
          n.id === id ? { ...n, status: 'reviewed' } : n
        );
        this.persistStatus(id, 'reviewed');
        this.sendData();
        break;
      }
    }
  }

  /** Writes the status change back to notifications.json so it survives the
   *  panel being closed/reopened, not just the in-memory `this.notifications`. */
  private persistStatus(id: string, status: string) {
    const repoRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    if (!repoRoot) return;
    new FuncManagerStore(repoRoot).updateNotificationStatus(id, status);
  }

  private getHtml(webview: vscode.Webview): string {
    const jsUri = webview.asWebviewUri(
      vscode.Uri.joinPath(
        this.extensionUri,
        'out',
        'webviews',
        'modificationNotif',
        'modificationNotif.js'
      )
    );
    const cssUri = webview.asWebviewUri(
      vscode.Uri.joinPath(
        this.extensionUri,
        'out',
        'webviews',
        'modificationNotif',
        'modificationNotif.css'
      )
    );
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

  private dispose() {
    ModificationNotifProvider.currentPanel = undefined;
    this.panel.dispose();
    while (this.disposables.length) {
      this.disposables.pop()?.dispose();
    }
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