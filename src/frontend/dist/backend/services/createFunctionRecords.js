"use strict";
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
// them in separate files/folders avoids one write accidentally clobbering
// or racing the other.
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
exports.functionRecordsPathFor = functionRecordsPathFor;
exports.readFunctionRecordsFile = readFunctionRecordsFile;
exports.writeFunctionRecordsFile = writeFunctionRecordsFile;
exports.createFunctionRecords = createFunctionRecords;
const fs_1 = require("fs");
const path = __importStar(require("path"));
const fileWalker_1 = require("../db/fileWalker");
const parser_1 = require("../db/parser");
const hash_1 = require("../../shared/hash");
const functionRecordsFile_1 = require("../../shared/functionRecordsFile");
const RECORDS_DIR = '.funcmanager';
const RECORDS_FILE = 'functions.json';
function functionRecordsPathFor(repoRoot) {
    return path.join(repoRoot, RECORDS_DIR, RECORDS_FILE);
}
/** Source paths are stored relative to the repo root with forward slashes, so
 *  a records file written on Windows still resolves for a teammate on Linux. */
function relativeKeyFor(repoRoot, sourceFilePath) {
    return path.relative(repoRoot, sourceFilePath).split(path.sep).join('/');
}
// ---------------------------------------------------------------------------
// Whole-file access
// ---------------------------------------------------------------------------
async function readFunctionRecordsFile(repoRoot) {
    const target = functionRecordsPathFor(repoRoot);
    let raw;
    try {
        raw = await fs_1.promises.readFile(target, 'utf8');
    }
    catch (err) {
        if (err.code === 'ENOENT')
            return (0, functionRecordsFile_1.emptyFunctionRecordsFile)();
        throw err;
    }
    try {
        const parsed = JSON.parse(raw);
        if (!parsed.files)
            return (0, functionRecordsFile_1.emptyFunctionRecordsFile)();
        return parsed;
    }
    catch {
        throw new Error(`${RECORDS_DIR}/${RECORDS_FILE} is not valid JSON. If it contains merge conflict ` +
            `markers, resolve them before re-scanning.`);
    }
}
/** Writes atomically (temp file + rename) so a crash mid-write can't leave a
 *  truncated records file behind. */
async function writeFunctionRecordsFile(repoRoot, doc) {
    const target = functionRecordsPathFor(repoRoot);
    await fs_1.promises.mkdir(path.dirname(target), { recursive: true });
    const serialised = JSON.stringify(sortRecordsFile(doc), null, 2) + '\n';
    const temp = `${target}.tmp`;
    await fs_1.promises.writeFile(temp, serialised, 'utf8');
    await fs_1.promises.rename(temp, target);
}
/** Stable key/array order so two scans of unchanged code produce an identical
 *  file — avoids spurious diffs if this file is ever committed to git. */
function sortRecordsFile(doc) {
    const files = {};
    for (const [filePath, records] of Object.entries(doc.files).sort(([a], [b]) => a.localeCompare(b))) {
        files[filePath] = [...records].sort((a, b) => a.lineStart - b.lineStart || a.name.localeCompare(b.name));
    }
    return { ...doc, files };
}
// ---------------------------------------------------------------------------
// The actual scan — fetch, parse, hash, write
// ---------------------------------------------------------------------------
/**
 * Walks the whole repo, parses every supported file, hashes each function's
 * body, and writes the complete result to functions.json — overwriting
 * whatever was there before (this is a full re-scan, not an incremental one).
 */
async function createFunctionRecords(repoRoot) {
    const codeFiles = (0, fileWalker_1.walk)(repoRoot);
    const files = {};
    for (const file of codeFiles) {
        if (!(0, parser_1.isLanguageSupported)(file.language))
            continue; // no grammar installed/configured yet — skip
        const parsedFunctions = (0, parser_1.parseFile)(file);
        if (parsedFunctions.length === 0)
            continue;
        const key = relativeKeyFor(repoRoot, file.path);
        files[key] = parsedFunctions.map((fn) => ({
            name: fn.name,
            filePath: key,
            lineStart: fn.lineStart,
            lineEnd: fn.lineEnd,
            hash: (0, hash_1.hashSource)(fn.body),
            language: file.language,
        }));
    }
    const result = {
        files,
        scannedAt: new Date().toISOString(),
    };
    await writeFunctionRecordsFile(repoRoot, result);
    return result;
}
