"use strict";
// src/backend/services/audioStore.ts
//
// Writes recorded audio into the repo alongside docs.json.
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
exports.audioRelativePath = audioRelativePath;
exports.audioAbsolutePath = audioAbsolutePath;
exports.saveAudio = saveAudio;
exports.deleteAudio = deleteAudio;
// No vscode import: takes a repo root and raw bytes, same as docFileStore.
const fs_1 = require("fs");
const path = __importStar(require("path"));
const AUDIO_DIR = path.join('.docmanager', 'audio');
/** Stored paths are repo-relative with forward slashes so a recording made on
 *  Windows still resolves after a teammate clones on Linux. Resolve to an
 *  absolute path only at playback time. */
function audioRelativePath(id, extension = 'webm') {
    return `${AUDIO_DIR.split(path.sep).join('/')}/${id}.${extension}`;
}
function audioAbsolutePath(repoRoot, relative) {
    return path.join(repoRoot, ...relative.split('/'));
}
/**
 * Writes a recording and returns the repo-relative path to store in docs.json.
 *
 * `base64` is the raw audio as it arrived from the webview — MediaRecorder
 * produces a Blob, and base64 over postMessage is the only way across the
 * webview boundary without a local server.
 */
async function saveAudio(repoRoot, id, base64, extension = 'webm') {
    const relative = audioRelativePath(id, extension);
    const target = audioAbsolutePath(repoRoot, relative);
    await fs_1.promises.mkdir(path.dirname(target), { recursive: true });
    await fs_1.promises.writeFile(target, Buffer.from(base64, 'base64'));
    return relative;
}
/** Called when a memory is deleted, so orphaned audio doesn't accumulate.
 *  A missing file is not an error — the entry may predate the file, or the
 *  file may already have been cleaned up. */
async function deleteAudio(repoRoot, relative) {
    try {
        await fs_1.promises.unlink(audioAbsolutePath(repoRoot, relative));
    }
    catch (err) {
        if (err.code !== 'ENOENT')
            throw err;
    }
}
