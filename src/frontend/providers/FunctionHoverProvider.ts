import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { SymbolMeta, DocEntry } from '../../shared/types';
import { DocPanelProvider } from './DocPanelProvider';

export class FunctionHoverProvider {
  private panel: vscode.WebviewPanel | undefined;
  private currentName: string = '';        // ← added
  private currentFilePath: string = '';    // ← added

  constructor(private context: vscode.ExtensionContext) {}

  async showForFunction(functionName: string, filePath: string) {
    this.currentName = functionName;        // ← added — actually stores it
    this.currentFilePath = filePath;        // ← added

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
        if (message.command === 'openFullDocs') {
          const meta: SymbolMeta = {
            symbolName: this.currentName,
            filePath: this.currentFilePath,
            startLine: 0,
            endLine: 0,
          };
          DocPanelProvider.show(this.context.extensionUri, meta);

          this.fetchDocEntries(meta).then((entries) => {
            DocPanelProvider.currentPanel?.updateEntries(entries);
          });
        } else {
          console.log('Received from webview:', message);
        }
      });
    }

    this.panel.webview.html = this.getHtml(this.panel.webview);

    setTimeout(() => {
      this.panel?.webview.postMessage({ command: 'setData', data: functionData });
    }, 200);
  }

  // ← added — was missing entirely
  private async fetchDocEntries(meta: SymbolMeta): Promise<DocEntry[]> {
    // TEMP mock — replace with a real backend call later
    return [
      {
        id: '1',
        kind: 'written',
        content: `Docs for ${meta.symbolName}`,
        createdAt: new Date().toISOString(),
      },
    ];
  }

  private getHtml(webview: vscode.Webview): string {
    const scriptPath = vscode.Uri.file(
      path.join(this.context.extensionPath, 'dist', 'webview', 'functionHoverPopup.js')
    );
    const cssPath = vscode.Uri.file(
      path.join(this.context.extensionPath, 'dist', 'webview', 'functionHoverPopup.css')
    );
    const scriptUri = webview.asWebviewUri(scriptPath);
    const cssUri = webview.asWebviewUri(cssPath);

    return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <link rel="stylesheet" href="${cssUri}">
  <style>
    body { margin: 0; padding: 0; background: transparent; }
  </style>
</head>
<body>
  <div id="root"></div>
  <script src="${scriptUri}"></script>
</body>
</html>`;
  }

  private async fetchFunctionData(functionName: string, filePath: string) {
    return {
      id: '1',
      name: functionName,
      durationSec: 47,
    };
  }
}