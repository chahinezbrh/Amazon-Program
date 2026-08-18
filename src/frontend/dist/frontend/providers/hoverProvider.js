"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.HoverProvider = void 0;
const vscode = __importStar(require("vscode"));
class HoverProvider {
    async provideHover(document, position) {
        const range = document.getWordRangeAtPosition(position);
        if (!range)
            return null;
        const symbolName = document.getText(range);
        const meta = {
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
        md.appendMarkdown(`[$(add) Add memory](command:docManager.addMemory?${args}) &nbsp;&nbsp; ` +
            `[$(sparkle) AI docs](command:docManager.aiDocs?${args}) &nbsp;&nbsp; ` +
            `[$(edit) Write docs](command:docManager.writeDocs?${args})\n\n`);
        md.appendMarkdown(`---\n\n`);
        md.appendMarkdown(`**Voice memory**\n\n`);
        md.appendMarkdown(`$(play-circle) 0:47 &nbsp; <span style="color:#52b788;">❙❙❘❙❘❙❙❘❙❙❘❙❘❙❙❘❙❘❙❙❘❙❙❘❙❘❙</span>\n\n`);
        md.appendMarkdown(`---\n\n`);
        md.appendMarkdown(`&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; ` +
            `[Play memory](command:docManager.playVoice?${args})` +
            `&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; | &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;` +
            `[Full Docs](command:docManager.showDocPanel?${args})`);
        return new vscode.Hover(md);
    }
}
exports.HoverProvider = HoverProvider;
