import * as vscode from 'vscode';
import { SymbolMeta } from '../../shared/types';

export class HoverProvider implements vscode.HoverProvider {
  public async provideHover(
    document: vscode.TextDocument,
    position: vscode.Position
  ): Promise<vscode.Hover | null> {

    const range = document.getWordRangeAtPosition(position);
    if (!range) return null;

    const symbolName = document.getText(range);

    const meta: SymbolMeta = {
      symbolName,
      filePath: document.uri.fsPath,
      startLine: range.start.line,
      endLine: range.end.line,
    };

    const args = encodeURIComponent(JSON.stringify([meta]));

    const md = new vscode.MarkdownString();
    md.isTrusted = true;
    md.supportHtml = true;
    md.supportThemeIcons = true; // <-- required for $(add), $(sparkle), etc. to render as icons

    md.appendMarkdown(
      `[$(add) Add memory](command:docManager.addMemory?${args}) &nbsp;&nbsp; ` +
      `[$(sparkle) AI docs](command:docManager.aiDocs?${args}) &nbsp;&nbsp; ` +
      `[$(edit) Write docs](command:docManager.writeDocs?${args})\n\n`
    );

    md.appendMarkdown(`---\n\n`);

    md.appendMarkdown(`**Voice memory**\n\n`);
    md.appendMarkdown(
      `$(play-circle) 0:47 &nbsp; <span style="color:#52b788;">❙❙❘❙❘❙❙❘❙❙❘❙❘❙❙❘❙❘❙❙❘❙❙❘❙❘❙</span>\n\n`
    );

    md.appendMarkdown(`---\n\n`);

    md.appendMarkdown(
      `&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; ` +
      `[Play memory](command:docManager.playVoice?${args})` +
      `&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; | &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;` +
      `[Full Docs](command:docManager.showDocPanel?${args})`
    );

    return new vscode.Hover(md);
  }
}