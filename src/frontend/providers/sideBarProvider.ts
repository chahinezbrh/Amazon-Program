import * as vscode from 'vscode';
import * as path from 'path';

/**
 * SideBarProvider — registers a VS Code WebviewView in the activity-bar
 * sidebar panel. It watches the active editor and parses function names
 * from the current file, then pushes them to the webview.
 */
export class SideBarProvider implements vscode.WebviewViewProvider {
  public static readonly viewId = 'amazonProgram.sideBar';

  private _view?: vscode.WebviewView;
  private _disposables: vscode.Disposable[] = [];

  constructor(private readonly _extensionUri: vscode.Uri) {}

  /** Called by VS Code when the view becomes visible. */
  resolveWebviewView(
    webviewView: vscode.WebviewView,
    _context: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken
  ): void {
    this._view = webviewView;

    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [
        vscode.Uri.joinPath(this._extensionUri, 'dist', 'webview', 'sideBar'),
      ],
    };

    webviewView.webview.html = this._getHtml(webviewView.webview);

    // Handle messages from the webview
    webviewView.webview.onDidReceiveMessage(
      (message) => {
        switch (message.command) {
          case 'selectFunction':
            this._jumpToFunction(message.functionName);
            break;
          case 'recordMemory':
            vscode.commands.executeCommand('yourExtension.recordMemory');
            break;
        }
      },
      null,
      this._disposables
    );

    // Push data whenever the active editor changes
    this._disposables.push(
      vscode.window.onDidChangeActiveTextEditor(() => this._pushData()),
      vscode.workspace.onDidChangeTextDocument(() => this._pushData())
    );

    // Initial push
    this._pushData();
  }

  /** Send current file + function names to the webview. */
  private _pushData(): void {
    const editor = vscode.window.activeTextEditor;
    if (!this._view) return;

    if (!editor) {
      this._view.webview.postMessage({
        command: 'setData',
        fileName: '',
        functions: [],
      });
      return;
    }

    const fileName = path.basename(editor.document.fileName);
    const functions = this._parseFunctions(editor.document);

    this._view.webview.postMessage({
      command: 'setData',
      fileName,
      functions,
    });
  }

  /**
   * Very lightweight regex-based function name extractor.
   * Works for JS/TS/Python/Go — good enough for a sidebar list.
   * The extension host can swap this for a proper LSP call later.
   */
  private _parseFunctions(document: vscode.TextDocument): FunctionItem[] {
    const text = document.getText();
    const results: FunctionItem[] = [];
    const seen = new Set<string>();

    // Patterns that match common function declaration styles
    const patterns = [
      // JS/TS: function foo(  |  async function foo(  |  export function foo(
      /(?:export\s+)?(?:async\s+)?function\s+([A-Za-z_$][A-Za-z0-9_$]*)\s*\(/g,
      // Arrow / method: const foo = (  |  foo = (  |  foo: (
      /(?:const|let|var)\s+([A-Za-z_$][A-Za-z0-9_$]*)\s*=\s*(?:async\s*)?\(/g,
      // Class method: public/private/protected foo(
      /(?:(?:public|private|protected|static|async)\s+)+([A-Za-z_$][A-Za-z0-9_$]*)\s*\(/g,
      // Python: def foo(
      /def\s+([A-Za-z_][A-Za-z0-9_]*)\s*\(/g,
      // Go: func foo(
      /func\s+([A-Za-z_][A-Za-z0-9_]*)\s*\(/g,
    ];

    for (const pattern of patterns) {
      let match: RegExpExecArray | null;
      pattern.lastIndex = 0;
      while ((match = pattern.exec(text)) !== null) {
        const name = match[1];
        if (!seen.has(name)) {
          seen.add(name);
          results.push({ name, hasMemory: false, isSelected: results.length === 0 });
        }
      }
    }

    return results;
  }

  /** Try to find and reveal the function definition in the active editor. */
  private _jumpToFunction(functionName: string): void {
    const editor = vscode.window.activeTextEditor;
    if (!editor) return;

    const text = editor.document.getText();
    const index = text.indexOf(functionName);
    if (index === -1) return;

    const position = editor.document.positionAt(index);
    editor.selection = new vscode.Selection(position, position);
    editor.revealRange(
      new vscode.Range(position, position),
      vscode.TextEditorRevealType.InCenter
    );
  }

  /** HTML shell that loads the bundled JS + CSS. */
  private _getHtml(webview: vscode.Webview): string {
    const scriptUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this._extensionUri, 'dist', 'webview', 'sideBar', 'sideBar.js')
    );
    const cssUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this._extensionUri, 'dist', 'webview', 'sideBar', 'sideBar.css')
    );

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <link rel="stylesheet" href="${cssUri}" />
  <style>
    html, body { margin: 0; padding: 0; height: 100%; background: transparent; }
  </style>
</head>
<body>
  <div id="root"></div>
  <script src="${scriptUri}"></script>
</body>
</html>`;
  }

  dispose(): void {
    this._disposables.forEach((d) => d.dispose());
    this._disposables = [];
  }
}

interface FunctionItem {
  name: string;
  hasMemory: boolean;
  isSelected: boolean;
}
