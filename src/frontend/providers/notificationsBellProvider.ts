// src/frontend/providers/notificationsBellProvider.ts
//
// Backs the bell icon's view (amazonProgram.notificationsView). It never
// shows real content — every time it BECOMES VISIBLE (not just the first
// time it's created), it opens the real Notification Center editor panel
// and closes the sidebar again. resolveWebviewView only fires once per
// session, so onDidChangeVisibility is what makes this work on every
// reopen, not just the first click.

import * as vscode from 'vscode';

export class NotificationsBellProvider implements vscode.WebviewViewProvider {
  resolveWebviewView(webviewView: vscode.WebviewView): void {
    console.log('[NotificationsBellProvider] resolveWebviewView called');
    webviewView.webview.options = { enableScripts: false };
    webviewView.webview.html = `<!DOCTYPE html><html><body></body></html>`;

    const trigger = () => {
      if (!webviewView.visible) return; // only act when it's actually being shown, not hidden
      console.log('[NotificationsBellProvider] view became visible, opening Notification Center');
      vscode.commands.executeCommand('yourExtension.showNotificationCenter', 'all');
      setTimeout(() => {
        vscode.commands.executeCommand('workbench.action.closeSidebar');
      }, 50);
    };

    webviewView.onDidChangeVisibility(trigger);

    // Handle the very first resolve too, since resolveWebviewView itself
    // means it's visible right now.
    trigger();
  }
}