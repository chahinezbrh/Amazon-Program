"use strict";
// src/frontend/providers/RecordPanelProvider.ts
//
// Records via ffmpeg on the extension host (see backend/services/ffmpegRecorder.ts).
// No webview: getUserMedia is not reliably granted inside VS Code's webview
// sandbox, so capture happens entirely in Node via ffmpeg. Recording starts
// immediately on show(); a native notification with a "Stop & Save" action
// is the only UI surface, no custom panel.
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
exports.RecordPanelProvider = void 0;
const vscode = __importStar(require("vscode"));
const path = __importStar(require("path"));
const fs_1 = require("fs");
const ffmpegRecorder_1 = require("../../backend/services/ffmpegRecorder");
const audioStore_1 = require("../../backend/services/audioStore");
const docClient_1 = require("../services/docClient");
const DocPanelProvider_1 = require("./DocPanelProvider");
class RecordPanelProvider {
    static async show(_extensionUri, meta) {
        if (RecordPanelProvider.current) {
            vscode.window.showWarningMessage('Doc Manager: a recording is already in progress.');
            return;
        }
        const folder = vscode.workspace.getWorkspaceFolder(vscode.Uri.file(meta.filePath));
        if (!folder) {
            vscode.window.showErrorMessage('Doc Manager: this file is outside the workspace.');
            return;
        }
        const version = await (0, ffmpegRecorder_1.detectFfmpeg)();
        if (!version) {
            vscode.window.showErrorMessage('Doc Manager: ffmpeg was not found on PATH. Install ffmpeg to record voice memos.');
            return;
        }
        const devices = await (0, ffmpegRecorder_1.listAudioDevices)();
        if (devices.length === 0) {
            vscode.window.showErrorMessage('Doc Manager: no microphone was detected.');
            return;
        }
        const provider = new RecordPanelProvider(meta, folder.uri.fsPath);
        RecordPanelProvider.current = provider;
        await provider.start(devices[0].id);
    }
    constructor(meta, repoRoot) {
        this.startedAt = 0;
        this.meta = meta;
        const id = `${Date.now().toString(36)}${Math.random()
            .toString(36)
            .slice(2, 8)}`;
        // pcm_s16le in ffmpegRecorder needs a .wav container, not .webm.
        this.relativePath = (0, audioStore_1.audioRelativePath)(id, 'wav');
        this.absolutePath = (0, audioStore_1.audioAbsolutePath)(repoRoot, this.relativePath);
    }
    async start(deviceId) {
        await fs_1.promises.mkdir(path.dirname(this.absolutePath), { recursive: true });
        try {
            this.recording = (0, ffmpegRecorder_1.startRecording)(deviceId, this.absolutePath);
        }
        catch (err) {
            vscode.window.showErrorMessage(`Doc Manager: could not start recording — ${err instanceof Error ? err.message : 'unknown error'}`);
            RecordPanelProvider.current = undefined;
            return;
        }
        this.startedAt = Date.now();
        // Non-modal notification: recording keeps running in the background
        // regardless of whether/when the user interacts with this message.
        vscode.window
            .showInformationMessage(`Doc Manager: recording "${this.meta.symbolName}"...`, 'Stop && Save', 'Cancel')
            .then((choice) => {
            if (choice === 'Stop && Save') {
                void this.stop();
            }
            else if (choice === 'Cancel') {
                this.cancelRecording();
            }
            // Dismissed without a choice: recording keeps going. The command
            // below is the way to stop it in that case.
        });
    }
    /** Registered once in extension.ts as docManager.stopRecording, in case
     *  the notification was dismissed without a choice. */
    static async stopActive() {
        if (!RecordPanelProvider.current) {
            vscode.window.showInformationMessage('Doc Manager: no recording in progress.');
            return;
        }
        await RecordPanelProvider.current.stop();
    }
    async stop() {
        if (!this.recording)
            return;
        try {
            await this.recording.stop();
        }
        catch (err) {
            vscode.window.showErrorMessage(`Doc Manager: recording failed — ${err instanceof Error ? err.message : 'unknown error'}`);
            await this.discardFile();
            RecordPanelProvider.current = undefined;
            return;
        }
        const durationSec = Math.round((Date.now() - this.startedAt) / 1000);
        const transcript = await vscode.window.showInputBox({
            prompt: 'Add a short transcript or note (optional)',
            placeHolder: 'What does this recording explain?',
        });
        try {
            await (0, docClient_1.saveDoc)({
                type: 'voice',
                meta: this.meta,
                audioUrl: this.relativePath,
                author: (0, docClient_1.currentAuthor)(),
                durationSec,
                ...(transcript ? { transcript } : {}),
            });
            const doc = DocPanelProvider_1.DocPanelProvider.currentPanel;
            if (doc)
                doc.updateEntries(await (0, docClient_1.getDocsForSymbol)(this.meta));
            vscode.window.showInformationMessage(`Doc Manager: voice memo saved for ${this.meta.symbolName}.`);
        }
        catch (err) {
            vscode.window.showErrorMessage(`Doc Manager: could not save recording — ${err instanceof Error ? err.message : 'unknown error'}`);
        }
        RecordPanelProvider.current = undefined;
    }
    cancelRecording() {
        this.recording?.cancel();
        void this.discardFile();
        RecordPanelProvider.current = undefined;
        vscode.window.showInformationMessage('Doc Manager: recording discarded.');
    }
    async discardFile() {
        try {
            await fs_1.promises.unlink(this.absolutePath);
        }
        catch {
            // Nothing to clean up — file may not have been finalized.
        }
    }
}
exports.RecordPanelProvider = RecordPanelProvider;
