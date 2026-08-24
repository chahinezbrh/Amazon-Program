import React, { useCallback, useEffect, useRef, useState } from 'react';

// Provided by VS Code at runtime inside the webview sandbox.
/* global acquireVsCodeApi */
const vscode = acquireVsCodeApi();

// idle → recording → preview → saving
export default function RecordPanel() {
  const [meta, setMeta] = useState(null);
  const [phase, setPhase] = useState('idle');
  const [elapsed, setElapsed] = useState(0);
  const [error, setError] = useState(null);
  const [previewUrl, setPreviewUrl] = useState(null);

  const recorderRef = useRef(null);
  const streamRef = useRef(null);
  const chunksRef = useRef([]);
  const blobRef = useRef(null);
  const startedAtRef = useRef(0);
  const durationRef = useRef(0);

  useEffect(() => {
    function onMessage(event) {
      if (event.data?.type === 'meta') setMeta(event.data.payload);
    }
    window.addEventListener('message', onMessage);
    vscode.postMessage({ type: 'ready' });
    return () => window.removeEventListener('message', onMessage);
  }, []);

  // Releasing the microphone matters: a stream left open keeps the OS
  // recording indicator lit even after the panel is gone.
  useEffect(() => {
    return () => {
      streamRef.current?.getTracks().forEach((t) => t.stop());
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  useEffect(() => {
    if (phase !== 'recording') return;
    const id = setInterval(
      () => setElapsed((Date.now() - startedAtRef.current) / 1000),
      200
    );
    return () => clearInterval(id);
  }, [phase]);

  const start = useCallback(async () => {
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      const recorder = new MediaRecorder(stream);
      recorderRef.current = recorder;
      chunksRef.current = [];

      recorder.ondataavailable = (e) => {
        if (e.data.size) chunksRef.current.push(e.data);
      };

      recorder.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
        const blob = new Blob(chunksRef.current, { type: recorder.mimeType });
        blobRef.current = blob;
        setPreviewUrl(URL.createObjectURL(blob));
        setPhase('preview');
      };

      recorder.start();
      startedAtRef.current = Date.now();
      setElapsed(0);
      setPhase('recording');
    } catch (err) {
      // Permission denial and unsupported platforms both land here. Showing it
      // matters: a silent failure looks identical to a broken button.
      setError(err?.message || 'Microphone unavailable');
      setPhase('idle');
    }
  }, []);

  const stop = useCallback(() => {
    const recorder = recorderRef.current;
    if (!recorder || recorder.state === 'inactive') return;
    durationRef.current = (Date.now() - startedAtRef.current) / 1000;
    recorder.stop();
  }, []);

  const save = useCallback(() => {
    const blob = blobRef.current;
    if (!blob) return;
    setPhase('saving');

    // A Blob can't cross the webview boundary — postMessage only carries
    // structured-cloneable data — so it goes over as base64 text.
    const reader = new FileReader();
    reader.onload = () => {
      vscode.postMessage({
        type: 'recorded',
        base64: String(reader.result).split(',')[1],
        durationSec: durationRef.current,
        mimeType: blob.type,
      });
    };
    reader.onerror = () => {
      setError('Could not read the recording.');
      setPhase('preview');
    };
    reader.readAsDataURL(blob);
  }, []);

  const discard = useCallback(() => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(null);
    blobRef.current = null;
    setElapsed(0);
    setPhase('idle');
  }, [previewUrl]);

  return (
    <div id="record-app">
      <header id="record-header">
        <span id="record-symbol-icon">ƒ</span>
        <h2 id="record-symbol">{meta?.symbolName ?? '…'}</h2>
      </header>

      <div id="record-body">
        <div id="record-timer" className={phase === 'recording' ? 'live' : ''}>
          {formatDuration(phase === 'preview' ? durationRef.current : elapsed)}
        </div>

        <Waveform active={phase === 'recording'} />

        <p id="record-status">
          {phase === 'idle' && 'Ready to record'}
          {phase === 'recording' && 'Recording…'}
          {phase === 'preview' && 'Play it back, then save'}
          {phase === 'saving' && 'Saving…'}
        </p>

        {error && <p id="record-error">{error}</p>}

        {previewUrl && <audio src={previewUrl} controls id="record-preview" />}
      </div>

      <footer id="record-actions">
        {phase === 'idle' && (
          <button className="record-btn primary" onClick={start}>
            Start recording
          </button>
        )}
        {phase === 'recording' && (
          <button className="record-btn danger" onClick={stop}>
            Stop
          </button>
        )}
        {phase === 'preview' && (
          <>
            <button className="record-btn primary" onClick={save}>
              Save
            </button>
            <button className="record-btn" onClick={discard}>
              Re-record
            </button>
          </>
        )}
        <button
          className="record-btn"
          disabled={phase === 'saving'}
          onClick={() => vscode.postMessage({ type: 'cancel' })}
        >
          Cancel
        </button>
      </footer>
    </div>
  );
}

/** Decorative: bars animate while recording. Not derived from the audio
 *  signal — reading real levels needs an AnalyserNode, which is worth adding
 *  later but isn't needed to capture sound. */
function Waveform({ active }) {
  const bars = Array.from({ length: 32 }, (_, i) => i);
  return (
    <div id="record-waveform" className={active ? 'active' : ''}>
      {bars.map((i) => (
        <span key={i} style={{ animationDelay: `${(i % 8) * 0.08}s` }} />
      ))}
    </div>
  );
}

function formatDuration(seconds) {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60)
    .toString()
    .padStart(2, '0');
  return `${m}:${s}`;
}