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
function parseDshowDevices(output: string): AudioDevice[] {
  const devices: AudioDevice[] = [];
  const lines = output.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? '';
    const name = /"([^"]+)"/.exec(line)?.[1];
    if (!name) continue;

    // The "(audio)" marker is sometimes on the same line, sometimes the next.
    const marker = line + (lines[i + 1] ?? '');
    if (!marker.includes('(audio)')) continue;

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
          // A signal we sent ourselves is a stop, not a failure. ffmpeg exits
          // 255 when interrupted with 'q', and reports null when killed.
          if (code === 0 || code === 255 || (askedToStop && code === null)) {
            resolve();
          } else {
            reject(new Error(stderr.trim() || `ffmpeg exited with ${code ?? signal}`));
          }
        });

        // 'q' is the only way ffmpeg finalises the container cleanly. SIGINT is
        // the fallback; SIGKILL would leave the file's header unwritten.
        proc.stdin?.write('q');

        setTimeout(() => {
          if (proc.exitCode === null) {
            askedToStop = true;
            proc.kill('SIGINT');
          }
        }, 1500);

        setTimeout(() => {
          if (proc.exitCode === null) {
            askedToStop = true;
            proc.kill();
          }
        }, 5000);
      });
    },

    cancel() {
      proc.kill();
    },
  };
}