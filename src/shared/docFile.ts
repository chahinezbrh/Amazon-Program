// src/shared/docFile.ts
//
// The on-disk format for .docmanager/docs.json — one file for the whole repo.
//
// Field names deliberately mirror the Prisma models (writtenDoc, writtenAtHash,
// aiDocumentation, hashAtRecording, memories[]) so the mapping layer in
// docService is unchanged from the database version. Prose fields are arrays of
// lines rather than embedded "\n" strings: git diffs them line by line, so two
// people appending different paragraphs merge cleanly instead of conflicting.

export interface StoredMemory {
  /** ULID: time-sortable and collision-free without coordination, so two
   *  people recording offline never collide on a merge. */
  id: string;
  author: string;
  /** Path relative to the repo root, e.g. ".docmanager/audio/01J8X.webm" */
  audioUrl: string;
  durationSec?: number;
  transcript?: string[];
  recordedAt: string;
  hashAtRecording: string;
  isStale?: boolean;
}

export interface StoredFunction {
  name: string;
  lineStart: number;
  lineEnd: number;

  /** Hash of the normalised function body as of the last write. */
  hash: string;
  previousHash?: string;

  writtenDoc?: string[];
  writtenAuthor?: string;
  writtenAt?: string;
  writtenAtHash?: string;

  aiDocumentation?: string[];
  aiGeneratedAt?: string;
  aiGeneratedAtHash?: string;
  confidence?: string;

  memories: StoredMemory[];
}

/** All documented functions in one source file, keyed by function NAME only.
 *
 *  Keying by name+lineStart (as the Prisma @@unique did) would re-key every
 *  function the moment someone adds an import at the top of the file, orphaning
 *  every doc attached to it. Line numbers are data here, not identity. */
export type FileDocs = Record<string, StoredFunction>;

export interface DocFile {
  version: 1;
  /** Keyed by source path relative to the repo root, using forward slashes on
   *  every platform so a file written on Windows resolves on macOS. */
  files: Record<string, FileDocs>;
}

export function emptyDocFile(): DocFile {
  return { version: 1, files: {} };
}