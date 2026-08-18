import { useState, useEffect } from 'react';
import './functionHoverPopup.css';

// Provided globally by the VS Code webview environment
const vscode = acquireVsCodeApi();

export default function FunctionHoverPopup() {
  const [functionData, setFunctionData] = useState(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [progress, setProgress] = useState(0);

  // Receive real function data pushed from FunctionHoverProvider.ts
  useEffect(() => {
    const listener = (event) => {
      if (event.data.command === 'setData') {
        setFunctionData(event.data.data);
      }
    };
    window.addEventListener('message', listener);
    return () => window.removeEventListener('message', listener);
  }, []);

  const durationSec = functionData?.durationSec ?? 47;

  useEffect(() => {
    if (!isPlaying) return;

    const interval = setInterval(() => {
      setProgress((prev) => {
        if (prev >= durationSec) {
          setIsPlaying(false);
          return 0;
        }
        return prev + 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [isPlaying, durationSec]);

  const handlePlayToggle = () => {
    if (!isPlaying && progress === 0) setProgress(0);
    setIsPlaying(!isPlaying);
    vscode.postMessage({ command: 'playMemory', functionId: functionData?.id });
  };

  const handleAddMemory = () => {
    setIsPlaying(false);
    setProgress(0);
    vscode.postMessage({ command: 'addMemory', functionId: functionData?.id });
  };

  const handleAiDocs = () => {
    vscode.postMessage({ command: 'generateAiDocs', functionId: functionData?.id });
  };

  const handleWriteDocs = () => {
    vscode.postMessage({ command: 'writeDocs', functionId: functionData?.id });
  };

  const handleFullDocs = () => {
    vscode.postMessage({ command: 'openFullDocs', functionId: functionData?.id });
  };

  const formatTime = () => {
    if (!isPlaying && progress === 0) {
      const mins = Math.floor(durationSec / 60);
      const secs = durationSec % 60;
      return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
    }
    const mins = Math.floor(progress / 60);
    const secs = progress % 60;
    return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
  };

  const barHeights = [14, 24, 20, 24, 10, 16, 26, 26, 26, 26, 18, 12];

  if (!functionData) {
    return <div className="memory-container loading">Loading…</div>;
  }

  return (
    <div className="memory-container">
      <div className="memory-card">
        {/* Header Section */}
        <header className="card-header">
          <button className="header-btn btn-add" onClick={handleAddMemory}>
            <span className="plus-icon">+</span>
            Add memory
          </button>

          <button className="header-btn btn-ai" onClick={handleAiDocs}>
            <svg className="icon" viewBox="0 0 24 24" fill="currentColor">
              <path d="M9 4L11.5 9.5L17 12L11.5 14.5L9 20L6.5 14.5L1 12L6.5 9.5L9 4Z" />
              <path d="M19 2L20.25 4.75L23 6L20.25 7.25L19 10L17.75 7.25L15 6L17.75 4.75L19 2Z" />
            </svg>
            AI docs
          </button>

          <button className="header-btn btn-write" onClick={handleWriteDocs}>
            Write docs
          </button>
        </header>

        {/* Content Area */}
        <main className="card-content">
          <div className="content-label">Voice memory</div>

          <div className="player-row">
            {/* Play Pill */}
            <button
              className={`play-pill ${isPlaying ? 'playing' : ''}`}
              onClick={handlePlayToggle}
              title={isPlaying ? 'Pause voice memory' : 'Play voice memory'}
            >
              {isPlaying ? (
                <svg viewBox="0 0 24 24" fill="currentColor" className="play-icon">
                  <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" />
                </svg>
              ) : (
                <svg viewBox="0 0 24 24" fill="currentColor" className="play-icon">
                  <path d="M8 5v14l11-7z" />
                </svg>
              )}
              <span>{formatTime()}</span>
            </button>

            {/* Waveform Visualizer */}
            <div className={`waveform ${isPlaying ? 'playing' : ''}`}>
              {barHeights.map((height, index) => (
                <div key={index} className="wave-bar" style={{ height: `${height}px` }} />
              ))}
            </div>
          </div>
        </main>

        {/* Footer Section */}
        <footer className="card-footer">
          <button className="footer-btn" onClick={handlePlayToggle}>
            {isPlaying ? 'Pause memory' : 'Play memory'}
          </button>
          <div className="footer-divider" />
          <button className="footer-btn" onClick={handleFullDocs}>
            Full Docs
          </button>
        </footer>
      </div>
    </div>
  );
}