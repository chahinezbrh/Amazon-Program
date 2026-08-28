// src/frontend/services/docClient.ts
//
// With docs stored as files in the repo, there is no server: the extension host
// reads and writes them directly.

import * as vscode from 'vscode';
import type { DocEntry, SymbolMeta } from '../../shared/types';
import * as docService from '../../backend/services/docService';

export type SaveDocRequest =
  | { type: 'written'; meta: SymbolMeta; content: string; author: string }
  | { type: 'ai'; meta: SymbolMeta; content: string }
  | {
      type: 'voice';
      meta: SymbolMeta;
      audioUrl: string;
      author: string;
      durationSec?: number;
      transcript?: string;
    };

/**
 * TEMPORARY STUB.
 *
 * Rayhane's change-detection module already hashes function bodies; this will
 * be replaced by a call into it rather than a second implementation, since two
 * different normalisations would make every doc report as permanently stale.
 *
 * Returning a constant (not null, not empty) keeps codeHash a plain string, so
 * every stored `writtenAtHash` / `hashAtRecording` equals the current `hash` and
 * everything reads isStale: false. Staleness can still be exercised by editing
 * a hash by hand in a .docmanager JSON file.
 */
const STUB_HASH = 'STUB_HASH';

export async function hashSymbol(_meta: SymbolMeta): Promise<string> {
  return STUB_HASH;
}

function repoRootFor(filePath: string): string {
  const folder = vscode.workspace.getWorkspaceFolder(vscode.Uri.file(filePath));
  if (!folder) {
    throw new Error('This file is not inside an open workspace folder.');
  }
  return folder.uri.fsPath;
}

export function currentAuthor(): string {
  return (
    vscode.workspace.getConfiguration('docManager').get<string>('author') ??
    'Unknown'
  );
}

export async function getDocsForSymbol(meta: SymbolMeta): Promise<DocEntry[]> {
  return docService.getDocsForSymbol(repoRootFor(meta.filePath), meta);
}

export async function saveDoc(request: SaveDocRequest): Promise<DocEntry> {
  const codeHash = await hashSymbol(request.meta);
  return docService.saveDoc(repoRootFor(request.meta.filePath), {
    ...request,
    codeHash,
  } as docService.SaveDocInput);
}