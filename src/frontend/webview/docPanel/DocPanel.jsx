import React, { useEffect, useRef, useState, useCallback } from 'react';

// Provided by VS Code at runtime inside the webview sandbox.
/* global acquireVsCodeApi */
const vscode = acquireVsCodeApi();

const TYPE_LABEL = { written: 'Written', ai: 'AI docs', voice: 'Voice' };
const TYPE_ICON = { written: '✎', ai: '✦', voice: '🎙' };

export default function DocPanel() {
  const [meta, setMeta] = useState(null);
  // undefined = loading, null = error, array = loaded
  const [entries, setEntries] = useState(undefined);
  const [error, setError] = useState(null);
  const [activeEntryId, setActiveEntryId] = useState(null);

  useEffect(() => {
    function onMessage(event) {
      const message = event.data;
      switch (message.type) {
        case 'meta':
          setMeta(message.payload);
          setEntries(undefined);
          setError(null);
          break;
        case 'entries':
          setEntries(message.payload);
          setActiveEntryId((current) => current ?? message.payload[0]?.id ?? null);
          break;
        case 'error':
          setEntries(null);
          setError(message.message);
          break;
        default:
          break; // 'audioUrl' is handled by VoiceEntry itself
      }
    }
    window.addEventListener('message', onMessage);
    vscode.postMessage({ type: 'ready' });
    return () => window.removeEventListener('message', onMessage);
  }, []);

  if (!meta) {
    // Nothing has arrived yet at all — should be near-instant, this is just a safety net.
    return <div id="app" />;
  }

  const activeEntry = Array.isArray(entries)
    ? entries.find((e) => e.id === activeEntryId)
    : null;

  return (
    <div id="app">
      <Header symbolName={meta.symbolName} />

      {Array.isArray(entries) && entries.length > 0 && (
        <TabBar entries={entries} activeEntryId={activeEntryId} onSelect={setActiveEntryId} />
      )}

      <div id="content">
        {entries === undefined && <Skeleton />}
        {entries === null && <ErrorState message={error} />}
        {Array.isArray(entries) && entries.length === 0 && <EmptyState symbolName={meta.symbolName} />}
        {activeEntry && <EntryDetail entry={activeEntry} />}
      </div>

      <Footer />
    </div>
  );
}

function Header({ symbolName }) {
  return (
    <header id="header">
      <div id="symbolInfo">
        <span id="symbolIcon">ƒ</span>
        <h2 id="symbolName">{symbolName}</h2>
      </div>
      <button id="jumpBtn" title="Go to definition" onClick={() => vscode.postMessage({ type: 'jumpToSymbol' })}>
        ↗
      </button>
    </header>
  );
}

function TabBar({ entries, activeEntryId, onSelect }) {
  return (
    <div id="tabs">
      {entries.map((entry) => (
        <button
          key={entry.id}
          className={'tab' + (entry.id === activeEntryId ? ' active' : '')}
          title={`${TYPE_LABEL[entry.type]} · ${formatDate(entry.createdAt)} · ${entry.author}`}
          onClick={() => onSelect(entry.id)}
        >
          <span className="tab-icon">{TYPE_ICON[entry.type]}</span> {TYPE_LABEL[entry.type]}
        </button>
      ))}
    </div>
  );
}

function EntryDetail({ entry }) {
  return (
    <>
      <div className="entry-meta">
        <span>{entry.author}</span>
        <span className="dot">·</span>
        <span>{formatDate(entry.createdAt)}</span>
      </div>
      {entry.type === 'voice' ? <VoiceEntry entry={entry} /> : <TextEntry entry={entry} />}
    </>
  );
}

function TextEntry({ entry }) {
  const [isEditing, setIsEditing] = useState(false);
  const [draft, setDraft] = useState(entry.content || '');

  // If the user switches tabs (different entry) or fresh content arrives, drop any in-progress edit.
  useEffect(() => {
    setDraft(entry.content || '');
    setIsEditing(false);
  }, [entry.id, entry.content]);

  function handleSave() {
    vscode.postMessage({ type: 'saveWritten', entryId: entry.id, content: draft });
    setIsEditing(false);
  }

  function handleCancel() {
    setDraft(entry.content || '');
    setIsEditing(false);
  }

  if (isEditing) {
    return (
      <div className="text-entry">
        <textarea
          className="text-editor"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          rows={10}
          autoFocus
        />
        <div className="editor-actions">
          <button className="ghost-btn small primary" onClick={handleSave}>
            Save
          </button>
          <button className="ghost-btn small" onClick={handleCancel}>
            Cancel
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="text-entry">
      <div className="text-content">{entry.content || '(empty)'}</div>
      <button className="ghost-btn small" onClick={() => setIsEditing(true)}>
        Edit
      </button>
    </div>
  );
}

function VoiceEntry({ entry }) {
  const audioRef = useRef(null);
  const [audioUrl, setAudioUrl] = useState(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const barCount = 40;

  // Deterministic pseudo-random waveform shape, stable per entry id.
  const bars = Array.from({ length: barCount }, (_, i) => {
    const seed = Math.sin(i * ((entry.id.charCodeAt(0) || 1))) * 10000;
    return 20 + Math.abs(seed % 1) * 80;
  });

  useEffect(() => {
    function onMessage(event) {
      const message = event.data;
      if (message.type === 'audioUrl' && message.entryId === entry.id) {
        setAudioUrl(message.url);
      }
    }
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [entry.id]);

  useEffect(() => {
    if (audioUrl && audioRef.current) {
      audioRef.current.play();
      setIsPlaying(true);
    }
  }, [audioUrl]);

  const handlePlayPause = useCallback(() => {
    if (!audioUrl) {
      vscode.postMessage({ type: 'requestAudio', entryId: entry.id });
      return;
    }
    const audio = audioRef.current;
    if (!audio) return;
    if (audio.paused) {
      audio.play();
      setIsPlaying(true);
    } else {
      audio.pause();
      setIsPlaying(false);
    }
  }, [audioUrl, entry.id]);

  const duration = (audioRef.current && audioRef.current.duration) || entry.durationSeconds || 0;
  const playedCount = duration ? Math.floor((currentTime / duration) * barCount) : 0;

  return (
    <div className="voice-entry">
      <div className="waveform">
        {bars.map((height, i) => (
          <span key={i} className={i < playedCount ? 'played' : ''} style={{ height: `${height}%` }} />
        ))}
      </div>

      <div className="player-controls">
        <button className="play-btn" onClick={handlePlayPause}>
          {isPlaying ? '⏸' : '▶'}
        </button>
        <span className="time">
          {formatDuration(currentTime)} / {formatDuration(duration)}
        </span>
      </div>

      {entry.transcript && <p className="transcript">{entry.transcript}</p>}

      {audioUrl && (
        <audio
          ref={audioRef}
          src={audioUrl}
          onTimeUpdate={(e) => setCurrentTime(e.currentTarget.currentTime)}
          onEnded={() => setIsPlaying(false)}
        />
      )}
    </div>
  );
}

function Skeleton() {
  return (
    <div className="skeleton">
      <div className="skeleton-line short" />
      <div className="skeleton-line" />
      <div className="skeleton-line" />
    </div>
  );
}

function ErrorState({ message }) {
  return (
    <div className="empty-state">
      <p>Couldn't load documentation.</p>
      <p className="muted">{message || 'Unknown error'}</p>
    </div>
  );
}

function EmptyState({ symbolName }) {
  return (
    <div className="empty-state">
      <p>No documentation yet for <strong>{symbolName}</strong>.</p>
      <p className="muted">Use the buttons below to write, generate, or record one.</p>
    </div>
  );
}

function Footer() {
  return (
    <footer id="footer">
      <button className="ghost-btn" onClick={() => vscode.postMessage({ type: 'editWritten' })}>
        + Written
      </button>
      <button className="ghost-btn" onClick={() => vscode.postMessage({ type: 'generateWithAI' })}>
        + AI docs
      </button>
      <button className="ghost-btn" onClick={() => vscode.postMessage({ type: 'reRecordVoice' })}>
        + Voice
      </button>
    </footer>
  );
}

function formatDuration(seconds) {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60).toString().padStart(2, '0');
  return `${m}:${s}`;
}

function formatDate(iso) {
  try {
    return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  } catch {
    return iso;
  }
}