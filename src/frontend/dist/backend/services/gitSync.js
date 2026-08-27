"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.currentHead = currentHead;
exports.pullLatest = pullLatest;
exports.changedFilesBetween = changedFilesBetween;
exports.fileContentAtRef = fileContentAtRef;
const simple_git_1 = __importDefault(require("simple-git"));
const gitFor = (repoRoot) => (0, simple_git_1.default)(repoRoot);
async function currentHead(repoRoot) {
    return (await gitFor(repoRoot).revparse(['HEAD'])).trim();
}
async function pullLatest(repoRoot) {
    await gitFor(repoRoot).pull();
}
async function changedFilesBetween(repoRoot, fromSha, toSha) {
    const diff = await gitFor(repoRoot).diff(['--name-only', `${fromSha}..${toSha}`]);
    return diff.split('\n').map((l) => l.trim()).filter(Boolean);
}
/** Returns null if the file didn't exist at that ref (added or deleted). */
async function fileContentAtRef(repoRoot, ref, relativeFilePath) {
    try {
        return await gitFor(repoRoot).show([`${ref}:${relativeFilePath}`]);
    }
    catch {
        return null;
    }
}
