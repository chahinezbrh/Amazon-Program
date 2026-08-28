import * as vscode from 'vscode';
import {SymbolMeta} from '../../shared/types';
import {DocPanelProvider} from '../providers/DocPanelProvider';
import { getDocsForSymbol } from '../services/docClient';


export async function showDocPanel(context: vscode.ExtensionContext, meta: SymbolMeta) {
  // 1. Show the panel (shows "Loading..." state in Webview)
  DocPanelProvider.show(context.extensionUri, meta);

  try {
    // 2. Fetch the REAL data dynamically
    const entries = await getDocsForSymbol(meta);

    // 3. Send that data to the Webview
    DocPanelProvider.currentPanel?.updateEntries(entries);
  } catch (e) {
    DocPanelProvider.currentPanel?.updateError("Failed to fetch docs");
  }
}