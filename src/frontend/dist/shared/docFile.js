"use strict";
// src/shared/docFile.ts
//
// The on-disk format for .docmanager/docs.json — one file for the whole repo.
//
// Field names deliberately mirror the Prisma models (writtenDoc, writtenAtHash,
// aiDocumentation, hashAtRecording, memories[]) so the mapping layer in
// docService is unchanged from the database version. Prose fields are arrays of
// lines rather than embedded "\n" strings: git diffs them line by line, so two
// people appending different paragraphs merge cleanly instead of conflicting.
Object.defineProperty(exports, "__esModule", { value: true });
exports.emptyDocFile = emptyDocFile;
function emptyDocFile() {
    return { version: 1, files: {} };
}
