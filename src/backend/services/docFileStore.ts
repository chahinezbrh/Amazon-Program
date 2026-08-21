// src/backend/services/docFileStore.ts
//
// Replaces createRepoDb.ts / repoDb.ts / schema.prisma.
//
// One JSON file for the whole repo: <repo>/.docmanager/docs.json
//
// Deliberately free of any vscode import so it can be unit-tested with a temp
// directory and no extension host.

import { promises as fs } from 'fs';
import * as path from 'path';
import { DocFile, FileDocs, StoredFunction, emptyDocFile } from '../../shared/docFile';

const DOC_DIR = '.docmanager';
const DOC_FILE = 'docs.json';

export function docFilePathFor(repoRoot: string): string {
  return path.join(repoRoot, DOC_DIR, DOC_FILE);
}

/** Source paths are stored relative to the repo root with forward slashes, so a
 *  doc file written on Windows still resolves when a teammate clones on Linux. */
export function relativeKeyFor(repoRoot: string, sourceFilePath: string): string {
  return path.relative(repoRoot, sourceFilePath).split(path.sep).join('/');
}

// ---------------------------------------------------------------------------
// Whole-file access
// ---------------------------------------------------------------------------

export async function readDocFile(repoRoot: string): Promise<DocFile> {
  const target = docFilePathFor(repoRoot);

  let raw: string;
  try {
    raw = await fs.readFile(target, 'utf8');
  } catch (err) {
    // No doc file yet is the normal case for a repo nobody has documented,
    // not an error. Anything else should surface.
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return emptyDocFile();
    throw err;
  }

  try {
    const parsed = JSON.parse(raw) as DocFile;
    if (!parsed.files) return emptyDocFile();
    return parsed;
  } catch {
    // A half-resolved merge conflict leaves <<<<<<< markers in the file.
    // Failing loudly is right: silently returning {} would let the next save
    // overwrite the file and destroy both sides of the conflict.
    throw new Error(
      `${DOC_DIR}/${DOC_FILE} is not valid JSON. If it contains merge conflict ` +
        `markers, resolve them before editing documentation.`
    );
  }
}

/** Writes atomically (temp file + rename) so a crash mid-write can't leave a
 *  truncated doc file behind — which, with a single file, would lose every doc
 *  in the repo rather than one file's worth. */
export async function writeDocFile(repoRoot: string, doc: DocFile): Promise<void> {
  const target = docFilePathFor(repoRoot);
  await fs.mkdir(path.dirname(target), { recursive: true });

  const serialised = JSON.stringify(sortDocFile(doc), null, 2) + '\n';
  const temp = `${target}.tmp`;
  await fs.writeFile(temp, serialised, 'utf8');
  await fs.rename(temp, target);
}

// ---------------------------------------------------------------------------
// Per-source-file access (what docService uses)
// ---------------------------------------------------------------------------

/** The documented functions for one source file. Empty object when that file
 *  has no docs yet. */
export async function readFileDocs(
  repoRoot: string,
  sourceFilePath: string
): Promise<FileDocs> {
  const doc = await readDocFile(repoRoot);
  return doc.files[relativeKeyFor(repoRoot, sourceFilePath)] ?? {};
}

/** Replaces one source file's section and writes the whole doc file back.
 *  Read-modify-write is safe here because every save goes through the single
 *  extension host process; concurrent saves from two machines are resolved by
 *  git, not by this function. */
export async function writeFileDocs(
  repoRoot: string,
  sourceFilePath: string,
  functions: FileDocs
): Promise<void> {
  const doc = await readDocFile(repoRoot);
  const key = relativeKeyFor(repoRoot, sourceFilePath);

  if (Object.keys(functions).length === 0) {
    delete doc.files[key];
  } else {
    doc.files[key] = functions;
  }

  await writeDocFile(repoRoot, doc);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Stable key order at both levels. Without this, two clients can serialise
 *  identical data in different orders and produce a spurious whole-file diff —
 *  which with a single shared file would conflict constantly. */
function sortDocFile(doc: DocFile): DocFile {
  const files: Record<string, FileDocs> = {};

  for (const [filePath, fileDocs] of Object.entries(doc.files).sort(([a], [b]) =>
    a.localeCompare(b)
  )) {
    const sorted: FileDocs = {};
    for (const [name, fn] of Object.entries(fileDocs).sort(([a], [b]) =>
      a.localeCompare(b)
    )) {
      sorted[name] = {
        ...fn,
        memories: [...(fn.memories ?? [])].sort((a, b) => a.id.localeCompare(b.id)),
      };
    }
    files[filePath] = sorted;
  }

  return { ...doc, files };
}

/** ULID-ish: 10 chars of timestamp + 16 of randomness, Crockford base32.
 *  Sorts chronologically as a string, and two people recording offline will
 *  not collide. Avoids adding a dependency for one function. */
export function newMemoryId(): string {
  const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
  let time = Date.now();
  let out = '';
  for (let i = 0; i < 10; i++) {
    out = ALPHABET[time % 32] + out;
    time = Math.floor(time / 32);
  }
  for (let i = 0; i < 16; i++) {
    out += ALPHABET[Math.floor(Math.random() * 32)];
  }
  return out;
}