// src/extension.ts

/*import * as vscode from 'vscode';
import { HoverProvider } from './frontend/providers/hoverProvider';
import { showDocPanel } from './frontend/commands/showDocPanel';
import { SymbolMeta } from './shared/types';
import { scanRepo } from './frontend/commands/scanRepo';
import { recordVoice, stopRecording, cancelRecording } from './frontend/commands/recordVoice';
import { initSecrets, promptForApiKey, clearApiKey } from './frontend/services/apiKey';
*/

/** Must stay in sync with activationEvents in package.json. */
/*const SUPPORTED_LANGUAGES = [
  'javascript', 'javascriptreact', 'typescript', 'typescriptreact',
  'python', 'java', 'csharp', 'cpp', 'c', 'go', 'rust',
  'php', 'ruby', 'kotlin', 'swift', 'scala', 'dart', 'lua',
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
}*/

// src/extension.ts

import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';




import { HoverProvider } from './frontend/providers/hoverProvider';
import { DocPanelProvider } from './frontend/providers/DocPanelProvider';
import { SideBarProvider } from './frontend/providers/sideBarProvider';
import { ModificationNotifProvider } from './frontend/providers/modificationNotifProvider';
import { ConnectRepoProvider } from './frontend/providers/connectRepoProvider';
import { NotificationsBellProvider } from './frontend/providers/notificationsBellProvider';

import { showDocPanel } from './frontend/commands/showDocPanel';
import { scanRepo } from './frontend/commands/scanRepo';
import { recordVoice, stopRecording, cancelRecording } from './frontend/commands/recordVoice';
import { initSecrets, promptForApiKey, clearApiKey } from './frontend/services/apiKey';

import { RELAY_WS_URL } from './backend/config';
import { WebhookClientService } from './backend/services/webhookClient';
import { handlePushWebhook } from './backend/services/commitProcessor';
import { FuncManagerStore } from './backend/services/funcManagerStore';

import { SymbolMeta } from './shared/types';
import { initGrammars } from './backend/services/wasmParser';





/** Must stay in sync with activationEvents in package.json.
 *
 *  Scoped to known languages rather than { scheme: 'file' }: the hover asks a
 *  language server for symbols on every cursor rest, and firing that on JSON,
 *  Markdown and settings files is wasted work. */
const SUPPORTED_LANGUAGES = [
  'javascript', 'javascriptreact', 'typescript', 'typescriptreact',
  'python', 'java', 'csharp', 'cpp', 'c', 'go', 'rust',
  'php', 'ruby', 'kotlin', 'swift', 'scala', 'dart', 'lua',
];

export function activate(context: vscode.ExtensionContext) {
   initGrammars(context.extensionPath);
  // Must run before anything can reach the Gemini key.
  initSecrets(context);

  // ---------------------------------------------------------------------------
  // Hover — the entry point to everything else
  // ---------------------------------------------------------------------------

  context.subscriptions.push(
    vscode.languages.registerHoverProvider(SUPPORTED_LANGUAGES, new HoverProvider())
  );

  // ---------------------------------------------------------------------------
  // Views
  // ---------------------------------------------------------------------------

  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(
      SideBarProvider.viewId,
      new SideBarProvider(context.extensionUri)
    ),
    vscode.window.registerWebviewViewProvider(
      'amazonProgram.notificationsView',
      new NotificationsBellProvider()
    )
  );

  // ---------------------------------------------------------------------------
  // Documentation panel
  //
  // The hover offers a single "Add documentation" link when a symbol has none;
  // everything else — writing, generating, recording — happens in the panel's
  // footer. So there is one way in, and it is this command.
  // ---------------------------------------------------------------------------

  context.subscriptions.push(
    vscode.commands.registerCommand('docManager.showDocPanel', (meta: SymbolMeta) =>
      showDocPanel(context, meta)
    )
  );

  // ---------------------------------------------------------------------------
  // Gemini key management
  //
  // Generation itself runs inside DocPanelProvider, which owns the refinement
  // history — there is no standalone "generate" command.
  // ---------------------------------------------------------------------------

  context.subscriptions.push(
    vscode.commands.registerCommand('docManager.setGeminiKey', promptForApiKey),
    vscode.commands.registerCommand('docManager.clearGeminiKey', clearApiKey)
  );

  // ---------------------------------------------------------------------------
  // Voice
  //
  // Recording runs through ffmpeg in the extension host, not a webview: VS Code
  // does not reliably grant getUserMedia to webview sandboxes.
  // ---------------------------------------------------------------------------

  context.subscriptions.push(
    vscode.commands.registerCommand('docManager.recordDoc', recordVoice),
    vscode.commands.registerCommand('docManager.stopRecording', stopRecording),
    vscode.commands.registerCommand('docManager.cancelRecording', cancelRecording),

  );

  // ---------------------------------------------------------------------------
  // Repository connection and scanning
  // ---------------------------------------------------------------------------

  ConnectRepoProvider.checkAndPrompt(context);

  context.subscriptions.push(
    vscode.commands.registerCommand('docManager.connectRepo', () =>
      ConnectRepoProvider.show(context)
    ),
    vscode.commands.registerCommand('docManager.scanRepo', scanRepo),
    vscode.commands.registerCommand(
      'docManager.showNotificationCenter',
      (filter?: string) => ModificationNotifProvider.show(context.extensionUri, filter || 'all')
    )
  );

  // ---------------------------------------------------------------------------
  // Live commit notifications
  // ---------------------------------------------------------------------------

  connectWebhookClient(context);

  // ---------------------------------------------------------------------------
  // Development helpers — open each panel without going through its real flow.
  // Remove before release, or gate them behind a setting.
  // ---------------------------------------------------------------------------

  context.subscriptions.push(
    vscode.commands.registerCommand('docManager.testConnectRepo', () =>
      ConnectRepoProvider.show(context)
    ),
    vscode.commands.registerCommand('docManager.testSideBar', () =>
      vscode.commands.executeCommand(`${SideBarProvider.viewId}.focus`)
    ),
    vscode.commands.registerCommand('docManager.testModificationNotif', () =>
      ModificationNotifProvider.show(context.extensionUri, 'all')
    ),
    
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

  // Reveal the sidebar shortly after startup, once the view container exists.
  setTimeout(() => {
    vscode.commands
      .executeCommand(`${SideBarProvider.viewId}.focus`)
      .then(undefined, () => {});
  }, 300);
}

/**
 * Opens a WebSocket to the relay so pushes to the connected repo arrive while
 * the editor is open. Silent no-op when the workspace has never been connected.
 */
function connectWebhookClient(context: vscode.ExtensionContext): void {
  const folder = vscode.workspace.workspaceFolders?.[0];
  if (!folder) return;

  const repoRoot = folder.uri.fsPath;
  const configPath = path.join(repoRoot, '.funcmanager', 'config.json');
  if (!fs.existsSync(configPath)) return;

  let config: { repoUrl?: string };
  try {
    config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
  } catch {
    // A malformed config shouldn't stop the rest of the extension loading.
    vscode.window.showWarningMessage(
      'Doc Manager: .funcmanager/config.json is not valid JSON — live notifications are off.'
    );
    return;
  }

  if (!config.repoUrl) return;

  const store = new FuncManagerStore(repoRoot);
  const webhookClient = new WebhookClientService(config.repoUrl, RELAY_WS_URL);

  webhookClient.on('push', async (payload) => {
    try {
      const notifications = await handlePushWebhook(
        repoRoot,
        payload.head_commit?.author?.name ?? 'Unknown',
        payload.head_commit?.message ?? ''
      );

      if (notifications.length === 0) return;

      store.appendNotifications(notifications);
      ModificationNotifProvider.currentPanel?.updateNotifications(store.getNotifications());
    } catch (err) {
      vscode.window.showErrorMessage(
        `Doc Manager: failed to process incoming commit — ${
          err instanceof Error ? err.message : 'unknown error'
        }`
      );
    }
  });

  webhookClient.connect();
  context.subscriptions.push({ dispose: () => webhookClient.dispose() });
}

export function deactivate() {
  // Everything is disposed via context.subscriptions.
}