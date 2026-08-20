import { useState, useEffect, useRef } from 'react';
import './playMemory.css';

const vscode = acquireVsCodeApi();

// Static mock memory data — replace with real postMessage data later
const MOCK_MEMORY = {
  functionName: 'authenticateUser',
  filePath: 'src/auth/middleware.js',
  durationSec: 47,
  transcript:
    '"...latency issues during peak traffic last sprint. We had to scale the primary cluster by 2 nodes to handle the JWT validation overhead. If you\'re seeing slow auth, check the pool size in auth-config."',
};

const SPEEDS = [0.5, 1, 1.5, 2];

function formatTime(sec) {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s < 10 ? '0' : ''}${s}`;
}

// Waveform bar heights — visual design only, not tied to real audio
const BAR_HEIGHTS = [18, 32, 26, 42, 20, 36, 52, 48, 52, 44, 28, 38, 24, 46, 30];

export default function PlayMemory() {
  const [memory, setMemory] = useState(MOCK_MEMORY);
  const [isPlaying, setIsPlaying] = useState(false);
  const [progress, setProgress] = useState(0); // seconds elapsed
  const [speed, setSpeed] = useState(1);
  const intervalRef = useRef(null);

  // Listen for data injected from the extension host
  useEffect(() => {
    const handler = (event) => {
      const msg = event.data;
      if (msg.command === 'setMemoryData') {
        setMemory(msg.data);
        setProgress(0);
        setIsPlaying(false);
      }
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, []);

  // Tick the progress counter while playing
  useEffect(() => {
    if (isPlaying) {
      intervalRef.current = setInterval(() => {
        setProgress((prev) => {
          const next = prev + speed;
          if (next >= memory.durationSec) {
            setIsPlaying(false);
            return memory.durationSec;
          }
          return next;
        });
      }, 1000);
    } else {
      clearInterval(intervalRef.current);
    }
    return () => clearInterval(intervalRef.current);
  }, [isPlaying, speed, memory.durationSec]);

  const handlePlayPause = () => {
    if (progress >= memory.durationSec) {
      setProgress(0);
      setIsPlaying(true);
    } else {
      setIsPlaying((p) => !p);
    }
    vscode.postMessage({ command: 'playMemoryToggle', functionName: memory.functionName });
  };

  const handleSeekBack = () => {
    setProgress((p) => Math.max(0, p - 10));
  };

  const handleSeekForward = () => {
    setProgress((p) => Math.min(memory.durationSec, p + 10));
  };

  const handleSeekClick = (e) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    setProgress(Math.floor(ratio * memory.durationSec));
  };

  const handleClose = () => {
    vscode.postMessage({ command: 'closePlayMemory' });
  };

  const fillPct = memory.durationSec > 0
    ? (progress / memory.durationSec) * 100
    : 0;

  return (
    <div className="player-root">
      {/* Header */}
      <header className="player-header">
        <span className="player-title">Now Playing</span>
        <button className="close-btn" onClick={handleClose} title="Close player">
          <svg viewBox="0 0 24 24" fill="currentColor" width="14" height="14">
            <path d="M18 6L6 18M6 6l12 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" fill="none" />
          </svg>
        </button>
      </header>

      {/* Function badge */}
      <div className="function-badge">
        <div className="function-name">{memory.functionName}()</div>
        <div className="file-path">{memory.filePath}</div>
      </div>

      {/* Waveform */}
      <div className={`waveform-section${isPlaying ? ' playing' : ''}`}>
        {BAR_HEIGHTS.map((h, i) => (
          <div key={i} className="wav-bar" style={{ height: `${h}px` }} />
        ))}
      </div>

      {/* Progress / seek */}
      <div className="progress-section">
        <div className="time-row">
          <span className="time-label">{formatTime(progress)}</span>
          <span className="time-label">{formatTime(memory.durationSec)}</span>
        </div>
        <div className="seek-track" onClick={handleSeekClick}>
          <div className="seek-fill" style={{ width: `${fillPct}%` }}>
            <div className="seek-thumb" />
          </div>
        </div>
      </div>

      {/* Transport controls */}
      <div className="controls-row">
        {/* Seek back 10s */}
        <button className="ctrl-btn" onClick={handleSeekBack} title="Seek back 10s">
          <svg viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 5V1L7 6l5 5V7c3.31 0 6 2.69 6 6s-2.69 6-6 6-6-2.69-6-6H4c0 4.42 3.58 8 8 8s8-3.58 8-8-3.58-8-8-8z"/>
          </svg>
          <span>10</span>
        </button>

        {/* Play / Pause */}
        <button
          className={`play-btn${isPlaying ? ' playing' : ''}`}
          onClick={handlePlayPause}
          title={isPlaying ? 'Pause' : 'Play'}
        >
          {isPlaying ? (
            <svg viewBox="0 0 24 24" fill="currentColor">
              <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" />
            </svg>
          ) : (
            <svg viewBox="0 0 24 24" fill="currentColor">
              <path d="M8 5v14l11-7z" />
            </svg>
          )}
        </button>

        {/* Seek forward 10s */}
        <button className="ctrl-btn" onClick={handleSeekForward} title="Seek forward 10s">
          <span>10</span>
          <svg viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 5V1l5 5-5 5V7c-3.31 0-6 2.69-6 6s2.69 6 6 6 6-2.69 6-6h2c0 4.42-3.58 8-8 8s-8-3.58-8-8 3.58-8 8-8z"/>
          </svg>
        </button>
      </div>

      <div className="section-divider" />

      {/* Transcript */}
      <div className="transcript-section">
        <div className="transcript-label">Transcript</div>
        <p className="transcript-text">{memory.transcript}</p>
      </div>

      {/* Speed selector */}
      <div className="speed-row">
        <span className="speed-label">Speed</span>
        {SPEEDS.map((s) => (
          <button
            key={s}
            className={`speed-chip${speed === s ? ' active' : ''}`}
            onClick={() => setSpeed(s)}
          >
            {s}x
          </button>
        ))}
      </div>
    </div>
  );
}
