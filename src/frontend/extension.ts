import * as vscode from 'vscode';
import { FunctionHoverProvider } from './providers/FunctionHoverProvider';
import { DocPanelProvider } from './providers/DocPanelProvider';
import { SideBarProvider } from './providers/sideBarProvider';
import { SymbolMeta, DocEntry } from '../shared/types';
import { PlayMemoryProvider } from './providers/playMemoryProvider';


export function activate(context: vscode.ExtensionContext) {
  const hoverProvider = new FunctionHoverProvider(context);

  const testPopupCommand = vscode.commands.registerCommand('yourExtension.testPopup', () => {
    hoverProvider.showForFunction('authenticateUser', 'src/auth/middleware.js');
  });

  const testDocPanelCommand = vscode.commands.registerCommand('yourExtension.testDocPanel', () => {
    const mockMeta: SymbolMeta = {
      symbolName: 'authenticateUser',
      filePath: 'src/auth/middleware.js',
      startLine: 10,
      endLine: 25,
    };

    DocPanelProvider.show(context.extensionUri, mockMeta);

    // simulate the async doc-entries lookup resolving shortly after the panel opens
    setTimeout(() => {
      const mockEntries: DocEntry[] = [
        {
          id: '1',
          kind: 'written',
          content: 'This function checks the user session token and returns the authenticated user.',
          createdAt: new Date().toISOString(),
        },
        {
          id: '2',
          kind: 'ai',
          content: 'AI-generated summary: validates a bearer token against the session store.',
          createdAt: new Date().toISOString(),
        },
        {
          id: '3',
          kind: 'voice',
          audioPath: 'C:\\path\\to\\some\\recording.mp3',
          createdAt: new Date().toISOString(),
        },
      ];

      DocPanelProvider.currentPanel?.updateEntries(mockEntries);
    }, 500);
  });

  const sideBarProvider = new SideBarProvider(context.extensionUri);
  const sideBarView = vscode.window.registerWebviewViewProvider(
    SideBarProvider.viewId,
    sideBarProvider
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

  context.subscriptions.push(testPopupCommand, testDocPanelCommand, sideBarView, testSideBarCommand , testPlayMemoryCommand);
}

export function deactivate() {}