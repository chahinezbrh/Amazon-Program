"use strict";
// src/frontend/commands/recordVoice.ts
//
// Records a voice memo from the extension host via ffmpeg, with a status bar
// timer and a click-to-stop control.
//
// Recording happens here rather than in a webview because VS Code's webview
// sandbox does not reliably grant getUserMedia to extensions — the request is
// refused before it reaches the OS. The extension host is plain Node, so an
// external process can reach the microphone directly.
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
exports.recordVoice = recordVoice;
exports.stopRecording = stopRecording;
exports.cancelRecording = cancelRecording;
const vscode = __importStar(require("vscode"));
const fs_1 = require("fs");
const path = __importStar(require("path"));
const ffmpegRecorder_1 = require("../../backend/services/ffmpegRecorder");
const audioStore_1 = require("../../backend/services/audioStore");
const docClient_1 = require("../services/docClient");
const DocPanelProvider_1 = require("../providers/DocPanelProvider");
// Module-level: only one recording can be in flight, and the stop command
// needs to reach it from a different invocation.
let session = null;
async function recordVoice(meta) {
    if (session) {
        vscode.window.showWarningMessage('Doc Manager: a recording is already in progress.');
        return;
    }
    if (!meta?.symbolName) {
        vscode.window.showWarningMessage('Doc Manager: no symbol selected.');
        return;
    }
    const folder = vscode.workspace.getWorkspaceFolder(vscode.Uri.file(meta.filePath));
    if (!folder) {
        vscode.window.showErrorMessage('Doc Manager: this file is outside the workspace.');
        return;
    }
    const config = vscode.workspace.getConfiguration('docManager');
    const binary = config.get('ffmpegPath') ?? 'ffmpeg';
    if (!(await (0, ffmpegRecorder_1.detectFfmpeg)(binary))) {
        vscode.window.showErrorMessage('Doc Manager: ffmpeg is required to record audio. Install it and reload, ' +
            'or set docManager.ffmpegPath if it is not on your PATH.');
        return;
    }
    const device = await pickDevice(binary, config);
    if (!device)
        return;
    const id = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
    const relativePath = (0, audioStore_1.audioRelativePath)(id, 'wav');
    const absolutePath = (0, audioStore_1.audioAbsolutePath)(folder.uri.fsPath, relativePath);
    await fs_1.promises.mkdir(path.dirname(absolutePath), { recursive: true });
    const status = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
    status.command = 'docManager.stopRecording';
    status.tooltip = 'Click to stop recording';
    status.text = `$(record) 0:00  Recording ${meta.symbolName}`;
    status.show();
    const startedAt = Date.now();
    const ticker = setInterval(() => {
        const elapsed = (Date.now() - startedAt) / 1000;
        status.text = `$(record) ${formatDuration(elapsed)}  Recording ${meta.symbolName}`;
    }, 500);
    session = {
        recording: (0, ffmpegRecorder_1.startRecording)(device, absolutePath, { binary }),
        meta,
        repoRoot: folder.uri.fsPath,
        relativePath,
        absolutePath,
        startedAt,
        status,
        ticker,
    };
}
async function stopRecording() {
    const active = session;
    if (!active)
        return;
    session = null;
    clearInterval(active.ticker);
    active.status.text = '$(sync~spin) Saving recording…';
    try {
        await active.recording.stop();
        const durationSec = Math.round((Date.now() - active.startedAt) / 1000);
        const transcript = await vscode.window.showInputBox({
            prompt: 'Add a short transcript or note (optional)',
            placeHolder: 'What does this recording explain?',
        });
        await (0, docClient_1.saveDoc)({
            type: 'voice',
            meta: active.meta,
            audioUrl: active.relativePath,
            author: (0, docClient_1.currentAuthor)(),
            durationSec,
            ...(transcript ? { transcript } : {}),
        });
        const panel = DocPanelProvider_1.DocPanelProvider.currentPanel;
        if (panel)
            panel.updateEntries(await (0, docClient_1.getDocsForSymbol)(active.meta));
        vscode.window.showInformationMessage(`Doc Manager: voice memo saved for ${active.meta.symbolName}.`);
    }
    catch (err) {
        // A failed ffmpeg run usually leaves a zero-byte or unplayable file behind.
        await fs_1.promises.unlink(active.absolutePath).catch(() => undefined);
        vscode.window.showErrorMessage(`Doc Manager: recording failed — ${err instanceof Error ? err.message : 'unknown error'}`);
    }
    finally {
        active.status.dispose();
    }
}
async function cancelRecording() {
    const active = session;
    if (!active)
        return;
    session = null;
    clearInterval(active.ticker);
    active.recording.cancel();
    active.status.dispose();
    await fs_1.promises.unlink(active.absolutePath).catch(() => undefined);
}
// ---------------------------------------------------------------------------
async function pickDevice(binary, config) {
    // A remembered device skips the picker on every recording.
    const saved = config.get('audioDevice');
    if (saved)
        return saved;
    const devices = await (0, ffmpegRecorder_1.listAudioDevices)(binary);
    if (devices.length === 0) {
        vscode.window.showErrorMessage('Doc Manager: ffmpeg found no audio input devices.');
        return undefined;
    }
    if (devices.length === 1)
        return devices[0]?.id;
    const picked = await vscode.window.showQuickPick(devices.map((d) => ({ label: d.label, id: d.id })), { title: 'Choose a microphone', placeHolder: 'This will be remembered' });
    if (!picked)
        return undefined;
    await config.update('audioDevice', picked.id, vscode.ConfigurationTarget.Global);
    return picked.id;
}
function formatDuration(seconds) {
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60)
        .toString()
        .padStart(2, '0');
    return `${m}:${s}`;
}
