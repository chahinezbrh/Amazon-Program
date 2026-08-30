import React, { useEffect, useMemo, useRef, useState, useCallback } from 'react';

// Provided by VS Code at runtime inside the webview sandbox.
/* global acquireVsCodeApi */
const vscode = acquireVsCodeApi();

const TYPE_LABEL = { source: 'Source', written: 'Written', ai: 'AI docs', voice: 'Voice' };
const TYPE_ICON = { source: '⟨⟩', written: '✎', ai: '✦', voice: '🎙' };

/**
 * Groups entries into tabs.
 *
 * Source, written and AI are one entry each, but every voice memo used to get
 * its own tab — three recordings meant three identical "Voice" tabs. They now
 * collapse into one tab holding a list.
 *
 * `drafts` adds tabs for content that exists only in this session: an empty
 * written doc being composed, or an AI draft awaiting Save.
 */
function buildTabs(entries, drafts = {}) {
  const tabs = [];

  for (const type of ['source', 'written', 'ai']) {
    let entry = entries.find((e) => e.type === type);

    if (type === 'written' && !entry && drafts.written) {
      entry = draftEntry('written', '', 'You');
    }

    // An AI draft supersedes the saved AI doc while it is on screen, so the
    // user compares against what they are about to replace.
    if (type === 'ai' && drafts.ai) {
      entry = { ...draftEntry('ai', drafts.ai.content, 'AI generated'), isDraft: true };
    }

    if (entry) tabs.push({ id: `tab:${type}`, type, entries: [entry] });
  }

  const voices = entries.filter((e) => e.type === 'voice');
  if (voices.length) tabs.push({ id: 'tab:voice', type: 'voice', entries: voices });

  return tabs;
}

function draftEntry(type, content, author) {
  return {
    id: `draft:${type}`,
    type,
    content,
    author,
    createdAt: new Date().toISOString(),
    isStale: false,
  };
}

export default function DocPanel() {
  const [meta, setMeta] = useState(null);
  // undefined = loading, null = error, array = loaded
  const [entries, setEntries] = useState(undefined);
  const [error, setError] = useState(null);
  const [activeTabId, setActiveTabId] = useState(null);

  /** True while an unsaved written doc is being composed. */
  const [draftWritten, setDraftWritten] = useState(false);
  /** { content } while an unsaved AI draft is on screen, else null. */
  const [aiDraft, setAiDraft] = useState(null);
  const [aiPending, setAiPending] = useState(false);
  const [aiError, setAiError] = useState(null);
  /** Bumped to tell TextEntry to open in edit mode rather than read mode. */
  const [editRequest, setEditRequest] = useState(0);

  const tabs = useMemo(
    () =>
      Array.isArray(entries)
        ? buildTabs(entries, { written: draftWritten, ai: aiDraft })
        : [],
    [entries, draftWritten, aiDraft]
  );

  useEffect(() => {
    function onMessage(event) {
      const message = event.data;
      switch (message.type) {
        case 'meta':
          setMeta(message.payload);
          setEntries(undefined);
          setError(null);
          // A different symbol makes everything session-scoped meaningless.
          setActiveTabId(null);
          setDraftWritten(false);
          setAiDraft(null);
          setAiPending(false);
          setAiError(null);
          break;

        case 'entries': {
          setEntries(message.payload);
          // A saved written doc replaces the draft; keep the draft otherwise so
          // an unrelated refresh doesn't discard what the user is typing.
          if (message.payload.some((e) => e.type === 'written')) {
            setDraftWritten(false);
          }
          const next = buildTabs(message.payload);
          setActiveTabId((current) => {
            // Keep the user's choice while that tab still exists, so saving a
            // written doc doesn't bounce them back to Source mid-edit.
            if (next.some((t) => t.id === current)) return current;
            const source = next.find((t) => t.type === 'source');
            return source?.id ?? next[0]?.id ?? null;
          });
          break;
        }

        case 'aiPending':
          setAiPending(true);
          setAiError(null);
          setActiveTabId('tab:ai');
          break;

        case 'aiDraft':
          setAiPending(false);
          setAiError(null);
          setAiDraft({ content: message.content });
          setActiveTabId('tab:ai');
          break;

        case 'aiError':
          setAiPending(false);
          setAiError(message.message);
          break;

        case 'error':
          setEntries(null);
          setError(message.message);
          break;

        default:
          break; // 'audioUrl' is handled by VoiceRow itself
      }
    }
    window.addEventListener('message', onMessage);
    vscode.postMessage({ type: 'ready' });
    return () => window.removeEventListener('message', onMessage);
  }, []);

  /** Opens the Written tab in edit mode, adding an empty one if it doesn't
   *  exist yet. Handled here rather than round-tripping through the extension:
   *  the editor is already in this panel.
   *
   *  Declared before the early return below — hooks must run in the same order
   *  on every render. */
  const startWriting = useCallback(() => {
    setDraftWritten(true);
    setActiveTabId('tab:written');
    setEditRequest((n) => n + 1);
  }, []);

  const generate = useCallback((instruction) => {
    vscode.postMessage(
      instruction ? { type: 'generateAi', instruction } : { type: 'generateAi' }
    );
  }, []);

  const saveAi = useCallback((content) => {
    vscode.postMessage({ type: 'saveAi', content });
    setAiDraft(null);
  }, []);

  const discardAi = useCallback(() => {
    vscode.postMessage({ type: 'discardAi' });
    setAiDraft(null);
    setAiError(null);
  }, []);

  if (!meta) {
    // Nothing has arrived yet — near-instant in practice, this is a safety net.
    return <div id="app" />;
  }

  const activeTab = tabs.find((t) => t.id === activeTabId) ?? null;
  const showAiPane = activeTab?.type === 'ai' || (aiPending && !activeTab);

  return (
    <div id="app">
      <Header symbolName={meta.symbolName} />

      {tabs.length > 0 && (
        <TabBar
          tabs={tabs}
          activeTabId={activeTabId}
          onSelect={setActiveTabId}
          aiPending={aiPending}
        />
      )}

      <div id="content">
        {entries === undefined && <Skeleton />}
        {entries === null && <ErrorState message={error} />}
        {Array.isArray(entries) && tabs.length === 0 && !aiPending && (
          <EmptyState symbolName={meta.symbolName} />
        )}

        {showAiPane ? (
          <AiPane
            entry={activeTab?.entries[0]}
            pending={aiPending}
            error={aiError}
            onGenerate={generate}
            onSave={saveAi}
            onDiscard={discardAi}
          />
        ) : (
          <>
            {activeTab?.type === 'voice' && <VoiceList entries={activeTab.entries} />}
            {activeTab && activeTab.type !== 'voice' && (
              <EntryDetail
                entry={activeTab.entries[0]}
                editRequest={activeTab.type === 'written' ? editRequest : 0}
              />
            )}
          </>
        )}
      </div>

      <Footer onAddWritten={startWriting} onAddAi={() => generate()} />
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
      <button
        id="jumpBtn"
        title="Go to definition"
        onClick={() => vscode.postMessage({ type: 'jumpToSymbol' })}
      >
        ↗
      </button>
    </header>
  );
}

function TabBar({ tabs, activeTabId, onSelect, aiPending }) {
  return (
    <div id="tabs">
      {tabs.map((tab) => {
        const stale = tab.entries.filter((e) => e.isStale).length;
        const isDraft = tab.entries.some((e) => e.isDraft);

        return (
          <button
            key={tab.id}
            className={
              'tab' +
              (tab.id === activeTabId ? ' active' : '') +
              (isDraft ? ' draft' : '')
            }
            title={tabTitle(tab, stale, isDraft)}
            onClick={() => onSelect(tab.id)}
          >
            <span className={'tab-icon' + (tab.type === 'ai' && aiPending ? ' spin' : '')}>
              {TYPE_ICON[tab.type]}
            </span>
            {TYPE_LABEL[tab.type]}
            {tab.type === 'voice' && tab.entries.length > 1 && (
              <span className="tab-count">{tab.entries.length}</span>
            )}
            {isDraft && <span className="tab-count">draft</span>}
            {stale > 0 && <span className="stale-dot">•</span>}
          </button>
        );
      })}
    </div>
  );
}

function tabTitle(tab, stale, isDraft) {
  if (isDraft) return 'Unsaved draft';
  if (tab.type === 'voice') {
    const n = tab.entries.length;
    return `${n} recording${n === 1 ? '' : 's'}${stale ? ` · ${stale} stale` : ''}`;
  }
  const entry = tab.entries[0];
  return `${TYPE_LABEL[tab.type]} · ${formatDate(entry.createdAt)} · ${entry.author}${
    stale ? ' · code changed since this was written' : ''
  }`;
}

/* -------------------------------------------------------------------------- */
/* AI                                                                         */
/* -------------------------------------------------------------------------- */

/**
 * The AI tab. Shows one of three things: a saved AI doc (read-only, editable
 * like any other), an unsaved draft with Save/Discard and a refine box, or the
 * pending state while Gemini is working.
 *
 * The refinement conversation lives in the extension host and is discarded when
 * the panel moves to another symbol — docs.json stores the accepted
 * documentation, never the conversation that produced it.
 */
function AiPane({ entry, pending, error, onGenerate, onSave, onDiscard }) {
  const [instruction, setInstruction] = useState('');
  const isDraft = Boolean(entry?.isDraft);

  const submit = useCallback(() => {
    const text = instruction.trim();
    if (!text) return;
    onGenerate(text);
    setInstruction('');
  }, [instruction, onGenerate]);

  if (pending) {
    return (
      <div className="ai-pending">
        <Skeleton />
        <p className="muted">Generating…</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="empty-state">
        <p className="ai-error">{error}</p>
        <button className="ghost-btn small" onClick={() => onGenerate()}>
          Try again
        </button>
      </div>
    );
  }

  if (!entry) {
    return (
      <div className="empty-state">
        <p>No AI documentation yet.</p>
        <button className="ghost-btn small primary" onClick={() => onGenerate()}>
          Generate
        </button>
      </div>
    );
  }

  // Saved doc: behaves like any other text entry, including Edit (which flips
  // its confidence to AI_REVIEWED on save).
  if (!isDraft) {
    return (
      <>
        <EntryDetail entry={entry} editRequest={0} />
        <div className="ai-actions">
          <button className="ghost-btn small" onClick={() => onGenerate()}>
            Regenerate
          </button>
        </div>
      </>
    );
  }

  return (
    <div className="ai-draft">
      <div className="ai-badge">Draft · not saved yet</div>
      <div className="text-content">{entry.content}</div>

      <div className="ai-actions">
        <button className="ghost-btn small primary" onClick={() => onSave(entry.content)}>
          Save
        </button>
        <button className="ghost-btn small" onClick={onDiscard}>
          Discard
        </button>
      </div>

      <div className="ai-refine">
        <input
          className="ai-input"
          value={instruction}
          placeholder="Refine it — e.g. mention the error handling"
          onChange={(e) => setInstruction(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') submit();
          }}
        />
        <button
          className="ghost-btn small"
          disabled={!instruction.trim()}
          onClick={submit}
        >
          Revise
        </button>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Voice                                                                      */
/* -------------------------------------------------------------------------- */

/**
 * All recordings for one symbol, newest first. Selecting a row expands its
 * player inline rather than replacing the list, so the other recordings stay
 * visible and switching between them is one click.
 */
function VoiceList({ entries }) {
  const [selectedId, setSelectedId] = useState(entries[0]?.id ?? null);

  // A recording added while the panel is open should be the one on screen.
  useEffect(() => {
    if (!entries.some((e) => e.id === selectedId)) {
      setSelectedId(entries[entries.length - 1]?.id ?? null);
    }
  }, [entries, selectedId]);

  const ordered = useMemo(
    () => [...entries].sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1)),
    [entries]
  );

  return (
    <div className="voice-list">
      {ordered.map((entry) => (
        <VoiceRow
          key={entry.id}
          entry={entry}
          expanded={entry.id === selectedId}
          onSelect={() => setSelectedId(entry.id === selectedId ? null : entry.id)}
        />
      ))}
    </div>
  );
}

function VoiceRow({ entry, expanded, onSelect }) {
  const audioRef = useRef(null);
  const [audioUrl, setAudioUrl] = useState(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [loadError, setLoadError] = useState(false);

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

  // Collapsing stops playback: audio continuing from a row you can no longer
  // see has no visible pause control.
  useEffect(() => {
    if (!expanded && audioRef.current) {
      audioRef.current.pause();
      setIsPlaying(false);
    }
  }, [expanded]);

  useEffect(() => {
    if (audioUrl && audioRef.current) {
      audioRef.current.play().catch(() => setLoadError(true));
      setIsPlaying(true);
    }
  }, [audioUrl]);

  const togglePlay = useCallback(
    (event) => {
      event.stopPropagation();
      if (!audioUrl) {
        // The extension holds the real path; the webview only ever gets a URL.
        vscode.postMessage({ type: 'requestAudio', entryId: entry.id });
        return;
      }
      const audio = audioRef.current;
      if (!audio) return;
      if (audio.paused) {
        audio.play().catch(() => setLoadError(true));
        setIsPlaying(true);
      } else {
        audio.pause();
        setIsPlaying(false);
      }
    },
    [audioUrl, entry.id]
  );

  const duration =
    (audioRef.current && Number.isFinite(audioRef.current.duration)
      ? audioRef.current.duration
      : 0) ||
    entry.durationSeconds ||
    0;

  const progress = duration ? currentTime / duration : 0;

  const seek = useCallback(
    (fraction) => {
      const audio = audioRef.current;
      if (!audio || !duration) return;
      audio.currentTime = fraction * duration;
      setCurrentTime(audio.currentTime);
    },
    [duration]
  );

  return (
    <div className={'voice-row' + (expanded ? ' expanded' : '')}>
      <button className="voice-row-head" onClick={onSelect}>
        <span
          className={'voice-play' + (isPlaying ? ' playing' : '')}
          onClick={togglePlay}
          role="button"
          tabIndex={0}
          aria-label={isPlaying ? 'Pause' : 'Play'}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') togglePlay(e);
          }}
        >
          {isPlaying ? '❙❙' : '▶'}
        </span>

        <span className="voice-row-meta">
          <span className="voice-author">{entry.author}</span>
          <span className="voice-when">{formatRelative(entry.createdAt)}</span>
        </span>

        {entry.isStale && (
          <span className="stale-dot" title="Code changed since this was recorded">
            •
          </span>
        )}
        <span className="voice-duration">{formatDuration(duration)}</span>
      </button>

      {expanded && (
        <div className="voice-body">
          <Waveform seed={entry.id} progress={progress} playing={isPlaying} onSeek={seek} />

          <div className="voice-times">
            <span>{formatDuration(currentTime)}</span>
            <span>{formatDuration(duration)}</span>
          </div>

          {loadError && (
            <p className="voice-note error">
              This recording won't play. The audio file may be missing or in an
              unsupported format.
            </p>
          )}

          {entry.transcript && <p className="voice-note">{entry.transcript}</p>}

          {audioUrl && (
            <audio
              ref={audioRef}
              src={audioUrl}
              onTimeUpdate={(e) => setCurrentTime(e.currentTarget.currentTime)}
              onEnded={() => {
                setIsPlaying(false);
                setCurrentTime(0);
              }}
              onError={() => {
                setLoadError(true);
                setIsPlaying(false);
              }}
            />
          )}
        </div>
      )}
    </div>
  );
}

const BAR_COUNT = 56;

/** Doubles as the scrubber: click or drag anywhere on it to seek. Bar heights
 *  are seeded from the entry id so a given recording always looks the same,
 *  rather than reshuffling on every render. */
function Waveform({ seed, progress, playing, onSeek }) {
  const ref = useRef(null);

  const bars = useMemo(() => {
    const code = seed.charCodeAt(0) || 1;
    return Array.from({ length: BAR_COUNT }, (_, i) => {
      const value = Math.sin(i * code * 0.37) * 10000;
      return 22 + Math.abs(value % 1) * 78;
    });
  }, [seed]);

  const seekTo = useCallback(
    (clientX) => {
      const el = ref.current;
      if (!el) return;
      const { left, width } = el.getBoundingClientRect();
      onSeek(Math.min(1, Math.max(0, (clientX - left) / width)));
    },
    [onSeek]
  );

  const played = Math.round(progress * BAR_COUNT);

  return (
    <div
      className={'waveform' + (playing ? ' playing' : '')}
      ref={ref}
      onClick={(e) => seekTo(e.clientX)}
      onMouseMove={(e) => {
        if (e.buttons === 1) seekTo(e.clientX);
      }}
    >
      {bars.map((height, i) => (
        <span
          key={i}
          className={i < played ? 'played' : ''}
          style={{
            height: `${height}%`,
            // Stagger so the pulse reads as a travelling wave, not a flash.
            animationDelay: `${(i % 12) * 0.06}s`,
          }}
        />
      ))}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Text entries                                                               */
/* -------------------------------------------------------------------------- */

function EntryDetail({ entry, editRequest }) {
  return (
    <>
      <div className="entry-meta">
        <span>{entry.author}</span>
        <span className="dot">·</span>
        <span>{formatDate(entry.createdAt)}</span>
      </div>
      {entry.isStale && (
        <div className="stale-banner">
          The code has changed since this was written — it may no longer be accurate.
        </div>
      )}
      <TextEntry entry={entry} editRequest={editRequest} />
    </>
  );
}

function TextEntry({ entry, editRequest = 0 }) {
  const [isEditing, setIsEditing] = useState(false);
  const [draft, setDraft] = useState(entry.content || '');

  // Switching tabs or receiving fresh content drops any in-progress edit.
  useEffect(() => {
    setDraft(entry.content || '');
    setIsEditing(false);
  }, [entry.id, entry.content]);

  // "+ Written" was clicked. A counter rather than a boolean, so clicking it
  // again after cancelling still reopens the editor.
  useEffect(() => {
    if (editRequest > 0) setIsEditing(true);
  }, [editRequest]);

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
      {/* Source docs live in the code file — editing here would have to write
          back into it. Without this guard, saving would overwrite the WRITTEN
          doc with the comment text. */}
      {entry.type !== 'source' && (
        <button className="ghost-btn small" onClick={() => setIsEditing(true)}>
          Edit
        </button>
      )}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* States                                                                     */
/* -------------------------------------------------------------------------- */

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
      <p>
        No documentation yet for <strong>{symbolName}</strong>.
      </p>
      <p className="muted">Use the buttons below to write, generate, or record one.</p>
    </div>
  );
}

function Footer({ onAddWritten, onAddAi }) {
  return (
    <footer id="footer">
      <button className="ghost-btn" onClick={onAddWritten}>
        + Written
      </button>
      <button className="ghost-btn" onClick={onAddAi}>
        + AI docs
      </button>
      <button className="ghost-btn" onClick={() => vscode.postMessage({ type: 'reRecordVoice' })}>
        + Voice
      </button>
    </footer>
  );
}

/* -------------------------------------------------------------------------- */
/* Formatting                                                                 */
/* -------------------------------------------------------------------------- */

function formatDuration(seconds) {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60)
    .toString()
    .padStart(2, '0');
  return `${m}:${s}`;
}

function formatDate(iso) {
  try {
    return new Date(iso).toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  } catch {
    return iso;
  }
}

/** "2 days ago" reads faster than a date when scanning a list of recordings. */
function formatRelative(iso) {
  try {
    const then = new Date(iso).getTime();
    const days = Math.floor((Date.now() - then) / 86400000);
    if (days === 0) return 'Today';
    if (days === 1) return 'Yesterday';
    if (days < 7) return `${days} days ago`;
    return formatDate(iso);
  } catch {
    return iso;
  }
}