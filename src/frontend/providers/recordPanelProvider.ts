// src/frontend/providers/RecordPanelProvider.ts
//
// Records via ffmpeg on the extension host (see backend/services/ffmpegRecorder.ts).
// No webview: getUserMedia is not reliably granted inside VS Code's webview
// sandbox, so capture happens entirely in Node via ffmpeg. Recording starts
// immediately on show(); a native notification with a "Stop & Save" action
// is the only UI surface, no custom panel.

import * as vscode from 'vscode';
import * as path from 'path';
import { promises as fs } from 'fs';
import type { SymbolMeta } from '../../shared/types';
import {
  detectFfmpeg,
  listAudioDevices,
  startRecording,
  type Recording,
} from '../../backend/services/ffmpegRecorder';
import { audioRelativePath, audioAbsolutePath } from '../../backend/services/audioStore';
import { saveDoc, currentAuthor, getDocsForSymbol } from '../services/docClient';
import { DocPanelProvider } from './DocPanelProvider';

export class RecordPanelProvider {
  private static current: RecordPanelProvider | undefined;

  private readonly meta: SymbolMeta;
  private readonly relativePath: string;
  private readonly absolutePath: string;
  private recording: Recording | undefined;
  private startedAt = 0;

  public static async show(_extensionUri: vscode.Uri, meta: SymbolMeta) {
    if (RecordPanelProvider.current) {
      vscode.window.showWarningMessage(
        'Doc Manager: a recording is already in progress.'
      );
      return;
    }

    const folder = vscode.workspace.getWorkspaceFolder(
      vscode.Uri.file(meta.filePath)
    );
    if (!folder) {
      vscode.window.showErrorMessage(
        'Doc Manager: this file is outside the workspace.'
      );
      return;
    }

    const version = await detectFfmpeg();
    if (!version) {
      vscode.window.showErrorMessage(
        'Doc Manager: ffmpeg was not found on PATH. Install ffmpeg to record voice memos.'
      );
      return;
    }

    const devices = await listAudioDevices();
    if (devices.length === 0) {
      vscode.window.showErrorMessage('Doc Manager: no microphone was detected.');
      return;
    }

    const provider = new RecordPanelProvider(meta, folder.uri.fsPath);
    RecordPanelProvider.current = provider;
    await provider.start(devices[0].id);
  }

  private constructor(meta: SymbolMeta, repoRoot: string) {
    this.meta = meta;

    const id = `${Date.now().toString(36)}${Math.random()
      .toString(36)
      .slice(2, 8)}`;

    // pcm_s16le in ffmpegRecorder needs a .wav container, not .webm.
    this.relativePath = audioRelativePath(id, 'wav');
    this.absolutePath = audioAbsolutePath(repoRoot, this.relativePath);
  }

  private async start(deviceId: string) {
    await fs.mkdir(path.dirname(this.absolutePath), { recursive: true });

    try {
      this.recording = startRecording(deviceId, this.absolutePath);
    } catch (err) {
      vscode.window.showErrorMessage(
        `Doc Manager: could not start recording — ${err instanceof Error ? err.message : 'unknown error'
        }`
      );
      RecordPanelProvider.current = undefined;
      return;
    }

    this.startedAt = Date.now();

    // Non-modal notification: recording keeps running in the background
    // regardless of whether/when the user interacts with this message.
    vscode.window
      .showInformationMessage(
        `Doc Manager: recording "${this.meta.symbolName}"...`,
        'Stop && Save',
        'Cancel'
      )
      .then((choice) => {
        if (choice === 'Stop && Save') {
          void this.stop();
        } else if (choice === 'Cancel') {
          this.cancelRecording();
        }
        // Dismissed without a choice: recording keeps going. The command
        // below is the way to stop it in that case.
      });
  }

  /** Registered once in extension.ts as docManager.stopRecording, in case
   *  the notification was dismissed without a choice. */
  public static async stopActive() {
    if (!RecordPanelProvider.current) {
      vscode.window.showInformationMessage('Doc Manager: no recording in progress.');
      return;
    }
    await RecordPanelProvider.current.stop();
  }

  private async stop() {
    if (!this.recording) return;

    try {
      await this.recording.stop();
    } catch (err) {
      vscode.window.showErrorMessage(
        `Doc Manager: recording failed — ${err instanceof Error ? err.message : 'unknown error'
        }`
      );
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
      await saveDoc({
        type: 'voice',
        meta: this.meta,
        audioUrl: this.relativePath,
        author: currentAuthor(),
        durationSec,
        ...(transcript ? { transcript } : {}),
      });

      const doc = DocPanelProvider.currentPanel;
      if (doc) doc.updateEntries(await getDocsForSymbol(this.meta));

      vscode.window.showInformationMessage(
        `Doc Manager: voice memo saved for ${this.meta.symbolName}.`
      );
    } catch (err) {
      vscode.window.showErrorMessage(
        `Doc Manager: could not save recording — ${err instanceof Error ? err.message : 'unknown error'
        }`
      );
    }

    RecordPanelProvider.current = undefined;
  }

  private cancelRecording() {
    this.recording?.cancel();
    void this.discardFile();
    RecordPanelProvider.current = undefined;
    vscode.window.showInformationMessage('Doc Manager: recording discarded.');
  }

  private async discardFile() {
    try {
      await fs.unlink(this.absolutePath);
    } catch {
      // Nothing to clean up — file may not have been finalized.
    }
  }
}