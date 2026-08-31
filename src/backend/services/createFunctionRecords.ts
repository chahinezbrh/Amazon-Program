// src/backend/services/createFunctionRecords.ts
//
// Walks a repo, parses every supported file, and writes one JSON file
// (<repo>/.funcmanager/functions.json) containing every function found.
// Mirrors docFileStore.ts's atomic-write pattern for the same crash-safety
// reasons: a half-written functions.json would be worse than a missing one.
//
// Deliberately stored in a SEPARATE directory from .docmanager (used for
// docs.json) — function records and documentation are two independent
// concerns, regenerated on different triggers (re-scan vs. edit), so keeping
// them in separate files avoids one write racing the other.

import { promises as fs } from 'fs';
import * as path from 'path';
import { walk } from '../db/fileWalker';
import { isLanguageSupported } from '../db/languageConfigs';
import { parseSource } from './wasmParser';
import { hashSource } from '../../shared/hash';
import {
  FunctionRecordsFile,
  StoredFunctionRecord,
  emptyFunctionRecordsFile,
} from '../../shared/functionRecordsFile';

const RECORDS_DIR = '.funcmanager';
const RECORDS_FILE = 'functions.json';

export function functionRecordsPathFor(repoRoot: string): string {
  return path.join(repoRoot, RECORDS_DIR, RECORDS_FILE);
}

/** Source paths are stored relative to the repo root with forward slashes, so
 *  a records file written on Windows still resolves for a teammate on Linux. */
function relativeKeyFor(repoRoot: string, sourceFilePath: string): string {
  return path.relative(repoRoot, sourceFilePath).split(path.sep).join('/');
}

// ---------------------------------------------------------------------------
// Whole-file access
// ---------------------------------------------------------------------------

export async function readFunctionRecordsFile(
  repoRoot: string
): Promise<FunctionRecordsFile> {
  const target = functionRecordsPathFor(repoRoot);

  let raw: string;
  try {
    raw = await fs.readFile(target, 'utf8');
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
      return emptyFunctionRecordsFile();
    }
    throw err;
  }

  try {
    const parsed = JSON.parse(raw) as FunctionRecordsFile;
    if (!parsed.files) return emptyFunctionRecordsFile();
    return parsed;
  } catch {
    throw new Error(
      `${RECORDS_DIR}/${RECORDS_FILE} is not valid JSON. If it contains merge conflict ` +
        `markers, resolve them before re-scanning.`
    );
  }
}

/** Writes atomically (temp file + rename) so a crash mid-write can't leave a
 *  truncated records file behind. */
export async function writeFunctionRecordsFile(
  repoRoot: string,
  doc: FunctionRecordsFile
): Promise<void> {
  const target = functionRecordsPathFor(repoRoot);
  await fs.mkdir(path.dirname(target), { recursive: true });

  const serialised = JSON.stringify(sortRecordsFile(doc), null, 2) + '\n';
  const temp = `${target}.tmp`;
  await fs.writeFile(temp, serialised, 'utf8');
  await fs.rename(temp, target);
}

/** Stable key/array order so two scans of unchanged code produce an identical
 *  file — avoids spurious diffs if this file is ever committed. */
function sortRecordsFile(doc: FunctionRecordsFile): FunctionRecordsFile {
  const files: Record<string, StoredFunctionRecord[]> = {};

  for (const [filePath, records] of Object.entries(doc.files).sort(([a], [b]) =>
    a.localeCompare(b)
  )) {
    files[filePath] = [...records].sort(
      (a, b) => a.lineStart - b.lineStart || a.name.localeCompare(b.name)
    );
  }

  return { ...doc, files };
}

// ---------------------------------------------------------------------------
// The scan — walk, parse, hash, write
// ---------------------------------------------------------------------------

/**
 * Walks the whole repo, parses every supported file, hashes each function's
 * body, and writes the complete result to functions.json — overwriting
 * whatever was there before (a full re-scan, not an incremental one).
 */
export async function createFunctionRecords(
  repoRoot: string
): Promise<FunctionRecordsFile> {
  const codeFiles = walk(repoRoot);
  const files: Record<string, StoredFunctionRecord[]> = {};

  for (const file of codeFiles) {
    // No grammar shipped for this language — skip rather than fail the scan.
    if (!isLanguageSupported(file.language)) continue;

    let source: string;
    try {
      source = await fs.readFile(file.path, 'utf8');
    } catch {
      continue; // unreadable, or vanished mid-scan
    }

    const key = relativeKeyFor(repoRoot, file.path);
    const parsedFunctions = await parseSource(source, key, file.language);
    if (parsedFunctions.length === 0) continue;

    files[key] = parsedFunctions.map(
      (fn): StoredFunctionRecord => ({
        name: fn.name,
        filePath: key,
        lineStart: fn.lineStart,
        lineEnd: fn.lineEnd,
        hash: hashSource(fn.body),
        language: file.language,
      })
    );
  }

  const result: FunctionRecordsFile = {
    files,
    scannedAt: new Date().toISOString(),
  };

  await writeFunctionRecordsFile(repoRoot, result);
  return result;
}