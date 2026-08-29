import * as vscode from 'vscode';
import { DocEntry, SymbolMeta, WebviewToExtensionMessage } from '../../shared/types';
import { getDocsForSymbol, saveDoc, currentAuthor } from '../services/docClient';
import { generateDocumentation, type Turn } from '../../backend/services/geminiService';
import { requireApiKey } from '../services/apiKey';

/**
 * Manages the "Show Doc" side panel: a single reusable webview that displays
 * every documentation entry (source, written, AI-generated, voice) attached to
 * whichever symbol the user hovered on.
 *
 * The panel opens INSTANTLY with just the symbol's name and location (known
 * synchronously from the hover), then shows a loading state until the caller
 * pushes entries in via `updateEntries()`.
 *
 * There is only ever one panel open at a time — calling `show()` again just
 * reveals it and swaps its content, the way VS Code's own panels behave.
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

  /** Refinement turns for the AI draft currently on screen. Deliberately not
   *  persisted: docs.json stores the accepted documentation, not the
   *  conversation that produced it. Cleared whenever the symbol changes. */
  private aiHistory: Turn[] = [];

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
          // Matches build-webview.js's actual output location for this panel.
          vscode.Uri.joinPath(extensionUri, 'dist', 'webview', 'docPanel'),
          // Voice recordings live in the USER'S repo (.docmanager/audio), not in
          // the extension folder. A webview refuses to load any file outside
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

  private constructor(
    panel: vscode.WebviewPanel,
    extensionUri: vscode.Uri,
    meta: SymbolMeta
  ) {
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
    this.aiHistory = [];
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
          this.panel.webview.postMessage({
            type: 'entries',
            payload: this.currentEntries,
          });
        } else if (this.currentEntries === null && this.currentError) {
          this.panel.webview.postMessage({ type: 'error', message: this.currentError });
        }
        break;

      case 'requestAudio': {
        const entry = this.currentEntries?.find((e) => e.id === message.entryId);
        if (!entry?.audioPath) break;

        // audioPath is stored RELATIVE to the repo root so a recording made here
        // still resolves after a teammate clones to a different path. Resolve it
        // against the workspace only at playback time.
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

      case 'saveWritten': {
        await saveDoc({
          type: 'written',
          meta: this.currentMeta,
          content: message.content,
          author: currentAuthor(),
        });

        // Read back from disk rather than reusing the cached array: the saved
        // entry gets its real timestamp and isStale from the service.
        const fresh = await getDocsForSymbol(this.currentMeta);
        this.currentEntries = fresh;
        this.panel.webview.postMessage({ type: 'entries', payload: fresh });
        break;
      }

      case 'generateAi':
        await this.generateAi(message.instruction);
        break;

      case 'saveAi': {
        await saveDoc({
          type: 'ai',
          meta: this.currentMeta,
          content: message.content,
        });
        this.aiHistory = [];
        const refreshed = await getDocsForSymbol(this.currentMeta);
        this.currentEntries = refreshed;
        this.panel.webview.postMessage({ type: 'entries', payload: refreshed });
        break;
      }

      case 'discardAi':
        this.aiHistory = [];
        break;

      case 'reRecordVoice':
        vscode.commands.executeCommand('docManager.recordDoc', this.currentMeta);
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
        case 'editWritten': {
        const draft: DocEntry = {
          id: '__draft__',
          type: 'written',
          content: '',
          author: currentAuthor(),
          createdAt: new Date().toISOString(),
          symbolName: this.currentMeta.symbolName,
          filePath: this.currentMeta.filePath,
          startLine: this.currentMeta.startLine,
          endLine: this.currentMeta.endLine,
          isStale: false,
        };
        const withDraft = [...(this.currentEntries ?? []), draft];
        this.currentEntries = withDraft;
        this.panel.webview.postMessage({ type: 'entries', payload: withDraft });
        this.panel.webview.postMessage({ type: 'openEditor', entryId: draft.id });
        break;
      }

      case 'generateWithAI':
        await this.generateAi();
        break;
    }
  }

  /**
   * Generates or refines an AI draft and pushes it to the panel UNSAVED.
   * Nothing reaches docs.json until the user presses Save.
   */
  private async generateAi(instruction?: string): Promise<void> {
    const apiKey = await requireApiKey();
    if (!apiKey) {
      this.panel.webview.postMessage({
        type: 'aiError',
        message: 'A Gemini API key is needed to generate documentation.',
      });
      return;
    }

    this.panel.webview.postMessage({ type: 'aiPending' });

    try {
      const document = await vscode.workspace.openTextDocument(
        vscode.Uri.file(this.currentMeta.filePath)
      );

      // The live buffer, so unsaved edits get documented rather than the last
      // version written to disk.
      const source = document.getText(
        new vscode.Range(this.currentMeta.startLine, 0, this.currentMeta.endLine + 1, 0)
      );

      const existingComment = this.currentEntries?.find(
        (entry) => entry.type === 'source'
      )?.content;

      const content = await generateDocumentation(apiKey, {
        symbolName: this.currentMeta.symbolName,
        filePath: vscode.workspace.asRelativePath(this.currentMeta.filePath),
        source,
        ...(existingComment ? { existingComment } : {}),
        history: this.aiHistory,
        ...(instruction ? { instruction } : {}),
      });

      // Gemini keeps no session, so every turn resends the history.
      if (instruction) this.aiHistory.push({ role: 'user', text: instruction });
      this.aiHistory.push({ role: 'model', text: content });

      this.panel.webview.postMessage({ type: 'aiDraft', content });
    } catch (err) {
      console.error('AI generation failed:', err);
      this.panel.webview.postMessage({
        type: 'aiError',
        message: err instanceof Error ? err.message : 'Generation failed.',
      });
    }
  }

  private getHtml(webview: vscode.Webview): string {
    const base = vscode.Uri.joinPath(
      this.extensionUri,
      'dist',
      'webview',
      'docPanel'
    );
    const cssUri = webview.asWebviewUri(vscode.Uri.joinPath(base, 'docPanel.css'));
    const jsUri = webview.asWebviewUri(vscode.Uri.joinPath(base, 'docPanel.js'));
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