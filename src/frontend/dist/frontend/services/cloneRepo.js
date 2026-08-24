"use strict";
// src/frontend/services/cloneRepo.ts
//
// Git-related helpers: cloning a remote repo directly into the open
// workspace folder, and reading the remote URL of an already-local repo.
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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.repoFolderNameFrom = repoFolderNameFrom;
exports.cloneOrUpdateRepo = cloneOrUpdateRepo;
exports.getRemoteUrl = getRemoteUrl;
const simple_git_1 = __importDefault(require("simple-git"));
const path = __importStar(require("path"));
const fs_1 = require("fs");
function repoFolderNameFrom(repoUrl) {
    const cleaned = repoUrl.trim().replace(/\.git$/, '').replace(/\/$/, '');
    const match = cleaned.match(/github\.com[/:]([^/]+)\/([^/]+)$/);
    if (!match) {
        throw new Error(`Could not parse a GitHub owner/repo from "${repoUrl}"`);
    }
    const [, owner, repo] = match;
    return `${owner}__${repo}`;
}
/**
 * Clones (or pulls, if already cloned) the given GitHub repo into a
 * subfolder of `workspaceRoot` — the currently open VS Code workspace —
 * instead of a hidden global-storage location. Returns the local path to
 * the cloned repo, which is what gets indexed and where .funcmanager /
 * .docmanager end up.
 */
async function cloneOrUpdateRepo(workspaceRoot, repoUrl, onProgress) {
    const folderName = repoFolderNameFrom(repoUrl);
    const targetPath = path.join(workspaceRoot, folderName);
    const alreadyCloned = await fs_1.promises
        .access(path.join(targetPath, '.git'))
        .then(() => true)
        .catch(() => false);
    const git = (0, simple_git_1.default)();
    if (alreadyCloned) {
        onProgress?.('Repository already cloned — pulling latest changes…');
        await (0, simple_git_1.default)(targetPath).pull();
    }
    else {
        onProgress?.('Cloning repository…');
        await git.clone(repoUrl, targetPath, ['--depth', '1']);
    }
    return targetPath;
}
async function getRemoteUrl(repoPath) {
    try {
        const git = (0, simple_git_1.default)(repoPath);
        const remotes = await git.getRemotes(true);
        const origin = remotes.find((r) => r.name === 'origin');
        return origin?.refs?.fetch;
    }
    catch {
        return undefined;
    }
}
