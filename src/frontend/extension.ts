import * as vscode from 'vscode';
import { FunctionHoverProvider } from './providers/FunctionHoverProvider';

export function activate(context: vscode.ExtensionContext) {
  const hoverProvider = new FunctionHoverProvider(context);

  const disposable = vscode.commands.registerCommand('yourExtension.testPopup', () => {
    // mock data — bypasses your real backend fetch, just to see the styling
    hoverProvider.showForFunction('authenticateUser', 'src/auth/middleware.js');
  });

  context.subscriptions.push(disposable);
}

export function deactivate() {}