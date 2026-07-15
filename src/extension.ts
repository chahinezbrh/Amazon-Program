import * as vscode from 'vscode';
import { DocPanelProvider } from './frontend/providers/DocPanelProvider';
import { getDocsForSymbol } from './backend/services/docService';
import { SymbolMeta } from './shared/types';

export function activate(context: vscode.ExtensionContext) {
  // ... your existing hover provider registration, etc.

  context.subscriptions.push(
    vscode.commands.registerCommand('docManager.showDocPanel', async (meta: SymbolMeta) => {
      // 1. Open the panel immediately — meta is already known from the hover,
      //    no need to wait on anything.
      DocPanelProvider.show(context.extensionUri, meta);

      // 2. Fetch the actual entries in the background and push them in
      //    once ready. DocPanelProvider.currentPanel is guaranteed to be
      //    set synchronously by the call above.
      try {
        const entries = await getDocsForSymbol(meta);
        DocPanelProvider.currentPanel?.updateEntries(entries);
      } catch (err) {
        DocPanelProvider.currentPanel?.updateError(
          err instanceof Error ? err.message : 'Failed to load documentation'
        );
      }
    })
  );

  // ---------------------------------------------------------------------
  // TEMPORARY — lets you test the panel's UI from the Command Palette
  // before the hover is wired up. Delete this whole block once
  // 'docManager.showDocPanel' is triggered from the real hover.
  // ---------------------------------------------------------------------
  context.subscriptions.push(
    vscode.commands.registerCommand('docManager.testShowDocPanel', () => {
      const mockMeta: SymbolMeta = {
        symbolName: 'authenticate',
        filePath: __filename, // any real file so "jump to symbol" doesn't error
        startLine: 0,
        endLine: 10,
      };

      DocPanelProvider.show(context.extensionUri, mockMeta);

      // Fake network delay so you can see the loading skeleton too.
      setTimeout(() => {
        DocPanelProvider.currentPanel?.updateEntries([
          {
            id: '1',
            type: 'written',
            content:
              'Validates the JWT on the request and attaches the decoded user to ctx.state.user. Throws if the token is missing or invalid.',
            author: 'Rayhane',
            createdAt: new Date().toISOString(),
            symbolName: mockMeta.symbolName,
            filePath: mockMeta.filePath,
            startLine: mockMeta.startLine,
            endLine: mockMeta.endLine,
          },
          {
            id: '2',
            type: 'ai',
            content:
              'AI summary: middleware that authenticates incoming requests via bearer token, decoding and validating it before allowing the request to proceed.',
            author: 'AI generated',
            createdAt: new Date().toISOString(),
            symbolName: mockMeta.symbolName,
            filePath: mockMeta.filePath,
            startLine: mockMeta.startLine,
            endLine: mockMeta.endLine,
          },
          {
            id: '3',
            type: 'voice',
            audioPath: '', // point at a real .mp3/.wav on disk to test playback
            durationSeconds: 47,
            transcript:
              "...latency issues during peak traffic last sprint. We had to scale the primary cluster by 2 nodes to handle the JWT validation overhead.",
            author: 'Rayhane',
            createdAt: new Date().toISOString(),
            symbolName: mockMeta.symbolName,
            filePath: mockMeta.filePath,
            startLine: mockMeta.startLine,
            endLine: mockMeta.endLine,
          },
        ]);
      }, 1200);
    })
  );
}

export function deactivate() {}