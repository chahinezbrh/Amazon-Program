"use strict";
// src/backend/services/docFileStore.ts
//
// Replaces createRepoDb.ts / repoDb.ts / schema.prisma.
//
// One JSON file for the whole repo: <repo>/.docmanager/docs.json
//
// Deliberately free of any vscode import so it can be unit-tested with a temp
// directory and no extension host.
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
exports.docFilePathFor = docFilePathFor;
exports.relativeKeyFor = relativeKeyFor;
exports.readDocFile = readDocFile;
exports.writeDocFile = writeDocFile;
exports.readFileDocs = readFileDocs;
exports.writeFileDocs = writeFileDocs;
exports.newMemoryId = newMemoryId;
const fs_1 = require("fs");
const path = __importStar(require("path"));
const docFile_1 = require("../../shared/docFile");
const DOC_DIR = '.docmanager';
const DOC_FILE = 'docs.json';
function docFilePathFor(repoRoot) {
    return path.join(repoRoot, DOC_DIR, DOC_FILE);
}
/** Source paths are stored relative to the repo root with forward slashes, so a
 *  doc file written on Windows still resolves when a teammate clones on Linux. */
function relativeKeyFor(repoRoot, sourceFilePath) {
    return path.relative(repoRoot, sourceFilePath).split(path.sep).join('/');
}
// ---------------------------------------------------------------------------
// Whole-file access
// ---------------------------------------------------------------------------
async function readDocFile(repoRoot) {
    const target = docFilePathFor(repoRoot);
    let raw;
    try {
        raw = await fs_1.promises.readFile(target, 'utf8');
    }
    catch (err) {
        // No doc file yet is the normal case for a repo nobody has documented,
        // not an error. Anything else should surface.
        if (err.code === 'ENOENT')
            return (0, docFile_1.emptyDocFile)();
        throw err;
    }
    try {
        const parsed = JSON.parse(raw);
        if (!parsed.files)
            return (0, docFile_1.emptyDocFile)();
        return parsed;
    }
    catch {
        // A half-resolved merge conflict leaves <<<<<<< markers in the file.
        // Failing loudly is right: silently returning {} would let the next save
        // overwrite the file and destroy both sides of the conflict.
        throw new Error(`${DOC_DIR}/${DOC_FILE} is not valid JSON. If it contains merge conflict ` +
            `markers, resolve them before editing documentation.`);
    }
}
/** Writes atomically (temp file + rename) so a crash mid-write can't leave a
 *  truncated doc file behind — which, with a single file, would lose every doc
 *  in the repo rather than one file's worth. */
async function writeDocFile(repoRoot, doc) {
    const target = docFilePathFor(repoRoot);
    await fs_1.promises.mkdir(path.dirname(target), { recursive: true });
    const serialised = JSON.stringify(sortDocFile(doc), null, 2) + '\n';
    const temp = `${target}.tmp`;
    await fs_1.promises.writeFile(temp, serialised, 'utf8');
    await fs_1.promises.rename(temp, target);
}
// ---------------------------------------------------------------------------
// Per-source-file access (what docService uses)
// ---------------------------------------------------------------------------
/** The documented functions for one source file. Empty object when that file
 *  has no docs yet. */
async function readFileDocs(repoRoot, sourceFilePath) {
    const doc = await readDocFile(repoRoot);
    return doc.files[relativeKeyFor(repoRoot, sourceFilePath)] ?? {};
}
/** Replaces one source file's section and writes the whole doc file back.
 *  Read-modify-write is safe here because every save goes through the single
 *  extension host process; concurrent saves from two machines are resolved by
 *  git, not by this function. */
async function writeFileDocs(repoRoot, sourceFilePath, functions) {
    const doc = await readDocFile(repoRoot);
    const key = relativeKeyFor(repoRoot, sourceFilePath);
    if (Object.keys(functions).length === 0) {
        delete doc.files[key];
    }
    else {
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
function sortDocFile(doc) {
    const files = {};
    for (const [filePath, fileDocs] of Object.entries(doc.files).sort(([a], [b]) => a.localeCompare(b))) {
        const sorted = {};
        for (const [name, fn] of Object.entries(fileDocs).sort(([a], [b]) => a.localeCompare(b))) {
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
function newMemoryId() {
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
