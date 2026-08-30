// src/shared/functionRecordsFile.ts
//
// Schema for the per-repo function-records JSON file, mirroring the pattern
// used by docFile.ts / docFileStore.ts for documentation. Kept separate from
// docs.json so the two concerns (what functions exist vs. what's documented
// about them) can be read, written, and regenerated independently.

/** One indexed function/method found in the codebase. */
export interface StoredFunctionRecord {
  name: string;
  filePath: string;   // relative to repo root, forward-slash separated
  lineStart: number;
  lineEnd: number;
  hash: string;        // current hash of the function body
  previousHash?: string; // last known hash, for change detection
  language: string;
}

export interface ParsedFunction {
  name: string;
  filePath: string;
  lineStart: number;
  lineEnd: number;
  body: string;
}


/** All function records for the whole repo, keyed by relative file path. */
export interface FunctionRecordsFile {
  files: Record<string, StoredFunctionRecord[]>;
  scannedAt: string; // ISO-8601 — when this file was last (re)generated
}

export function emptyFunctionRecordsFile(): FunctionRecordsFile {
  return { files: {}, scannedAt: new Date(0).toISOString() };
}