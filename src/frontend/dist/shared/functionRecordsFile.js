"use strict";
// src/shared/functionRecordsFile.ts
//
// Schema for the per-repo function-records JSON file, mirroring the pattern
// used by docFile.ts / docFileStore.ts for documentation. Kept separate from
// docs.json so the two concerns (what functions exist vs. what's documented
// about them) can be read, written, and regenerated independently.
Object.defineProperty(exports, "__esModule", { value: true });
exports.emptyFunctionRecordsFile = emptyFunctionRecordsFile;
function emptyFunctionRecordsFile() {
    return { files: {}, scannedAt: new Date(0).toISOString() };
}
