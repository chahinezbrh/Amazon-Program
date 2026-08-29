// src/frontend/providers/RecordPanelProvider.ts
//
// Hosts the recording webview.
//
// Recording MUST happen in a webview: MediaRecorder and getUserMedia are
// browser APIs, and the extension host is plain Node with no microphone
// access. The captured audio crosses back as base64 over postMessage, which is
// the only route across the webview boundary without a local server.

import * as vscode from 'vscode';
import type { SymbolMeta } from '../../shared/types';
import { saveAudio } from '../../backend/services/audioStore';
import { saveDoc, currentAuthor, getDocsForSymbol } from '../services/docClient';
import { DocPanelProvider } from './DocPanelProvider';

type FromWebview =
  | { type: 'ready' }
  | { type: 'recorded'; base64: string; durationSec: number; mimeType: string }
  | { type: 'cancel' };

export class RecordPanelProvider {
  private static current: RecordPanelProvider | undefined;
  private static readonly viewType = 'docManager.recordPanel';

  private readonly panel: vscode.WebviewPanel;
  private readonly extensionUri: vscode.Uri;
  private readonly meta: SymbolMeta;
  private disposables: vscode.Disposable[] = [];

  public static show(extensionUri: vscode.Uri, meta: SymbolMeta) {
    RecordPanelProvider.current?.panel.dispose();

    const panel = vscode.window.createWebviewPanel(
      RecordPanelProvider.viewType,
      `Record: ${meta.symbolName}`,
      { viewColumn: vscode.ViewColumn.Beside, preserveFocus: false },
      {
        enableScripts: true,
        retainContextWhenHidden: false,
        localResourceRoots: [
          vscode.Uri.joinPath(extensionUri, 'dist', 'webview', 'recordPanel'),
        ],
      }
    );

    RecordPanelProvider.current = new RecordPanelProvider(panel, extensionUri, meta);
  }

  private constructor(
    panel: vscode.WebviewPanel,
    extensionUri: vscode.Uri,
    meta: SymbolMeta
  ) {
    this.panel = panel;
    this.extensionUri = extensionUri;
    this.meta = meta;

    this.panel.webview.html = this.getHtml(panel.webview);
    this.panel.onDidDispose(() => this.dispose(), null, this.disposables);
    this.panel.webview.onDidReceiveMessage(
      (message: FromWebview) => this.handleMessage(message),
      null,
      this.disposables
    );
  }

  private async handleMessage(message: FromWebview) {
    switch (message.type) {
      case 'ready':
        this.panel.webview.postMessage({ type: 'meta', payload: this.meta });
        break;

      case 'cancel':
        this.panel.dispose();
        break;

      case 'recorded':
        await this.persist(message);
        break;
    }
  }

  private async persist(message: {
    base64: string;
    durationSec: number;
    mimeType: string;
  }) {
    const folder = vscode.workspace.getWorkspaceFolder(
      vscode.Uri.file(this.meta.filePath)
    );
    if (!folder) {
      vscode.window.showErrorMessage(
        'Doc Manager: this file is outside the workspace.'
      );
      return;
    }

    // Optional note. Whisper or VS Code Speech could fill this automatically
    // later — the transcript field is already in the storage format.
    const transcript = await vscode.window.showInputBox({
      prompt: 'Add a short transcript or note (optional)',
      placeHolder: 'What does this recording explain?',
    });

    try {
      const id = `${Date.now().toString(36)}${Math.random()
        .toString(36)
        .slice(2, 8)}`;
      const extension = message.mimeType.includes('ogg') ? 'ogg' : 'webm';

      const audioUrl = await saveAudio(
        folder.uri.fsPath,
        id,
        message.base64,
        extension
      );

      await saveDoc({
        type: 'voice',
        meta: this.meta,
        audioUrl,
        author: currentAuthor(),
        durationSec: Math.round(message.durationSec),
        ...(transcript ? { transcript } : {}),
      });

      this.panel.dispose();

      // Push the new memory straight into the open doc panel.
      const doc = DocPanelProvider.currentPanel;
      if (doc) doc.updateEntries(await getDocsForSymbol(this.meta));

      vscode.window.showInformationMessage(
        `Doc Manager: voice memo saved for ${this.meta.symbolName}.`
      );
    } catch (err) {
      vscode.window.showErrorMessage(
        `Doc Manager: could not save recording — ${err instanceof Error ? err.message : 'unknown error'
        }`
      );
    }
  }

  private getHtml(webview: vscode.Webview): string {
    const base = vscode.Uri.joinPath(
      this.extensionUri,
      'dist',
      'webview',
      'recordPanel'
    );
    const cssUri = webview.asWebviewUri(
      vscode.Uri.joinPath(base, 'recordPanel.css')
    );
    const jsUri = webview.asWebviewUri(
      vscode.Uri.joinPath(base, 'recordPanel.js')
    );

    const nonce = getNonce();

    // media-src blob: is required for the local playback preview — without it
    // the CSP blocks the object URL and the preview is silently empty.
    return /* html */ `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta http-equiv="Content-Security-Policy"
    content="default-src 'none';
             media-src blob:;
             style-src ${webview.cspSource} 'unsafe-inline';
             script-src 'nonce-${nonce}';" />
  <link href="${cssUri}" rel="stylesheet" />
  <title>Record</title>
</head>
<body>
  <div id="root"></div>
  <script nonce="${nonce}" src="${jsUri}"></script>
</body>
</html>`;
  }

  private dispose() {
    RecordPanelProvider.current = undefined;
    this.panel.dispose();
    while (this.disposables.length) this.disposables.pop()?.dispose();
  }
}

function getNonce(): string {
  const chars =
    'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let text = '';
  for (let i = 0; i < 32; i++) {
    text += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return text;
}