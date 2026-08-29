"use strict";
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
exports.detectFfmpeg = detectFfmpeg;
exports.listAudioDevices = listAudioDevices;
exports.startRecording = startRecording;
const child_process_1 = require("child_process");
const util_1 = require("util");
const os = __importStar(require("os"));
const vscode = __importStar(require("vscode"));
const execFileAsync = (0, util_1.promisify)(child_process_1.execFile);
/** Capture backend per platform. ffmpeg needs a different one on each. */
function captureFormat() {
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
async function detectFfmpeg(binary = 'ffmpeg') {
    try {
        const { stdout } = await execFileAsync(binary, ['-version']);
        return stdout.split('\n')[0] ?? 'ffmpeg';
    }
    catch {
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
async function listAudioDevices(binary = 'ffmpeg') {
    const platform = os.platform();
    if (platform === 'linux') {
        // PulseAudio's default source is almost always what the user wants, and
        // enumerating properly means talking to pactl rather than ffmpeg.
        return [{ id: 'default', label: 'Default input' }];
    }
    const args = platform === 'win32'
        ? ['-list_devices', 'true', '-f', 'dshow', '-i', 'dummy']
        : ['-f', 'avfoundation', '-list_devices', 'true', '-i', ''];
    let output = '';
    try {
        const { stderr } = await execFileAsync(binary, args);
        output = stderr;
    }
    catch (err) {
        output = err.stderr ?? '';
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
function parseDshowDevices(output) {
    const devices = [];
    const lines = output.split('\n');
    for (const line of lines) {
        // Only primary device lines look like: "Name" (audio) / "Name" (video)
        // Alternative-name lines never carry (audio)/(video), so this pattern
        // alone is enough to skip them.
        const match = /"([^"]+)"\s+\((audio|video)\)/.exec(line);
        if (!match)
            continue;
        const [, name, kind] = match;
        if (!name || kind !== 'audio')
            continue;
        devices.push({ id: `audio=${name}`, label: name });
    }
    return devices;
}
/** avfoundation prints an indexed list under "AVFoundation audio devices:" */
function parseAvfoundationDevices(output) {
    const devices = [];
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
        if (!inAudioSection)
            continue;
        const match = /\[(\d+)\]\s+(.+)$/.exec(line.trim());
        if (match?.[1] && match[2]) {
            devices.push({ id: `:${match[1]}`, label: match[2].trim() });
        }
    }
    return devices;
}
/**
 * Starts recording to `outputPath`. The container is inferred from the
 * extension, so a .webm path gets Opus audio.
 *
 * `maxSeconds` is a safety net: without it a forgotten recording would run
 * until the editor closes and could fill the disk.
 */
function startRecording(deviceId, outputPath, options = {}) {
    const { binary = 'ffmpeg', maxSeconds = 600 } = options;
    const proc = (0, child_process_1.spawn)(binary, [
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
            return new Promise((resolve, reject) => {
                if (proc.exitCode !== null)
                    return resolve();
                let askedToStop = false;
                proc.once('close', (code, signal) => {
                    vscode.window.showInformationMessage(`[DEBUG] ffmpeg closed. code=${code} signal=${signal} stderr=${stderr || '(empty)'}`);
                    if (code === 0 || code === 255 || (askedToStop && code === null)) {
                        resolve();
                    }
                    else {
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
                }
                else {
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
