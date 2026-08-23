/**
 * Shared type declarations used by both the extension (frontend) and the
 * webview layer. Keeping them here avoids duplication and ensures the
 * two sides stay in sync.
 */

// ---------------------------------------------------------------------------
// Symbol metadata — identifies a code symbol the user hovered on.
// ---------------------------------------------------------------------------

export interface SymbolMeta {
  /** The bare name of the symbol (e.g. "MyClass", "fetchUser"). */
  symbolName: string;
  /** Absolute path of the file that contains the symbol. */
  filePath: string;
  /** 0-based line number where the symbol starts. */
  startLine: number;
  /** 0-based line number where the symbol ends. */
  endLine: number;
}

// ---------------------------------------------------------------------------
// Documentation entry — one piece of documentation attached to a symbol.
// ---------------------------------------------------------------------------

export type DocKind = 'written' | 'ai' | 'voice';

export interface DocEntry {
  /** Unique identifier for this entry (e.g. a UUID or hash). */
  id: string;
  /** The kind of documentation. */
  kind: DocKind;
  /** Markdown or plain-text content (written / AI entries). */
  content?: string;
  /** Absolute path to the recorded audio file (voice entries). */
  audioPath?: string;
  /** ISO-8601 timestamp of when the entry was created. */
  createdAt: string;
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
  diffLines?: Array<{ type: 'del' | 'add' | 'normal'; text: string }>;
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
  | { type: 'editWritten'; entryId: string }
  | { type: 'reRecordVoice' }
  | { type: 'generateWithAI' }
  | { type: 'jumpToSymbol' };

