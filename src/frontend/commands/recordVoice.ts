// src/frontend/commands/recordVoice.ts
//
// Records a voice memo from the extension host via ffmpeg, with a status bar
// timer and a click-to-stop control.
//
// Recording happens here rather than in a webview because VS Code's webview
// sandbox does not reliably grant getUserMedia to extensions — the request is
// refused before it reaches the OS. The extension host is plain Node, so an
// external process can reach the microphone directly.

import * as vscode from 'vscode';
import { promises as fs } from 'fs';
import * as path from 'path';
import type { SymbolMeta } from '../../shared/types';
import {
  detectFfmpeg,
  listAudioDevices,
  startRecording,
  type Recording,
} from '../../backend/services/ffmpegRecorder';
import { audioAbsolutePath, audioRelativePath } from '../../backend/services/audioStore';
import { saveDoc, currentAuthor, getDocsForSymbol } from '../services/docClient';
import { DocPanelProvider } from '../providers/DocPanelProvider';

interface Session {
  recording: Recording;
  meta: SymbolMeta;
  repoRoot: string;
  relativePath: string;
  absolutePath: string;
  startedAt: number;
  status: vscode.StatusBarItem;
  ticker: NodeJS.Timeout;
}

// Module-level: only one recording can be in flight, and the stop command
// needs to reach it from a different invocation.
let session: Session | null = null;

export async function recordVoice(meta: SymbolMeta): Promise<void> {
  if (session) {
    vscode.window.showWarningMessage(
      'Doc Manager: a recording is already in progress.'
    );
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
  const binary = config.get<string>('ffmpegPath') ?? 'ffmpeg';

  if (!(await detectFfmpeg(binary))) {
    vscode.window.showErrorMessage(
      'Doc Manager: ffmpeg is required to record audio. Install it and reload, ' +
        'or set docManager.ffmpegPath if it is not on your PATH.'
    );
    return;
  }

  const device = await pickDevice(binary, config);
  if (!device) return;

  const id = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
  const relativePath = audioRelativePath(id, 'wav');
  const absolutePath = audioAbsolutePath(folder.uri.fsPath, relativePath);
  await fs.mkdir(path.dirname(absolutePath), { recursive: true });

  const status = vscode.window.createStatusBarItem(
    vscode.StatusBarAlignment.Left,
    100
  );
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
    recording: startRecording(device, absolutePath, { binary }),
    meta,
    repoRoot: folder.uri.fsPath,
    relativePath,
    absolutePath,
    startedAt,
    status,
    ticker,
  };
}

export async function stopRecording(): Promise<void> {
  const active = session;
  if (!active) return;
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

    await saveDoc({
      type: 'voice',
      meta: active.meta,
      audioUrl: active.relativePath,
      author: currentAuthor(),
      durationSec,
      ...(transcript ? { transcript } : {}),
    });

    const panel = DocPanelProvider.currentPanel;
    if (panel) panel.updateEntries(await getDocsForSymbol(active.meta));

    vscode.window.showInformationMessage(
      `Doc Manager: voice memo saved for ${active.meta.symbolName}.`
    );
  } catch (err) {
    // A failed ffmpeg run usually leaves a zero-byte or unplayable file behind.
    await fs.unlink(active.absolutePath).catch(() => undefined);
    vscode.window.showErrorMessage(
      `Doc Manager: recording failed — ${
        err instanceof Error ? err.message : 'unknown error'
      }`
    );
  } finally {
    active.status.dispose();
  }
}

export async function cancelRecording(): Promise<void> {
  const active = session;
  if (!active) return;
  session = null;

  clearInterval(active.ticker);
  active.recording.cancel();
  active.status.dispose();
  await fs.unlink(active.absolutePath).catch(() => undefined);
}

// ---------------------------------------------------------------------------

async function pickDevice(
  binary: string,
  config: vscode.WorkspaceConfiguration
): Promise<string | undefined> {
  // A remembered device skips the picker on every recording.
  const saved = config.get<string>('audioDevice');
  if (saved) return saved;

  const devices = await listAudioDevices(binary);

  if (devices.length === 0) {
    vscode.window.showErrorMessage(
      'Doc Manager: ffmpeg found no audio input devices.'
    );
    return undefined;
  }

  if (devices.length === 1) return devices[0]?.id;

  const picked = await vscode.window.showQuickPick(
    devices.map((d) => ({ label: d.label, id: d.id })),
    { title: 'Choose a microphone', placeHolder: 'This will be remembered' }
  );
  if (!picked) return undefined;

  await config.update(
    'audioDevice',
    picked.id,
    vscode.ConfigurationTarget.Global
  );
  return picked.id;
}

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60)
    .toString()
    .padStart(2, '0');
  return `${m}:${s}`;
}