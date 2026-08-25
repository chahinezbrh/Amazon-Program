import * as vscode from 'vscode';
import { DocEntry, SymbolMeta, WebviewToExtensionMessage } from '../../shared/types';
import { getDocsForSymbol, saveDoc, currentAuthor } from '../services/docClient';

/**
 * Manages the "Show Doc" side panel: a single reusable webview that
 * displays every documentation entry (source, written, AI-generated, voice)
 * attached to whichever symbol the user hovered on.
 *
 * The panel opens INSTANTLY with just the symbol's name/location (known
 * synchronously from the hover), then shows a loading state in its content
 * area until the caller pushes the actual entries in via `updateEntries()`.
 * This matters when entries come from a slow lookup — the user gets visual
 * feedback right away instead of a dead click while `getDocsForSymbol()`
 * resolves.
 *
 * There is only ever one panel open at a time — calling `show()` again
 * just reveals it and swaps its content, the same way VS Code's own
 * "Problems" or "Output" panels behave.
 */
export class DocPanelProvider {
  public static currentPanel: DocPanelProvider | undefined;
  private static readonly viewType = 'docManager.showDocPanel';

  private readonly panel: vscode.WebviewPanel;
  private readonly extensionUri: vscode.Uri;
  private disposables: vscode.Disposable[] = [];

  private currentMeta: SymbolMeta;
  /** undefined = still loading, DocEntry[] = loaded (possibly empty), null = load failed. */
  private currentEntries: DocEntry[] | undefined | null = undefined;
  private currentError: string | undefined;

  /** Opens (or reveals + resets) the panel immediately, before entries are known. */
  public static show(extensionUri: vscode.Uri, meta: SymbolMeta) {
    const column = vscode.ViewColumn.Beside;

    if (DocPanelProvider.currentPanel) {
      DocPanelProvider.currentPanel.panel.reveal(column, /* preserveFocus */ true);
      DocPanelProvider.currentPanel.resetForNewSymbol(meta);
      return;
    }

    const panel = vscode.window.createWebviewPanel(
      DocPanelProvider.viewType,
      `Docs: ${meta.symbolName}`,
      { viewColumn: column, preserveFocus: true },
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [
          // The bundled webview, emitted by build:webview.
          vscode.Uri.joinPath(extensionUri, 'out', 'frontend', 'webviews', 'docPanel'),
          // Voice recordings live in the USER'S repo (.docmanager/audio), not
          // in the extension folder. A webview refuses to load any file outside
          // these roots, so without this the audio silently never plays.
          ...(vscode.workspace.workspaceFolders?.map((folder) => folder.uri) ?? []),
        ],
      }
    );

    DocPanelProvider.currentPanel = new DocPanelProvider(panel, extensionUri, meta);
  }

  /** Called by the command handler once the (possibly async) lookup resolves. */
  public updateEntries(entries: DocEntry[]) {
    this.currentEntries = entries;
    this.currentError = undefined;
    this.panel.webview.postMessage({ type: 'entries', payload: entries });
  }

  /** Read by scanRepo so it can refresh the panel after a repo-wide import. */
  public getCurrentMeta(): SymbolMeta {
    return this.currentMeta;
  }

  /** Called by the command handler if the lookup fails. */
  public updateError(message: string) {
    this.currentEntries = null;
    this.currentError = message;
    this.panel.webview.postMessage({ type: 'error', message });
  }

  private constructor(panel: vscode.WebviewPanel, extensionUri: vscode.Uri, meta: SymbolMeta) {
    this.panel = panel;
    this.extensionUri = extensionUri;
    this.currentMeta = meta;

    this.panel.webview.html = this.getHtml(this.panel.webview);
    this.panel.onDidDispose(() => this.dispose(), null, this.disposables);
    this.panel.webview.onDidReceiveMessage(
      (message: WebviewToExtensionMessage) => this.handleMessage(message),
      null,
      this.disposables
    );
  }

  private resetForNewSymbol(meta: SymbolMeta) {
    this.currentMeta = meta;
    this.currentEntries = undefined; // back to loading
    this.currentError = undefined;
    this.panel.title = `Docs: ${meta.symbolName}`;
    this.panel.webview.postMessage({ type: 'meta', payload: meta });
  }

  private async handleMessage(message: WebviewToExtensionMessage) {
    switch (message.type) {
      case 'ready':
        // Webview just mounted (or remounted after retainContextWhenHidden
        // brought it back) — replay whatever state we currently have.
        this.panel.webview.postMessage({ type: 'meta', payload: this.currentMeta });
        if (this.currentEntries) {
          this.panel.webview.postMessage({ type: 'entries', payload: this.currentEntries });
        } else if (this.currentEntries === null && this.currentError) {
          this.panel.webview.postMessage({ type: 'error', message: this.currentError });
        }
        break;

      case 'requestAudio': {
        const entry = this.currentEntries?.find((e) => e.id === message.entryId);
        if (!entry?.audioPath) break;

        // audioPath is stored RELATIVE to the repo root (".docmanager/audio/x.webm")
        // so a recording made here still resolves after a teammate clones to a
        // different path. Resolve it against the workspace only at playback time.
        const folder = vscode.workspace.getWorkspaceFolder(
          vscode.Uri.file(this.currentMeta.filePath)
        );
        if (!folder) break;

        const audioUri = vscode.Uri.joinPath(folder.uri, ...entry.audioPath.split('/'));
        this.panel.webview.postMessage({
          type: 'audioUrl',
          entryId: entry.id,
          url: this.panel.webview.asWebviewUri(audioUri).toString(),
        });
        break;
      }

      case 'editWritten': {
        const entry = this.currentEntries?.find((e) => e.id === message.entryId);
        vscode.commands.executeCommand('docManager.editDoc', entry ?? this.currentMeta);
        break;
      }

      case 'reRecordVoice':
        vscode.commands.executeCommand('docManager.recordDoc', this.currentMeta);
        break;

      case 'generateWithAI':
        vscode.commands.executeCommand('docManager.generateDoc', this.currentMeta);
        break;

      case 'jumpToSymbol': {
        const doc = await vscode.workspace.openTextDocument(this.currentMeta.filePath);
        await vscode.window.showTextDocument(doc, {
          selection: new vscode.Range(
            this.currentMeta.startLine,
            0,
            this.currentMeta.startLine,
            0
          ),
          viewColumn: vscode.ViewColumn.One,
        });
        break;
      }

      case 'saveWritten': {
        if (!this.currentMeta) break;

        await saveDoc({
          type: 'written',
          meta: this.currentMeta,
          content: message.content,
          author: currentAuthor(),
        });

        // Read back what is now on disk rather than reusing the cached array:
        // the saved entry gets its real timestamp and isStale from the service.
        const fresh = await getDocsForSymbol(this.currentMeta);
        this.currentEntries = fresh;
        this.panel.webview.postMessage({ type: 'entries', payload: fresh });
        break;
      }
    }
  }

  private getHtml(webview: vscode.Webview): string {
    const cssUri = webview.asWebviewUri(
      vscode.Uri.joinPath(
        this.extensionUri,
        'out',
        'frontend',
        'webviews',
        'docPanel',
        'docPanel.css'
      )
    );
    const jsUri = webview.asWebviewUri(
      vscode.Uri.joinPath(
        this.extensionUri,
        'out',
        'frontend',
        'webviews',
        'docPanel',
        'docPanel.js'
      )
    );
    const nonce = getNonce();

    // media-src needs blob: as well as cspSource — without it the CSP blocks
    // playback and the audio element fails with no visible error.
    return /* html */ `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta http-equiv="Content-Security-Policy"
    content="default-src 'none';
             img-src ${webview.cspSource} data:;
             media-src ${webview.cspSource} blob:;
             style-src ${webview.cspSource} 'unsafe-inline';
             script-src 'nonce-${nonce}';" />
  <link href="${cssUri}" rel="stylesheet" />
  <title>Documentation</title>
</head>
<body>
  <div id="root"></div>
  <script nonce="${nonce}" src="${jsUri}"></script>
</body>
</html>`;
  }

  private dispose() {
    DocPanelProvider.currentPanel = undefined;
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