// src/backend/services/docService.ts
//
// Same public surface as the Prisma version — toDocEntries / getDocsForSymbol /
// saveDoc — so nothing above this layer changes. Only the persistence swapped.

import { DocEntry, SymbolMeta } from '../../shared/types';
import { StoredFunction, StoredMemory } from '../../shared/docFile';
import { readFileDocs, writeFileDocs, newMemoryId } from './docFileStore';

export type SaveDocInput =
  | { type: 'written'; meta: SymbolMeta; codeHash: string; content: string; author: string }
  | { type: 'ai'; meta: SymbolMeta; codeHash: string; content: string }
  | {
      type: 'voice';
      meta: SymbolMeta;
      codeHash: string;
      audioUrl: string;
      author: string;
      durationSec?: number;
      transcript?: string;
    };

const toLines = (s: string): string[] => s.split('\n');
const fromLines = (l: string[] | undefined): string => (l ?? []).join('\n');

// ---------------------------------------------------------------------------
// Read
// ---------------------------------------------------------------------------

/** Flattens one stored function into the entries the panel's tab bar renders,
 *  in tab order: written, ai, then voice memories oldest-first. */
export function toDocEntries(fn: StoredFunction, filePath: string): DocEntry[] {
  const entries: DocEntry[] = [];
  const loc = {
    symbolName: fn.name,
    filePath,
    startLine: fn.lineStart,
    endLine: fn.lineEnd,
  };

  if (fn.sourceDoc?.content.length) {
    entries.push({
      id: `${filePath}:${fn.name}:source`,
      type: 'source',
      ...loc,
      content: fromLines(fn.sourceDoc.content),
      author: 'From source',
      createdAt: fn.sourceDoc.extractedAt,
      isStale: false,
  });
}

  if (fn.writtenDoc?.length) {
    entries.push({
      id: `${filePath}:${fn.name}:written`,
      type: 'written',
      ...loc,
      content: fromLines(fn.writtenDoc),
      author: fn.writtenAuthor ?? 'Unknown',
      createdAt: fn.writtenAt ?? new Date(0).toISOString(),
      isStale: fn.writtenAtHash !== undefined && fn.writtenAtHash !== fn.hash,
    });
  }

  if (fn.aiDocumentation?.length) {
    entries.push({
      id: `${filePath}:${fn.name}:ai`,
      type: 'ai',
      ...loc,
      content: fromLines(fn.aiDocumentation),
      author: 'AI generated',
      createdAt: fn.aiGeneratedAt ?? new Date(0).toISOString(),
      isStale:
        fn.aiGeneratedAtHash !== undefined && fn.aiGeneratedAtHash !== fn.hash,
    });
  }

  for (const memory of fn.memories) {
    entries.push({
      id: memory.id,
      type: 'voice',
      ...loc,
      audioPath: memory.audioUrl,
      ...(memory.durationSec !== undefined
        ? { durationSeconds: memory.durationSec }
        : {}),
      ...(memory.transcript?.length
        ? { transcript: fromLines(memory.transcript) }
        : {}),
      author: memory.author,
      createdAt: memory.recordedAt,
      isStale: memory.isStale === true || memory.hashAtRecording !== fn.hash,
    });
  }

  return entries;
}

/** Every doc attached to the hovered symbol. Empty array when the function has
 *  never been documented — that is the panel's EmptyState, not an error. */
export async function getDocsForSymbol(
  repoRoot: string,
  meta: SymbolMeta
): Promise<DocEntry[]> {
  const functions = await readFileDocs(repoRoot, meta.filePath);
  const fn = functions[meta.symbolName];
  return fn ? toDocEntries(fn, meta.filePath) : [];
}

// ---------------------------------------------------------------------------
// Write
// ---------------------------------------------------------------------------

/** Persists one doc and returns it as the panel will render it, so the caller
 *  can swap in the canonical version (real id, real timestamp) after saving. */
export async function saveDoc(repoRoot: string, input: SaveDocInput): Promise<DocEntry> {
  const { meta, codeHash } = input;
  const functions = await readFileDocs(repoRoot, meta.filePath);

  const existing = functions[meta.symbolName];
  const fn: StoredFunction = existing
    ? { ...existing, lineStart: meta.startLine, lineEnd: meta.endLine }
    : {
        name: meta.symbolName,
        lineStart: meta.startLine,
        lineEnd: meta.endLine,
        hash: codeHash,
        memories: [],
      };

  // Code moved on since the last write: roll the old hash forward and mark
  // recordings that no longer describe the current body.
  if (fn.hash !== codeHash) {
    fn.previousHash = fn.hash;
    fn.hash = codeHash;
    fn.memories = fn.memories.map((m) =>
      m.hashAtRecording !== codeHash ? { ...m, isStale: true } : m
    );
  }

  const now = new Date().toISOString();
  let savedId: string;

  switch (input.type) {
    case 'written':
      fn.writtenDoc = toLines(input.content);
      fn.writtenAuthor = input.author;
      fn.writtenAt = now;
      fn.writtenAtHash = codeHash;
      // A human editing a function that already has an AI doc is what
      // AI_REVIEWED means. Without one, this is simply a human doc.
      if (fn.aiDocumentation?.length) fn.confidence = 'AI_REVIEWED';
      savedId = `${meta.filePath}:${meta.symbolName}:written`;
      break;

    case 'ai':
      fn.aiDocumentation = toLines(input.content);
      fn.aiGeneratedAt = now;
      fn.aiGeneratedAtHash = codeHash;
      fn.confidence = 'AI_ONLY'; // regenerating discards any human review
      savedId = `${meta.filePath}:${meta.symbolName}:ai`;
      break;

    case 'voice': {
      const memory: StoredMemory = {
        id: newMemoryId(),
        author: input.author,
        audioUrl: input.audioUrl,
        recordedAt: now,
        hashAtRecording: codeHash,
        ...(input.durationSec !== undefined ? { durationSec: input.durationSec } : {}),
        ...(input.transcript ? { transcript: toLines(input.transcript) } : {}),
      };
      fn.memories = [...fn.memories, memory];
      savedId = memory.id;
      break;
    }
  }

  functions[meta.symbolName] = fn;
  await writeFileDocs(repoRoot, meta.filePath, functions);

  const saved = toDocEntries(fn, meta.filePath).find((e) => e.id === savedId);
  if (!saved) throw new Error(`saveDoc: no ${input.type} entry after write`);
  return saved;
}