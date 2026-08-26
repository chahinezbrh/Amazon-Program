/**
 * Shared type declarations used by both the extension (frontend) and the
 * webview layer. Keeping them here avoids duplication and ensures the
 * two sides stay in sync.
 */

// ---------------------------------------------------------------------------
// Symbol metadata — identifies a code symbol the user hovered on.
// ---------------------------------------------------------------------------

export interface SymbolMeta {

  symbolName: string;
  filePath: string;
  startLine: number;
  endLine: number;
}



/** Everything the panel needs to render docs for one hovered symbol, once loaded. */
export interface SymbolDocsPayload extends SymbolMeta {

  entries: DocEntry[];
}
// ---------------------------------------------------------------------------
// Documentation entry — one piece of documentation attached to a symbol.
// ---------------------------------------------------------------------------

export type DocType = 'source' | 'written' | 'ai' | 'voice';

export interface DocEntry {

  id: string;
  type: DocType;
  content?: string;
  audioPath?: string;
  durationSeconds?: number;
  author: string;
  createdAt: string; // ISO-8601 date string
  symbolName: string;
  filePath: string;
  startLine: number;
  endLine: number;
  isStale: boolean;

}

// ---------------------------------------------------------------------------
// Notification Center types
// ---------------------------------------------------------------------------

export interface CodeNotification {
  id: string;
  type: 'critical' | 'modification' | 'warning' | 'info';
  title: string;
  functionName: string;
  filePath: string;
  lineRange: string;
  startLine?: number;
  endLine?: number;
  description: string;
  timestamp: string;
  affectedAuthor: string;
  status: 'critical' | 'reviewed' | 'resolved';
  changeType?: string;
  diffLines?: DiffLine[]; // was: Array<{ type: 'del' | 'add' | 'normal'; text: string }>
  originalMemory?: {
    quote: string;
    duration: string;
    author: string;
    authorInfo: string;
    audioPath?: string;
  };
  suggestedFollowUp?: string;
}


// ---------------------------------------------------------------------------
// Messages sent from the webview panel to the extension host.
// ---------------------------------------------------------------------------

export type WebviewToExtensionMessage =
  | { type: 'ready' }
  | { type: 'requestAudio'; entryId: string }
  | { type: 'editWritten'; entryId?: string }
  | { type: 'reRecordVoice' }
  | { type: 'generateWithAI' }
  | { type: 'jumpToSymbol' }
  | { type: 'saveWritten'; entryId?: string; content: string };


/** Messages sent from the extension host down to the webview. */
export type ExtensionToWebviewMessage =
  | { type: 'meta'; payload: SymbolMeta }
  | { type: 'entries'; payload: DocEntry[] }
  | { type: 'error'; message: string }
  | { type: 'audioUrl'; entryId: string; url: string };

// shared/types.ts — add this near CodeNotification, nothing else touched
export interface DiffLine {
  type: 'del' | 'add' | 'normal';
  text: string;
}// shared/types.ts — add this near CodeNotification, nothing else touched
export interface DiffLine {
  type: 'del' | 'add' | 'normal';
  text: string;
}