import * as vscode from 'vscode';
import { CodeNotification } from '../../shared/types';

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

  private notifications: CodeNotification[] = [
    {
      id: 'notif-1',
      type: 'critical',
      title: 'processPayment() — logic changed under memory',
      functionName: 'processPayment()',
      filePath: 'src/payments/stripe.js',
      lineRange: 'line 42-67',
      startLine: 42,
      endLine: 67,
      description: "The retry backoff interval was modified. Karim's memory no longer matches.",
      timestamp: '2 hours ago',
      affectedAuthor: "Karim's memory affected",
      status: 'critical',
      changeType: 'Logic changed',
      diffLines: [
        { type: 'del', text: '- retryAfter = 2000; // fixed' },
        { type: 'del', text: '- attempts = 3;' },
        { type: 'add', text: '+ retryAfter = base * 2 ** n;' },
        { type: 'add', text: '+ attempts = 5; // exponential' },
      ],
      originalMemory: {
        quote: '“Never remove the idempotency key — Stripe will double charge on retry.”',
        duration: '0:38',
        author: 'Karim Haddad',
        authorInfo: 'left team 3mo ago',
      },
      suggestedFollowUp: 'Does the idempotency key still apply with the new exponential backoff?',
    },
    {
      id: 'notif-2',
      type: 'critical',
      title: 'verifyToken() — function signature changed',
      functionName: 'verifyToken()',
      filePath: 'src/auth/middleware.js',
      lineRange: 'line 12-18',
      startLine: 12,
      endLine: 18,
      description: 'A new parameter was added. The recorded explanation may be incomplete.',
      timestamp: '6 hours ago',
      affectedAuthor: "Sara's memory affected",
      status: 'critical',
      changeType: 'Function signature changed',
      diffLines: [
        { type: 'del', text: '- export function verifyToken(token: string) {' },
        { type: 'add', text: '+ export function verifyToken(token: string, options?: VerifyOptions) {' },
        { type: 'add', text: '+   if (options?.strict) validateIssuer(token);' },
      ],
      originalMemory: {
        quote: '“The token verification must always check expiry and signature before reading claims.”',
        duration: '0:45',
        author: 'Sara Chen',
        authorInfo: 'active contributor',
      },
      suggestedFollowUp: 'Are all callers passing the new options argument properly?',
    },
    {
      id: 'notif-3',
      type: 'modification',
      title: 'authenticateUser() — error handler updated',
      functionName: 'authenticateUser()',
      filePath: 'src/auth/middleware.js',
      lineRange: 'line 20-35',
      startLine: 20,
      endLine: 35,
      description: 'Custom error codes were added to authentication rejection.',
      timestamp: '1 day ago',
      affectedAuthor: "Alex's memory affected",
      status: 'resolved',
      changeType: 'Error handler updated',
      diffLines: [
        { type: 'del', text: '- throw new Error("Auth failed");' },
        { type: 'add', text: '+ throw new AuthError("INVALID_TOKEN", 401);' },
      ],
      originalMemory: {
        quote: '“Ensure all authentication failures return a standard 401 response.”',
        duration: '0:22',
        author: 'Alex Rivera',
        authorInfo: 'team lead',
      },
      suggestedFollowUp: 'Are client applications handling the structured AuthError response?',
    },
    {
      id: 'notif-4',
      type: 'modification',
      title: 'createCustomer() — webhook payload extended',
      functionName: 'createCustomer()',
      filePath: 'src/payments/stripe.js',
      lineRange: 'line 80-110',
      startLine: 80,
      endLine: 110,
      description: 'Stripe metadata fields updated during onboarding step.',
      timestamp: '2 days ago',
      affectedAuthor: "Karim's memory affected",
      status: 'resolved',
      changeType: 'Payload extended',
    },
    {
      id: 'notif-5',
      type: 'modification',
      title: 'webhookHandler() — idempotency key added',
      functionName: 'webhookHandler()',
      filePath: 'src/payments/webhook.js',
      lineRange: 'line 15-40',
      startLine: 15,
      endLine: 40,
      description: 'Event verification now uses cryptographic signature check.',
      timestamp: '3 days ago',
      affectedAuthor: "Sara's memory affected",
      status: 'resolved',
      changeType: 'Verification updated',
    },
  ];

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
          vscode.Uri.joinPath(extensionUri, 'dist', 'webview', 'modificationNotif'),
        ],
      }
    );

    ModificationNotifProvider.currentPanel = new ModificationNotifProvider(
      panel,
      extensionUri,
      initialFilter
    );
  }

  private constructor(
    panel: vscode.WebviewPanel,
    extensionUri: vscode.Uri,
    private initialFilter: string
  ) {
    this.panel = panel;
    this.extensionUri = extensionUri;

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
          const workspaceFolders = vscode.workspace.workspaceFolders;
          let fileUri: vscode.Uri;
          if (vscode.Uri.parse(notif.filePath).scheme === 'file') {
            fileUri = vscode.Uri.file(notif.filePath);
          } else if (workspaceFolders && workspaceFolders.length > 0) {
            fileUri = vscode.Uri.joinPath(workspaceFolders[0].uri, notif.filePath);
          } else {
            fileUri = vscode.Uri.file(notif.filePath);
          }

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

      case 'recordNewMemory': {
        const notif = message.notification as CodeNotification;
        vscode.commands.executeCommand('yourExtension.recordMemory', notif);
        vscode.window.showInformationMessage(`Recording new memory for ${notif.functionName}...`);
        break;
      }

      case 'markResolved': {
        const id = message.id;
        this.notifications = this.notifications.map((n) =>
          n.id === id ? { ...n, status: 'resolved' } : n
        );
        this.sendData();
        break;
      }

      case 'markReviewed': {
        const id = message.id;
        this.notifications = this.notifications.map((n) =>
          n.id === id ? { ...n, status: 'reviewed' } : n
        );
        this.sendData();
        break;
      }
    }
  }

  private getHtml(webview: vscode.Webview): string {
    const jsUri = webview.asWebviewUri(
      vscode.Uri.joinPath(
        this.extensionUri,
        'dist',
        'webview',
        'modificationNotif',
        'modificationNotif.js'
      )
    );
    const cssUri = webview.asWebviewUri(
      vscode.Uri.joinPath(
        this.extensionUri,
        'dist',
        'webview',
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
