// src/backend/services/ffmpegRecorder.ts
//
// Records audio by spawning ffmpeg from the extension host.
//
// This exists because VS Code's webview sandbox does not reliably grant
// getUserMedia to extension webviews — the request is refused before it
// reaches the OS. The extension host is plain Node with no sandbox, so an
// external process can talk to the microphone directly.
//
// The trade-off: the audio never passes through our code, so there is no live
// waveform. We know only that recording started and stopped.
//
// No vscode import — spawn and paths only.

import { spawn, execFile, ChildProcess } from 'child_process';
import { promisify } from 'util';
import * as os from 'os';
import * as vscode from 'vscode';

const execFileAsync = promisify(execFile);

export interface AudioDevice {
  /** What ffmpeg needs after -i, already platform-formatted. */
  id: string;
  /** What to show the user. */
  label: string;
}

/** Capture backend per platform. ffmpeg needs a different one on each. */
function captureFormat(): string {
  switch (os.platform()) {
    case 'win32':
      return 'dshow';
    case 'darwin':
      return 'avfoundation';
    default:
      return 'pulse';
  }
}

/** Resolves to the ffmpeg version string, or null when ffmpeg isn't installed.
 *  Callers use this to fall back to importing a file instead. */
export async function detectFfmpeg(binary = 'ffmpeg'): Promise<string | null> {
  try {
    const { stdout } = await execFileAsync(binary, ['-version']);
    return stdout.split('\n')[0] ?? 'ffmpeg';
  } catch {
    return null;
  }
}

/**
 * Lists microphones ffmpeg can see.
 *
 * ffmpeg writes its device list to STDERR and exits non-zero — that is normal
 * for these probe commands, not a failure, so the error is swallowed and only
 * its output is parsed.
 */
export async function listAudioDevices(binary = 'ffmpeg'): Promise<AudioDevice[]> {
  const platform = os.platform();

  if (platform === 'linux') {
    // PulseAudio's default source is almost always what the user wants, and
    // enumerating properly means talking to pactl rather than ffmpeg.
    return [{ id: 'default', label: 'Default input' }];
  }

  const args =
    platform === 'win32'
      ? ['-list_devices', 'true', '-f', 'dshow', '-i', 'dummy']
      : ['-f', 'avfoundation', '-list_devices', 'true', '-i', ''];

  let output = '';
  try {
    const { stderr } = await execFileAsync(binary, args);
    output = stderr;
  } catch (err) {
    output = (err as { stderr?: string }).stderr ?? '';
  }

  return platform === 'win32'
    ? parseDshowDevices(output)
    : parseAvfoundationDevices(output);
}

/** dshow prints:  [dshow @ ...] "Microphone (Realtek Audio)" (audio) */
/** dshow prints one primary line per device — `"name" (audio)` or `(video)` —
 *  optionally followed by an indented `Alternative name "..."` line for the
 *  same device. Only primary lines carry the (audio)/(video) marker, so that
 *  marker must be read directly off each name line, never inferred from a
 *  neighboring line — otherwise a video device's alternative-name line can
 *  be mistaken for an audio device's, as it was in practice. */
function parseDshowDevices(output: string): AudioDevice[] {
  const devices: AudioDevice[] = [];
  const lines = output.split('\n');

  for (const line of lines) {
    // Only primary device lines look like: "Name" (audio) / "Name" (video)
    // Alternative-name lines never carry (audio)/(video), so this pattern
    // alone is enough to skip them.
    const match = /"([^"]+)"\s+\((audio|video)\)/.exec(line);
    if (!match) continue;

    const [, name, kind] = match;
    if (!name || kind !== 'audio') continue;

    devices.push({ id: `audio=${name}`, label: name });
  }

  return devices;
}

/** avfoundation prints an indexed list under "AVFoundation audio devices:" */
function parseAvfoundationDevices(output: string): AudioDevice[] {
  const devices: AudioDevice[] = [];
  let inAudioSection = false;

  for (const line of output.split('\n')) {
    if (line.includes('AVFoundation audio devices')) {
      inAudioSection = true;
      continue;
    }
    if (line.includes('AVFoundation video devices')) {
      inAudioSection = false;
      continue;
    }
    if (!inAudioSection) continue;

    const match = /\[(\d+)\]\s+(.+)$/.exec(line.trim());
    if (match?.[1] && match[2]) {
      devices.push({ id: `:${match[1]}`, label: match[2].trim() });
    }
  }

  return devices;
}

export interface Recording {
  /** Stops cleanly and resolves once ffmpeg has finalised the file.
   *  Rejects with ffmpeg's output if it failed. */
  stop(): Promise<void>;
  /** Kills the process and leaves the file for the caller to delete. */
  cancel(): void;
}

/**
 * Starts recording to `outputPath`. The container is inferred from the
 * extension, so a .webm path gets Opus audio.
 *
 * `maxSeconds` is a safety net: without it a forgotten recording would run
 * until the editor closes and could fill the disk.
 */
export function startRecording(
  deviceId: string,
  outputPath: string,
  options: { binary?: string; maxSeconds?: number } = {}
): Recording {
  const { binary = 'ffmpeg', maxSeconds = 600 } = options;

  const proc: ChildProcess = spawn(binary, [
    '-hide_banner',
    '-loglevel', 'error',
    '-f', captureFormat(),
    '-i', deviceId,
    '-t', String(maxSeconds),
    '-c:a', 'pcm_s16le',
    '-y', outputPath,
  ]);

  vscode.window.showInformationMessage(`[DEBUG] ffmpeg spawned. output=${outputPath} device=${deviceId}`);

  proc.on('exit', (code, signal) => {
  vscode.window.showWarningMessage(`[DEBUG] ffmpeg EXITED EARLY. code=${code} signal=${signal}`);
});

  let stderr = '';
  proc.stderr?.on('data', (chunk) => {
    stderr += String(chunk);
  });

  return {
    stop() {
      return new Promise<void>((resolve, reject) => {
        if (proc.exitCode !== null) return resolve();

        let askedToStop = false;

        proc.once('close', (code, signal) => {
          vscode.window.showInformationMessage(`[DEBUG] ffmpeg closed. code=${code} signal=${signal} stderr=${stderr || '(empty)'}`);
          if (code === 0 || code === 255 || (askedToStop && code === null)) {
            resolve();
          } else {
            reject(new Error(stderr.trim() || `ffmpeg exited with ${code ?? signal}`));
          }
        });

        askedToStop = true;

        // 'q' must arrive as its own line — a bare byte can sit unread in
        // the pipe buffer. Windows in particular needs this to register.
        if (proc.stdin && !proc.stdin.destroyed) {
          proc.stdin.write('q\n', (err) => {
            if (err) {
              proc.kill();
            }
          });
        } else {
          proc.kill();
        }

        // Give ffmpeg real time to finalize the container before escalating.
        // Signals are unreliable on Windows (Node emulates them, often as a
        // hard kill), so this timeout is the real safety net there, not SIGINT.
        setTimeout(() => {
          if (proc.exitCode === null) {
            proc.kill();
          }
        }, 4000);
      });
    },

    cancel() {
      proc.kill();
    },
  };
}