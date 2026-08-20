import * as vscode from 'vscode';
import * as path from 'path';

interface MemoryData {
  functionName: string;
  filePath: string;
  durationSec: number;
  transcript: string;
}

/**
 * PlayMemoryProvider — opens a "Now Playing" panel to the right of the editor.
 *
 * Singleton: calling show() a second time just reveals the existing panel and
 * pushes new data to it, exactly like DocPanelProvider.
 */
export class PlayMemoryProvider {
  public static currentPanel: PlayMemoryProvider | undefined;
  private static readonly viewType = 'amazonProgram.playMemory';

  private readonly panel: vscode.WebviewPanel;
  private readonly extensionPath: string;
  private disposables: vscode.Disposable[] = [];

  /** Opens (or reveals) the panel and sends memory data to the webview. */
  public static show(extensionUri: vscode.Uri, data: MemoryData) {
    const column = vscode.ViewColumn.Beside;

    if (PlayMemoryProvider.currentPanel) {
      PlayMemoryProvider.currentPanel.panel.reveal(column, /* preserveFocus */ true);
      PlayMemoryProvider.currentPanel.sendData(data);
      return;
    }

    const panel = vscode.window.createWebviewPanel(
      PlayMemoryProvider.viewType,
      `▶ ${data.functionName}`,
      { viewColumn: column, preserveFocus: true },
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [
          vscode.Uri.joinPath(extensionUri, 'dist', 'webview', 'playMemory'),
        ],
      }
    );

    PlayMemoryProvider.currentPanel = new PlayMemoryProvider(panel, extensionUri, data);
  }

  private constructor(
    panel: vscode.WebviewPanel,
    private readonly extensionUri: vscode.Uri,
    initialData: MemoryData
  ) {
    this.panel = panel;
    this.extensionPath = extensionUri.fsPath;

    this.panel.webview.html = this.getHtml(this.panel.webview);

    // Send data once the webview has mounted
    setTimeout(() => {
      this.sendData(initialData);
    }, 200);

    this.panel.onDidDispose(() => this.dispose(), null, this.disposables);

    this.panel.webview.onDidReceiveMessage(
      (message) => this.handleMessage(message),
      null,
      this.disposables
    );
  }

  private sendData(data: MemoryData) {
    this.panel.title = `▶ ${data.functionName}`;
    this.panel.webview.postMessage({ command: 'setMemoryData', data });
  }

  private handleMessage(message: { command: string; [key: string]: any }) {
    switch (message.command) {
      case 'closePlayMemory':
        this.dispose();
        break;

      case 'playMemoryToggle':
        // Hook up real audio playback from the backend here later
        console.log('[PlayMemoryProvider] toggle playback for:', message.functionName);
        break;
    }
  }

  private getHtml(webview: vscode.Webview): string {
    const jsUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.extensionUri, 'dist', 'webview', 'playMemory', 'playMemory.js')
    );
    const cssUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.extensionUri, 'dist', 'webview', 'playMemory', 'playMemory.css')
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
  <title>Now Playing</title>
</head>
<body>
  <div id="root"></div>
  <script nonce="${nonce}" src="${jsUri}"></script>
</body>
</html>`;
  }

  private dispose() {
    PlayMemoryProvider.currentPanel = undefined;
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
