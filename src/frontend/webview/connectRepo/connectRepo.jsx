import React, { useState, useEffect } from 'react';
import './connectRepo.css';

const vscode = acquireVsCodeApi();

export default function ConnectRepo() {
  const [status, setStatus] = useState('idle'); // 'idle' | 'loading' | 'success' | 'error'
  const [statusMessage, setStatusMessage] = useState('');
  const [repoUrl, setRepoUrl] = useState('');
  const [showUrlInput, setShowUrlInput] = useState(false);
  const [errorDetails, setErrorDetails] = useState('');
  const [stats, setStats] = useState(null);

  useEffect(() => {
    const handleMessage = (event) => {
      const msg = event.data;
      if (!msg) return;

      switch (msg.command) {
        case 'initData':
          if (msg.repoUrl) {
            setRepoUrl(msg.repoUrl);
          }
          break;

        case 'setStatus':
          setStatus(msg.status);
          setStatusMessage(msg.message || '');
          if (msg.error) setErrorDetails(msg.error);
          if (msg.stats) setStats(msg.stats);
          break;
      }
    };

    window.addEventListener('message', handleMessage);
    vscode.postMessage({ command: 'ready' });

    return () => window.removeEventListener('message', handleMessage);
  }, []);

  const handleConnect = () => {
    setStatus('loading');
    setStatusMessage('Scanning workspace and parsing functions…');
    setErrorDetails('');
    vscode.postMessage({
      command: 'connectRepo',
      repoUrl: repoUrl.trim() || undefined,
    });
  };

  const handleDone = () => {
    vscode.postMessage({ command: 'close' });
  };

  return (
    <div className="connect-wrapper">
      <div className="connect-card">
        {/* ── Top Icon Badge ── */}
        <div className="icon-badge">
          {/* GitHub Icon with waving arm */}
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M9 19c-5 1.5-5-2.5-7-3m14 6v-3.87a3.37 3.37 0 0 0-.94-2.61c3.14-.35 6.44-1.54 6.44-7A5.44 5.44 0 0 0 20 4.77 5.07 5.07 0 0 0 19.91 1S18.73.65 16 2.48a13.38 13.38 0 0 0-7 0C6.27.65 5.09 1 5.09 1A5.07 5.07 0 0 0 5 4.77a5.44 5.44 0 0 0-1.5 3.78c0 5.42 3.3 6.61 6.44 7A3.37 3.37 0 0 0 9 18.13V22" />
          </svg>
        </div>

        {/* ── Title & Subtitle ── */}
        <h1 className="connect-title">Connect your repo</h1>
        <p className="connect-desc">
          Link a GitHub repository to index every function. This only runs the first time.
        </p>

        {/* ── Status States ── */}
        {status === 'loading' && (
          <div className="status-box status-box--loading">
            <div className="spinner" />
            <div className="status-message">{statusMessage || 'Indexing repository…'}</div>
            <div className="status-detail">Creating .funcmanager and .docmanager</div>
          </div>
        )}

        {status === 'success' && (
          <div className="status-box status-box--success">
            <div className="status-message" style={{ color: '#3ac8ab' }}>
              ✓ Repository connected & indexed!
            </div>
            {stats && (
              <div className="status-detail">
                Indexed {stats.functionsCount} functions across {stats.filesCount} files.
              </div>
            )}
          </div>
        )}

        {status === 'error' && (
          <div className="status-box status-box--error">
            <div className="error-text">
              {errorDetails || statusMessage || 'Failed to index repository.'}
            </div>
          </div>
        )}

        {/* ── Optional Input for Repo URL ── */}
        {showUrlInput && status !== 'loading' && status !== 'success' && (
          <div className="input-group">
            <label className="input-label">GitHub Repository URL (Optional)</label>
            <input
              type="text"
              className="repo-input"
              placeholder="https://github.com/owner/repo"
              value={repoUrl}
              onChange={(e) => setRepoUrl(e.target.value)}
            />
          </div>
        )}

        {/* ── Action Buttons ── */}
        {status === 'success' ? (
          <button className="btn-primary" onClick={handleDone}>
            Start Exploring Code
          </button>
        ) : (
          <button
            className="btn-primary"
            onClick={handleConnect}
            disabled={status === 'loading'}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 19c-5 1.5-5-2.5-7-3m14 6v-3.87a3.37 3.37 0 0 0-.94-2.61c3.14-.35 6.44-1.54 6.44-7A5.44 5.44 0 0 0 20 4.77 5.07 5.07 0 0 0 19.91 1S18.73.65 16 2.48a13.38 13.38 0 0 0-7 0C6.27.65 5.09 1 5.09 1A5.07 5.07 0 0 0 5 4.77a5.44 5.44 0 0 0-1.5 3.78c0 5.42 3.3 6.61 6.44 7A3.37 3.37 0 0 0 9 18.13V22" />
            </svg>
            {status === 'loading' ? 'Indexing functions…' : 'Connect repository'}
          </button>
        )}

        {status !== 'loading' && status !== 'success' && (
          <button
            className="btn-toggle-input"
            onClick={() => setShowUrlInput(!showUrlInput)}
          >
            {showUrlInput ? 'Hide repository URL input' : 'Paste custom GitHub URL'}
          </button>
        )}

        {/* ── Footer ── */}
        <div className="connect-footer">
          Creates .funcmanager and .docmanager in your project
        </div>
      </div>
    </div>
  );
}
