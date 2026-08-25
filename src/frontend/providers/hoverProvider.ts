import * as vscode from 'vscode';
import * as path from 'path';
import { DocEntry, SymbolMeta } from '../../shared/types';
import { detectFunctionAtPosition } from '../services/functionDetector';
import { getDocsForSymbol } from '../services/docClient';
import { getDocManagerEntries } from '../services/docManagerReader';
import { DocPanelProvider } from './DocPanelProvider';
import { RecordPanelProvider } from './recordPanelProvider';
import { PlayMemoryProvider } from './playMemoryProvider';
import {
  getAddMemorySvg,
  getAiDocsSvg,
  getWriteDocsSvg,
  getVoiceMemoryLabelSvg,
  getVoiceMemorySvg,
  getNoMemorySvg,
  getFooterPlayMemorySvg,
  getFooterFullDocsSvg,
} from './hoverIcons';

export class HoverProvider implements vscode.HoverProvider {
  public static currentPanel: HoverProvider | undefined;
  private panel: vscode.WebviewPanel | undefined;
  private currentMeta: SymbolMeta | undefined;
  private disposables: vscode.Disposable[] = [];

  constructor(private readonly context: vscode.ExtensionContext) { }

  /**
   * Called by VS Code when the user hovers over text in any document.
   * Renders the hover ONLY if hovering on a function's name.
   */
  public async provideHover(
    document: vscode.TextDocument,
    position: vscode.Position
  ): Promise<vscode.Hover | null> {
    const detected = await detectFunctionAtPosition(document, position);
    if (!detected) {
      return null; // Not a function name — do not show hover
    }

    const meta: SymbolMeta = {
      symbolName: detected.name,
      filePath: document.uri.fsPath,
      startLine: detected.range.start.line,
      endLine: detected.range.end.line,
    };

    const args = encodeURIComponent(JSON.stringify([meta]));

    // Read voice memory state locally from .docmanager via docManagerReader
    const docManagerEntries = await getDocManagerEntries(meta);
    const voiceDoc = docManagerEntries.find((d) => d.type === 'voice');
    const hasVoiceMemory = Boolean(voiceDoc);

    const durationSec = voiceDoc?.durationSeconds ?? 47;
    const mins = Math.floor(durationSec / 60);
    const secs = durationSec % 60;
    const formattedDuration = `${mins}:${secs < 10 ? '0' : ''}${secs}`;

    const md = new vscode.MarkdownString('', true);
    md.isTrusted = true;
    md.supportHtml = true;
    md.supportThemeIcons = true;

    // Header buttons (Top row: 3 pill buttons ONLY)
    const addMemoryBtn = `[![+ Add memory](${getAddMemorySvg()})](command:yourExtension.recordDoc?${args})`;
    const aiDocsBtn = `[![AI docs](${getAiDocsSvg()})](command:docManager.aiDocs?${args})`;
    const writeDocsBtn = `[![Write docs](${getWriteDocsSvg()})](command:docManager.writeDocs?${args})`;

    md.appendMarkdown(`${addMemoryBtn}&nbsp;&nbsp;${aiDocsBtn}&nbsp;&nbsp;${writeDocsBtn}`);
    md.appendMarkdown(`\n\n---\n\n`);

    // Voice memory content (Middle section)
    if (hasVoiceMemory) {
      const labelImg = `![Voice memory](${getVoiceMemoryLabelSvg()})`;
      const voicePill = `[![Play voice memory](${getVoiceMemorySvg(formattedDuration)})](command:docManager.playVoice?${args})`;
      md.appendMarkdown(`${labelImg}\n\n${voicePill}\n\n`);
    } else {
      const noMemoryImg = `![There is no voice memory !](${getNoMemorySvg()})`;
      md.appendMarkdown(`${noMemoryImg}\n\n`);
    }

    // Bottom footer section
    md.appendMarkdown(`---\n\n`);
    const fullDocsBtn = `[![Full Docs](${getFooterFullDocsSvg()})](command:docManager.showDocPanel?${args})`;

    if (hasVoiceMemory) {
      const playMemoryFooterBtn = `[![Play memory](${getFooterPlayMemorySvg()})](command:docManager.playVoice?${args})`;
      md.appendMarkdown(`&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;${playMemoryFooterBtn}&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;|&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;${fullDocsBtn}`);
    } else {
      md.appendMarkdown(`&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;${fullDocsBtn}`);
    }

    return new vscode.Hover(md, detected.selectionRange);
  }

  /**
   * Opens or reveals the Function Hover Popup Webview for a specific function.
   */
  public async showForFunction(
    functionName: string,
    filePath: string,
    startLine = 0,
    endLine = 0
  ) {
    const meta: SymbolMeta = {
      symbolName: functionName,
      filePath,
      startLine,
      endLine,
    };
    this.currentMeta = meta;

    const functionData = await this.fetchFunctionData(meta);

    if (this.panel) {
      this.panel.reveal(vscode.ViewColumn.Beside, true);
      this.panel.title = `Function: ${functionName}`;
      this.panel.webview.postMessage({ command: 'setData', data: functionData });
      return;
    }

    this.panel = vscode.window.createWebviewPanel(
      'functionHoverPopup',
      `Function: ${functionName}`,
      { viewColumn: vscode.ViewColumn.Beside, preserveFocus: true },
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [
          vscode.Uri.file(path.join(this.context.extensionPath, 'dist', 'webview')),
          ...(vscode.workspace.workspaceFolders?.map((f) => f.uri) ?? []),
        ],
      }
    );

    this.panel.onDidDispose(() => {
      this.panel = undefined;
      while (this.disposables.length) {
        this.disposables.pop()?.dispose();
      }
    }, null, this.disposables);

    this.panel.webview.onDidReceiveMessage(
      (message) => this.handleWebviewMessage(message),
      null,
      this.disposables
    );

    this.panel.webview.html = this.getHtml(this.panel.webview);

    setTimeout(() => {
      this.panel?.webview.postMessage({ command: 'setData', data: functionData });
    }, 200);
  }

  private async handleWebviewMessage(message: any) {
    if (!this.currentMeta) return;

    switch (message.command) {
      case 'ready': {
        const functionData = await this.fetchFunctionData(this.currentMeta);
        this.panel?.webview.postMessage({ command: 'setData', data: functionData });
        break;
      }

      case 'openFullDocs': {
        DocPanelProvider.show(this.context.extensionUri, this.currentMeta);
        try {
          const entries = await getDocsForSymbol(this.currentMeta);
          DocPanelProvider.currentPanel?.updateEntries(entries);
        } catch {
          // Fallback handled by DocPanelProvider
        }
        break;
      }

      case 'addMemory': {
        RecordPanelProvider.show(this.context.extensionUri, this.currentMeta);
        break;
      }

      case 'playMemory': {
        let transcript = 'Playing memory for ' + this.currentMeta.symbolName;
        let durationSec = 47;
        try {
          const docs = await getDocsForSymbol(this.currentMeta);
          const voice = docs.find((d) => d.type === 'voice');
          if (voice?.durationSeconds) durationSec = voice.durationSeconds;
          if (voice?.content) transcript = voice.content;
        } catch { }

        PlayMemoryProvider.show(this.context.extensionUri, {
          functionName: this.currentMeta.symbolName,
          filePath: this.currentMeta.filePath,
          durationSec,
          transcript,
        });
        break;
      }

      case 'generateAiDocs': {
        vscode.commands.executeCommand('docManager.aiDocs', this.currentMeta);
        break;
      }

      case 'writeDocs': {
        vscode.commands.executeCommand('docManager.writeDocs', this.currentMeta);
        break;
      }

      default:
        console.log('[HoverProvider] Webview message:', message);
    }
  }

  private async fetchFunctionData(meta: SymbolMeta) {
    // Whether a voice memory exists — and its duration — must reflect ONLY
    // what's recorded locally in the workspace's `.docmanager` folder
    // (see docManagerReader.ts). This must not depend on the (possibly
    // slow/offline) network doc client, same as the native hover above.
    const docManagerEntries = await getDocManagerEntries(meta);
    const voiceDoc = docManagerEntries.find((d) => d.type === 'voice');
    const hasVoiceMemory = Boolean(voiceDoc);
    const durationSec = voiceDoc?.durationSeconds ?? 47;

    // Doc count (used for "Full docs") can still come from the network
    // client — it's not what gates the "no voice memory" message.
    let docs: DocEntry[] = [];
    try {
      docs = await getDocsForSymbol(meta);
    } catch {
      docs = [];
    }

    return {
      id: meta.symbolName,
      name: meta.symbolName,
      filePath: meta.filePath,
      hasMemory: hasVoiceMemory,
      durationSec,
      docsCount: docs.length,
    };
  }

  private getHtml(webview: vscode.Webview): string {
    const scriptUri = webview.asWebviewUri(
      vscode.Uri.joinPath(
        this.context.extensionUri,
        'dist',
        'webview',
        'functionHoverPopup.js'
      )
    );
    const cssUri = webview.asWebviewUri(
      vscode.Uri.joinPath(
        this.context.extensionUri,
        'dist',
        'webview',
        'functionHoverPopup.css'
      )
    );
    const nonce = getNonce();

    return /* html */ `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy"
    content="default-src 'none';
             img-src ${webview.cspSource} data:;
             media-src ${webview.cspSource} blob:;
             style-src ${webview.cspSource} 'unsafe-inline' https://fonts.googleapis.com;
             font-src https://fonts.gstatic.com;
             script-src 'nonce-${nonce}';" />
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;600&display=swap">
  <link rel="stylesheet" href="${cssUri}">
  <style>
    html, body {
      margin: 0;
      padding: 0;
      background-color: #1a1d1e;
      overflow: hidden;
    }
  </style>
</head>
<body>
  <div id="root"></div>
  <script nonce="${nonce}" src="${scriptUri}"></script>
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