"use strict";
// src/frontend/services/repoConfig.ts
//
// Stores small, repo-level metadata (currently just the resolved GitHub URL)
// alongside functions.json, so later features — like a webhook listener —
// can map an incoming GitHub event back to the right local folder.
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
exports.repoConfigPathFor = repoConfigPathFor;
exports.writeRepoConfig = writeRepoConfig;
exports.readRepoConfig = readRepoConfig;
const fs_1 = require("fs");
const path = __importStar(require("path"));
const CONFIG_DIR = '.funcmanager';
const CONFIG_FILE = 'config.json';
function repoConfigPathFor(repoRoot) {
    return path.join(repoRoot, CONFIG_DIR, CONFIG_FILE);
}
async function writeRepoConfig(repoRoot, config) {
    const target = repoConfigPathFor(repoRoot);
    await fs_1.promises.mkdir(path.dirname(target), { recursive: true });
    await fs_1.promises.writeFile(target, JSON.stringify(config, null, 2) + '\n', 'utf8');
}
async function readRepoConfig(repoRoot) {
    try {
        const raw = await fs_1.promises.readFile(repoConfigPathFor(repoRoot), 'utf8');
        return JSON.parse(raw);
    }
    catch {
        return undefined;
    }
}
