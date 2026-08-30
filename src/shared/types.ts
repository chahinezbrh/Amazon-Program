/**
 * A single piece of documentation attached to a symbol (function, class, etc.)
 * A symbol can have several entries at once: one written, one AI-generated,
 * several voice memories recorded over time, etc.
 */
export type DocType = 'source' | 'written' | 'ai' | 'voice';

export interface DocEntry {
  id: string;
  type: DocType;

  /** Present for 'written' and 'ai' entries. Markdown/plain text. */
  content?: string;

  /** Present for 'voice' entries. Absolute path on disk to the audio file. */
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

/** Identifies which symbol the panel is showing, known instantly from the hover — no fetch needed. */
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

// shared/types.ts 
export interface DiffLine {
  type: 'del' | 'add' | 'normal';
  text: string;
}

/** Messages sent from the extension host down to the webview. */
export type ExtensionToWebviewMessage =
  | { type: 'meta'; payload: SymbolMeta }
  | { type: 'entries'; payload: DocEntry[] }
  | { type: 'error'; message: string }
  | { type: 'audioUrl'; entryId: string; url: string }
  | { type: 'aiPending' }
  | { type: 'aiDraft'; content: string }
  | { type: 'aiError'; message: string };

/** Messages sent from the webview up to the extension host. */
export type WebviewToExtensionMessage =
  | { type: 'ready' }
  | { type: 'requestAudio'; entryId: string }
  | { type: 'editWritten'; entryId?: string }
  | { type: 'generateWithAI' }
  | { type: 'saveWritten'; entryId: string; content: string }
  | { type: 'reRecordVoice' }
  | { type: 'jumpToSymbol' }
  | { type: 'generateAi'; instruction?: string }
  | { type: 'saveAi'; content: string }
  | { type: 'discardAi' };

