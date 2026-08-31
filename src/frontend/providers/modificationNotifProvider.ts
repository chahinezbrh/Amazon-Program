import * as vscode from 'vscode';
import { CodeNotification, SymbolMeta } from '../../shared/types';
import { FuncManagerStore } from '../../backend/services/funcManagerStore';

/**
 * ModificationNotifProvider — Manages the Notification Center webview panel.
 * Displays alerts about code changes affecting recorded memories, with filters,
 * review actions, and a route into the documentation panel.
 */
export class ModificationNotifProvider {
  public static currentPanel: ModificationNotifProvider | undefined;
  private static readonly viewType = 'amazonProgram.modificationNotif';

  private readonly panel: vscode.WebviewPanel;
  private readonly extensionUri: vscode.Uri;
  private disposables: vscode.Disposable[] = [];

  private notifications: CodeNotification[];
  private resolvedNotifications: CodeNotification[];

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
    // pushes / past resolves) so reopening the panel doesn't start empty.
    const repoRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    const store = repoRoot ? new FuncManagerStore(repoRoot) : null;
    const initialNotifications = store ? store.getNotifications() : [];
    const initialResolved = store ? store.getResolvedNotifications() : [];

    ModificationNotifProvider.currentPanel = new ModificationNotifProvider(
      panel,
      extensionUri,
      initialFilter,
      initialNotifications,
      initialResolved
    );
  }

  private constructor(
    panel: vscode.WebviewPanel,
    extensionUri: vscode.Uri,
    private initialFilter: string,
    initialNotifications: CodeNotification[] = [],
    initialResolvedNotifications: CodeNotification[] = []
  ) {
    this.panel = panel;
    this.extensionUri = extensionUri;
    this.notifications = initialNotifications;
    this.resolvedNotifications = initialResolvedNotifications;

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
      resolvedNotifications: this.resolvedNotifications,
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

        const absolutePath = this.absolutePathFor(notif.filePath);
        if (!absolutePath) return;

        try {
          const doc = await vscode.workspace.openTextDocument(
            vscode.Uri.file(absolutePath)
          );
          const line = Math.max(0, (notif.startLine || 1) - 1);
          const endLine = Math.max(line, (notif.endLine || notif.startLine || 1) - 1);

          await vscode.window.showTextDocument(doc, {
            selection: new vscode.Range(line, 0, endLine, 0),
            viewColumn: vscode.ViewColumn.One,
          });
        } catch {
          vscode.window.showErrorMessage(`Unable to open file: ${notif.filePath}`);
        }
        break;
      }

      case 'seeDocs': {
        const notif = message.notification as CodeNotification;
        if (!notif) return;

        const absolutePath = this.absolutePathFor(notif.filePath);
        if (!absolutePath) {
          vscode.window.showErrorMessage(
            'Doc Manager: open the repository folder to view its documentation.'
          );
          return;
        }

        // Notifications store the name with "()" appended and lines 1-indexed;
        // SymbolMeta wants the bare identifier and 0-indexed lines, or the
        // panel looks up a symbol that doesn't exist.
        const meta: SymbolMeta = {
          symbolName: notif.functionName.replace(/\(\)$/, ''),
          filePath: absolutePath,
          startLine: Math.max(0, (notif.startLine ?? 1) - 1),
          endLine: Math.max(0, (notif.endLine ?? notif.startLine ?? 1) - 1),
        };

        vscode.commands.executeCommand('docManager.showDocPanel', meta);
        break;
      }

      case 'resolveNotification': {
        const notif = message.notification as CodeNotification;
        if (!notif) return;

        const repoRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
        if (!repoRoot) return;

        const store = new FuncManagerStore(repoRoot);
        const resolved = store.resolveNotification(notif.id);
        if (!resolved) return; // already resolved elsewhere, or unknown id — no-op

        this.notifications = store.getNotifications();
        this.resolvedNotifications = store.getResolvedNotifications();
        this.sendData();
        break;
      }
    }
  }

  /**
   * Notifications always store repo-relative paths, so this joins to the
   * workspace unconditionally.
   *
   * It deliberately does NOT test the path with Uri.parse first: a bare
   * "test.py" parses with a file scheme, which would make the check pass and
   * produce a broken relative Uri — and then getWorkspaceFolder returns
   * undefined downstream and the doc lookup fails with no obvious cause.
   */
  private absolutePathFor(relativePath: string): string | undefined {
    const folder = vscode.workspace.workspaceFolders?.[0];
    if (!folder) return undefined;
    return vscode.Uri.joinPath(folder.uri, relativePath).fsPath;
  }

  private getHtml(webview: vscode.Webview): string {
    const base = vscode.Uri.joinPath(
      this.extensionUri,
      'out',
      'webviews',
      'modificationNotif'
    );
    const jsUri = webview.asWebviewUri(
      vscode.Uri.joinPath(base, 'modificationNotif.js')
    );
    const cssUri = webview.asWebviewUri(
      vscode.Uri.joinPath(base, 'modificationNotif.css')
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