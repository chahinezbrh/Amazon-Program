import { useState, useEffect } from 'react';
import '../App.css';

export default function App() {
  const [isPlaying, setIsPlaying] = useState(false);
  const [progress, setProgress] = useState(0);

  // Simulated audio playback countdown/countup
  useEffect(() => {
    if (!isPlaying) return;

    const interval = setInterval(() => {
      setProgress((prev) => {
        if (prev >= 47) {
          setIsPlaying(false);
          return 0; // Reset once complete
        }
        return prev + 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [isPlaying]);

  const handlePlayToggle = () => {
    // If starting fresh, reset progress, otherwise toggle
    if (!isPlaying && progress === 0) {
      setProgress(0);
    }
    setIsPlaying(!isPlaying);
  };

  const handleReset = () => {
    setIsPlaying(false);
    setProgress(0);
  };

  // ormat progression or show default duration (0:47)
  const formatTime = () => {
    if (!isPlaying && progress === 0) {
      return '0:47';
    }
    const seconds = progress;
    return `0:${seconds < 10 ? '0' : ''}${seconds}`;
  };
   const barHeights = [14, 24, 20, 24, 10, 16, 26, 26, 26, 26, 18, 12];

  return (
    <div className="memory-container">
      <div className="memory-card">
        {/* Header Section */}
        <header className="card-header">
          {/* Add memory button */}
          <button className="header-btn btn-add" onClick={handleReset}>
            <span style={{ fontSize: '16px', fontWeight: 'bold', marginRight: '2px' }}>+</span>
            Add memory
          </button>

          {/* AI docs button */}
          <button className="header-btn btn-ai" onClick={() => alert('AI Docs generation triggered.')}>
            <svg className="icon" viewBox="0 0 24 24" fill="currentColor">
              {/* Sparkle icon path */}
              <path d="M9 4L11.5 9.5L17 12L11.5 14.5L9 20L6.5 14.5L1 12L6.5 9.5L9 4Z" />
              <path d="M19 2L20.25 4.75L23 6L20.25 7.25L19 10L17.75 7.25L15 6L17.75 4.75L19 2Z" />
            </svg>
            AI docs
          </button>

          {/* Write docs button */}
          <button className="header-btn btn-write" onClick={() => alert('Opening manual document writer.')}>
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
              title={isPlaying ? "Pause voice memory" : "Play voice memory"}
            >
              {isPlaying ? (
                // Pause Icon
                <svg viewBox="0 0 24 24" fill="currentColor" style={{ width: '12px', height: '12px' }}>
                  <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/>
                </svg>
              ) : (
                // Play Icon
                <svg viewBox="0 0 24 24" fill="currentColor" style={{ width: '12px', height: '12px' }}>
                  <path d="M8 5v14l11-7z"/>
                </svg>
              )}
              <span>{formatTime()}</span>
            </button>

            {/* Waveform Visualizer */}
            <div className={`waveform ${isPlaying ? 'playing' : ''}`}>
              {barHeights.map((height, index) => (
                <div
                  key={index}
                  className="wave-bar"
                  style={{ height: `${height}px` }}
                />
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
          <button className="footer-btn" onClick={() => alert('Navigating to full documentation.')}>
            Full Docs
          </button>
        </footer>
      </div>
    </div>
  );
}
