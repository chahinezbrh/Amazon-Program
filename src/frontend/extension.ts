import * as vscode from 'vscode';
import { HoverProvider } from './providers/hoverProvider';
import { DocPanelProvider } from './providers/DocPanelProvider';
import { SideBarProvider } from './providers/sideBarProvider';
import { SymbolMeta, DocEntry } from '../shared/types';
import { PlayMemoryProvider } from './providers/playMemoryProvider';
import { ModificationNotifProvider } from './providers/modificationNotifProvider';
import { ConnectRepoProvider } from './providers/connectRepoProvider';
import { RecordPanelProvider } from './providers/recordPanelProvider';
import * as fs from 'fs';
import * as path from 'path';
import { RELAY_WS_URL } from '../backend/config';
import { WebhookClientService } from '../backend/services/webhookClient';
import { handlePushWebhook } from '../backend/services/commitProcessor';
import { FuncManagerStore } from '../backend/services/funcManagerStore';
import { NotificationsBellProvider } from './providers/notificationsBellProvider';



export function activate(context: vscode.ExtensionContext) {
  const hoverProvider = new HoverProvider(context);

  // Register hover provider for all files
  const hoverRegistration = vscode.languages.registerHoverProvider(
    { scheme: 'file' },
    hoverProvider
  );

  ConnectRepoProvider.checkAndPrompt(context);

  const connectRepoCommand = vscode.commands.registerCommand(
    'yourExtension.connectRepo',
    () => {
      ConnectRepoProvider.show(context);
    }
  );

  const testConnectRepoCommand = vscode.commands.registerCommand(
    'yourExtension.testConnectRepo',
    () => {
      ConnectRepoProvider.show(context);
    }
  );

  const showFunctionPopupCommand = vscode.commands.registerCommand(
    'yourExtension.showFunctionPopup',
    (meta: SymbolMeta) => {
      hoverProvider.showForFunction(
        meta.symbolName,
        meta.filePath,
        meta.startLine,
        meta.endLine
      );
    }
  );

  const testPopupCommand = vscode.commands.registerCommand('yourExtension.testPopup', () => {
    hoverProvider.showForFunction('authenticateUser', 'src/auth/middleware.js');
  });

  const showDocPanelCommand = vscode.commands.registerCommand(
    'docManager.showDocPanel',
    (meta: SymbolMeta) => {
      DocPanelProvider.show(context.extensionUri, meta);
    }
  );

  const openFullDocsCommand = vscode.commands.registerCommand(
    'docManager.openFullDocs',
    (meta: SymbolMeta) => {
      DocPanelProvider.show(context.extensionUri, meta);
    }
  );

  const testDocPanelCommand = vscode.commands.registerCommand('yourExtension.testDocPanel', () => {
    const mockMeta: SymbolMeta = {
      symbolName: 'authenticateUser',
      filePath: 'src/auth/middleware.js',
      startLine: 10,
      endLine: 25,
    };

    DocPanelProvider.show(context.extensionUri, mockMeta);

    setTimeout(() => {
      const mockEntries: DocEntry[] = [
        {
          id: '1',
          type: 'written',
          content: 'This function checks the user session token and returns the authenticated user.',
          author: 'Unknown',
          createdAt: new Date().toISOString(),
          symbolName: mockMeta.symbolName,
          filePath: mockMeta.filePath,
          startLine: mockMeta.startLine,
          endLine: mockMeta.endLine,
          isStale: false,
        },
        {
          id: '2',
          type: 'ai',
          content: 'AI-generated summary: validates a bearer token against the session store.',
          author: 'Unknown',
          createdAt: new Date().toISOString(),
          symbolName: mockMeta.symbolName,
          filePath: mockMeta.filePath,
          startLine: mockMeta.startLine,
          endLine: mockMeta.endLine,
          isStale: false,
        },
        {
          id: '3',
          type: 'voice',
          audioPath: 'C:\\path\\to\\some\\recording.mp3',
          author: 'Unknown',
          createdAt: new Date().toISOString(),
          symbolName: mockMeta.symbolName,
          filePath: mockMeta.filePath,
          startLine: mockMeta.startLine,
          endLine: mockMeta.endLine,
          isStale: false,
        },
      ];

      DocPanelProvider.currentPanel?.updateEntries(mockEntries);
    }, 500);
  });

  const recordDocCommand = vscode.commands.registerCommand(
    'yourExtension.recordDoc',
    (meta: SymbolMeta) => {
      RecordPanelProvider.show(context.extensionUri, meta);
    }
  );

  const docManagerRecordDocCommand = vscode.commands.registerCommand(
    'docManager.recordDoc',
    (meta: SymbolMeta) => {
      RecordPanelProvider.show(context.extensionUri, meta);
    }
  );

  const docManagerAddMemoryCommand = vscode.commands.registerCommand(
    'docManager.addMemory',
    (meta: SymbolMeta) => {
      RecordPanelProvider.show(context.extensionUri, meta);
    }
  );

  const docManagerAiDocsCommand = vscode.commands.registerCommand(
    'docManager.aiDocs',
    (meta: SymbolMeta) => {
      vscode.window.showInformationMessage(
        `AI Documentation requested for ${meta?.symbolName || 'symbol'}.`
      );
    }
  );

  const docManagerWriteDocsCommand = vscode.commands.registerCommand(
    'docManager.writeDocs',
    (meta: SymbolMeta) => {
      if (meta) {
        DocPanelProvider.show(context.extensionUri, meta);
      }
    }
  );

  const docManagerPlayVoiceCommand = vscode.commands.registerCommand(
    'docManager.playVoice',
    (meta: SymbolMeta) => {
      PlayMemoryProvider.show(context.extensionUri, {
        functionName: meta?.symbolName || 'Function',
        filePath: meta?.filePath || '',
        durationSec: 47,
        transcript: 'Voice documentation recording.',
      });
    }
  );

  const testRecordDocCommand = vscode.commands.registerCommand(
    'yourExtension.testRecordDoc',
    () => {
      const mockMeta: SymbolMeta = {
        symbolName: 'authenticateUser',
        filePath: 'src/auth/middleware.js',
        startLine: 10,
        endLine: 25,
      };
      RecordPanelProvider.show(context.extensionUri, mockMeta);
    }
  );

  const sideBarProvider = new SideBarProvider(context.extensionUri);
  const sideBarView = vscode.window.registerWebviewViewProvider(
    SideBarProvider.viewId,
    sideBarProvider
  );

  const notificationsBellProvider = new NotificationsBellProvider();
  const notificationsBellView = vscode.window.registerWebviewViewProvider(
    'amazonProgram.notificationsView',
    notificationsBellProvider
  );

  const testSideBarCommand = vscode.commands.registerCommand('yourExtension.testSideBar', () => {
    vscode.commands.executeCommand(`${SideBarProvider.viewId}.focus`);
  });

  const testPlayMemoryCommand = vscode.commands.registerCommand('yourExtension.testPlayMemory', () => {
    PlayMemoryProvider.show(context.extensionUri, {
      functionName: 'authenticateUser',
      filePath: 'src/auth/middleware.js',
      durationSec: 47,
      transcript: 'This function checks whether the incoming request has a valid session token before allowing access.',
    });
  });

  const showNotifCenterCommand = vscode.commands.registerCommand(
    'yourExtension.showNotificationCenter',
    (filter?: string) => {
      ModificationNotifProvider.show(context.extensionUri, filter || 'all');
    }
  );

  const testModificationNotifCommand = vscode.commands.registerCommand(
    'yourExtension.testModificationNotif',
    () => {
      ModificationNotifProvider.show(context.extensionUri, 'all');
    }
  );

  const workspaceFolders = vscode.workspace.workspaceFolders;
  if (workspaceFolders && workspaceFolders.length > 0) {
    const repoRoot = workspaceFolders[0].uri.fsPath;
    const configPath = path.join(repoRoot, '.funcmanager', 'config.json');

    if (fs.existsSync(configPath)) {
      const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));

      if (config.repoUrl) {
        const store = new FuncManagerStore(repoRoot);
        const webhookClient = new WebhookClientService(config.repoUrl, RELAY_WS_URL);

        webhookClient.on('push', async (payload) => {
           console.log(`[extension] push event received for ${repoRoot}`);
          try {
            const notifications = await handlePushWebhook(
              repoRoot,
              payload.head_commit?.author?.name ?? 'Unknown',
              payload.head_commit?.message ?? ''
            );
            console.log(`[extension] handlePushWebhook returned ${notifications.length} notifications`);
            if (notifications.length > 0) {
              store.appendNotifications(notifications);
              if (ModificationNotifProvider.currentPanel) {
                ModificationNotifProvider.currentPanel.updateNotifications(store.getNotifications());
              }
            }
          } catch (err: any) {
            console.log(`[extension] handlePushWebhook threw: ${err.message}`);
            vscode.window.showErrorMessage(`Failed to process incoming commit: ${err.message}`);
          }
        });

        webhookClient.connect();
        context.subscriptions.push({ dispose: () => webhookClient.dispose() });
      }
    }
  }

  context.subscriptions.push(
    hoverRegistration,
    connectRepoCommand,
    testConnectRepoCommand,
    showFunctionPopupCommand,
    testPopupCommand,
    showDocPanelCommand,
    openFullDocsCommand,
    testDocPanelCommand,
    recordDocCommand,
    docManagerRecordDocCommand,
    docManagerAddMemoryCommand,
    docManagerAiDocsCommand,
    docManagerWriteDocsCommand,
    docManagerPlayVoiceCommand,
    testRecordDocCommand,
    sideBarView,
    notificationsBellView, 
    testSideBarCommand,
    testPlayMemoryCommand,
    showNotifCenterCommand,
    testModificationNotifCommand
  );

  setTimeout(() => {
    vscode.commands.executeCommand(`${SideBarProvider.viewId}.focus`).then(undefined, () => { });
  }, 300);
}

export function deactivate() { }