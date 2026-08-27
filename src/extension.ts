// src/extension.ts

import * as vscode from 'vscode';
import { HoverProvider } from './frontend/providers/hoverProvider';
import { showDocPanel } from './frontend/commands/showDocPanel';
import { SymbolMeta } from './shared/types';
import { scanRepo } from './frontend/commands/scanRepo';
import { recordVoice, stopRecording, cancelRecording } from './frontend/commands/recordVoice';
import { initSecrets, promptForApiKey, clearApiKey } from './frontend/services/apiKey';


/** Must stay in sync with activationEvents in package.json. */
const SUPPORTED_LANGUAGES = [
  'javascript',
  'typescript',
  'javascriptreact',
  'typescriptreact',
];

export function activate(context: vscode.ExtensionContext) {

  initSecrets(context);   // must run before any generation

  context.subscriptions.push(
    vscode.commands.registerCommand('docManager.setGeminiKey', promptForApiKey),
    vscode.commands.registerCommand('docManager.clearGeminiKey', clearApiKey)
  );

  // -------------------------------------------------------------------------
  // 1. The trigger: hovering a symbol
  // -------------------------------------------------------------------------

  const hoverProvider = new HoverProvider();
  context.subscriptions.push(
    vscode.languages.registerHoverProvider(SUPPORTED_LANGUAGES, hoverProvider)
  );

  // -------------------------------------------------------------------------
  // 2. The task: open the panel and load its documentation
  // -------------------------------------------------------------------------

  context.subscriptions.push(
    vscode.commands.registerCommand(
      'docManager.showDocPanel',
      (meta: SymbolMeta) => showDocPanel(context, meta)
    )
  );

  context.subscriptions.push(
  vscode.commands.registerCommand('docManager.scanRepo', scanRepo)
  );

  context.subscriptions.push(
  vscode.commands.registerCommand('docManager.recordDoc', recordVoice),
  vscode.commands.registerCommand('docManager.stopRecording', stopRecording),
  vscode.commands.registerCommand('docManager.cancelRecording', cancelRecording)
 );
  // -------------------------------------------------------------------------
  // 3. Not built yet.
  //
  // These MUST be registered even as stubs: the hover renders them as
  // command: URIs, and an unregistered command URI fails silently — the user
  // clicks and nothing happens, with no error anywhere to explain why.
  // -------------------------------------------------------------------------

  const notImplemented = (id: string) =>
    vscode.commands.registerCommand(id, () =>
      vscode.window.showInformationMessage(`"${id}" isn't built yet.`)
    );

  context.subscriptions.push(
    notImplemented('docManager.addMemory'),
    notImplemented('docManager.aiDocs'),
    notImplemented('docManager.writeDocs'),
    notImplemented('docManager.playVoice'),
    notImplemented('docManager.editDoc'),
    notImplemented('docManager.generateDoc'),
  );

  // -------------------------------------------------------------------------
  // 4. TEMPORARY — opens the panel for a known symbol straight from the
  // Command Palette, so the read path can be tested without relying on the
  // hover resolving the right symbol. Routes through the real command rather
  // than a parallel path, so what you see is what the hover will produce.
  //
  // Point this at a function you have seeded in .docmanager/docs.json.
  // Delete once the hover is trusted.
  // -------------------------------------------------------------------------

  context.subscriptions.push(
    vscode.commands.registerCommand('docManager.testShowDocPanel', async () => {
      const folder = vscode.workspace.workspaceFolders?.[0];
      if (!folder) {
        vscode.window.showErrorMessage('Open a folder first.');
        return;
      }

      const meta: SymbolMeta = {
        symbolName: 'authenticate',
        filePath: vscode.Uri.joinPath(folder.uri, 'middleware.js').fsPath,
        startLine: 2,
        endLine: 14,
      };

      await vscode.commands.executeCommand('docManager.showDocPanel', meta);
    })
  );
}

export function deactivate() {
  // Everything is disposed via context.subscriptions.
}