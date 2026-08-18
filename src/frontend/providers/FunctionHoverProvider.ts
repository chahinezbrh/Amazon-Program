import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';

export class FunctionHoverProvider {
  private panel: vscode.WebviewPanel | undefined;

  constructor(private context: vscode.ExtensionContext) {}

  async showForFunction(functionName: string, filePath: string) {
    const functionData = await this.fetchFunctionData(functionName, filePath);

    if (!this.panel) {
      this.panel = vscode.window.createWebviewPanel(
        'functionHoverPopup',
        'Function Docs',
        { viewColumn: vscode.ViewColumn.Beside, preserveFocus: true },
        {
          enableScripts: true,
          localResourceRoots: [
            vscode.Uri.file(path.join(this.context.extensionPath, 'dist', 'webview')),
          ],
        }
      );

      this.panel.onDidDispose(() => {
        this.panel = undefined;
      });

      this.panel.webview.onDidReceiveMessage((message) => {
        console.log('Received from webview:', message);
        // handle message.command: 'playMemory', 'addMemory', 'generateAiDocs', 'writeDocs', 'openFullDocs'
      });
    }

    this.panel.webview.html = this.getHtml(this.panel.webview);

    // give the webview a moment to mount before sending data
    setTimeout(() => {
      this.panel?.webview.postMessage({ command: 'setData', data: functionData });
    }, 200);
  }

  private getHtml(webview: vscode.Webview): string {
    const scriptPath = vscode.Uri.file(
      path.join(this.context.extensionPath, 'dist', 'webview', 'functionHoverPopup.js')
    );
    const scriptUri = webview.asWebviewUri(scriptPath);

    return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <style>
    body { margin: 0; padding: 8px; background: transparent; }
  </style>
</head>
<body>
  <div id="root"></div>
  <script src="${scriptUri}"></script>
</body>
</html>`;
  }

  private async fetchFunctionData(functionName: string, filePath: string) {
    // TEMP mock — swap for a real fetch() to your backend once it's running
    return {
      id: '1',
      name: functionName,
      durationSec: 47,
    };
  }
}