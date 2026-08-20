import React, { useState, useEffect, useMemo } from 'react';
import './modificationNotif.css';

const vscode = acquireVsCodeApi();

export default function ModificationNotif() {
  const [notifications, setNotifications] = useState([
    {
      id: 'notif-1',
      type: 'critical',
      title: 'processPayment() — logic changed under memory',
      functionName: 'processPayment()',
      filePath: 'src/payments/stripe.js',
      lineRange: 'line 42-67',
      startLine: 42,
      endLine: 67,
      description: "The retry backoff interval was modified. Karim's memory no longer matches.",
      timestamp: '2 hours ago',
      affectedAuthor: "Karim's memory affected",
      status: 'critical',
      changeType: 'Logic changed',
      diffLines: [
        { type: 'del', text: '- retryAfter = 2000; // fixed' },
        { type: 'del', text: '- attempts = 3;' },
        { type: 'add', text: '+ retryAfter = base * 2 ** n;' },
        { type: 'add', text: '+ attempts = 5; // exponential' },
      ],
      originalMemory: {
        quote: '“Never remove the idempotency key — Stripe will double charge on retry.”',
        duration: '0:38',
        author: 'Karim Haddad',
        authorInfo: 'left team 3mo ago',
      },
      suggestedFollowUp: 'Does the idempotency key still apply with the new exponential backoff?',
    },
    {
      id: 'notif-2',
      type: 'critical',
      title: 'verifyToken() — function signature changed',
      functionName: 'verifyToken()',
      filePath: 'src/auth/middleware.js',
      lineRange: 'line 12-18',
      startLine: 12,
      endLine: 18,
      description: 'A new parameter was added. The recorded explanation may be incomplete.',
      timestamp: '6 hours ago',
      affectedAuthor: "Sara's memory affected",
      status: 'critical',
      changeType: 'Function signature changed',
      diffLines: [
        { type: 'del', text: '- export function verifyToken(token: string) {' },
        { type: 'add', text: '+ export function verifyToken(token: string, options?: VerifyOptions) {' },
        { type: 'add', text: '+   if (options?.strict) validateIssuer(token);' },
      ],
      originalMemory: {
        quote: '“The token verification must always check expiry and signature before reading claims.”',
        duration: '0:45',
        author: 'Sara Chen',
        authorInfo: 'active contributor',
      },
      suggestedFollowUp: 'Are all callers passing the new options argument properly?',
    },
    {
      id: 'notif-3',
      type: 'modification',
      title: 'authenticateUser() — error handler updated',
      functionName: 'authenticateUser()',
      filePath: 'src/auth/middleware.js',
      lineRange: 'line 20-35',
      startLine: 20,
      endLine: 35,
      description: 'Custom error codes were added to authentication rejection.',
      timestamp: '1 day ago',
      affectedAuthor: "Alex's memory affected",
      status: 'resolved',
      changeType: 'Error handler updated',
      diffLines: [
        { type: 'del', text: '- throw new Error("Auth failed");' },
        { type: 'add', text: '+ throw new AuthError("INVALID_TOKEN", 401);' },
      ],
      originalMemory: {
        quote: '“Ensure all authentication failures return a standard 401 response.”',
        duration: '0:22',
        author: 'Alex Rivera',
        authorInfo: 'team lead',
      },
      suggestedFollowUp: 'Are client applications handling the structured AuthError response?',
    },
  ]);

  const [activeTab, setActiveTab] = useState('modifications');
  const [reviewedNotifId, setReviewedNotifId] = useState(null);
  const [isPlayingAudio, setIsPlayingAudio] = useState(false);

  useEffect(() => {
    vscode.postMessage({ command: 'ready' });

    const messageHandler = (event) => {
      const msg = event.data;
      if (msg.command === 'setData') {
        if (msg.notifications) {
          setNotifications(msg.notifications);
        }
        if (msg.activeFilter) {
          if (msg.activeFilter === 'resolved') setActiveTab('resolved');
          else setActiveTab('modifications');
        }
      }
    };

    window.addEventListener('message', messageHandler);
    return () => window.removeEventListener('message', messageHandler);
  }, []);

  const modificationsCount = useMemo(
    () => notifications.filter((n) => n.status !== 'resolved').length,
    [notifications]
  );
  const resolvedCount = useMemo(
    () => notifications.filter((n) => n.status === 'resolved').length,
    [notifications]
  );

  const filteredNotifications = useMemo(() => {
    switch (activeTab) {
      case 'resolved':
        return notifications.filter((n) => n.status === 'resolved');
      case 'modifications':
      default:
        return notifications.filter((n) => n.status !== 'resolved');
    }
  }, [notifications, activeTab]);

  const selectedNotif = useMemo(() => {
    if (!reviewedNotifId) return null;
    return notifications.find((n) => n.id === reviewedNotifId) || null;
  }, [notifications, reviewedNotifId]);

  const handleReview = (notif, e) => {
    if (e) e.stopPropagation();
    setReviewedNotifId(notif.id);
    vscode.postMessage({
      command: 'reviewNotification',
      notification: notif,
    });
  };

  const handleRecordNew = (notif, e) => {
    if (e) e.stopPropagation();
    vscode.postMessage({
      command: 'recordNewMemory',
      notification: notif,
    });
  };

  const handleMarkReviewed = (id) => {
    vscode.postMessage({
      command: 'markReviewed',
      id,
    });
  };

  const toggleAudio = () => {
    setIsPlayingAudio((prev) => !prev);
  };

  // Generate soundwave bar heights
  const waveformBars = [
    30, 50, 75, 40, 90, 60, 80, 100, 70, 45, 85, 95, 65, 40, 70, 90, 100, 80,
    55, 35, 75, 85, 60, 45, 65, 80, 50, 30,
  ];

  return (
    <div className="notif-center-layout">
      {/* ── Left Pane: Notifications List ── */}
      <div className="notif-center-main">
        {/* Header */}
        <div className="notif-header">
          <h1 className="notif-title">NOTIFICATION CENTER</h1>
          <p className="notif-subtitle">
            Alerts about code changes affecting recorded memories
          </p>
        </div>

        {/* Filter Tabs */}
        <div className="notif-tabs">
          <button
            className={`tab-btn ${activeTab === 'modifications' ? 'tab-btn--active' : ''}`}
            onClick={() => setActiveTab('modifications')}
          >
            Modifications ({modificationsCount})
          </button>
          <button
            className={`tab-btn ${activeTab === 'resolved' ? 'tab-btn--active' : ''}`}
            onClick={() => setActiveTab('resolved')}
          >
            Resolved {resolvedCount}
          </button>
        </div>

        {/* Notification Cards */}
        <div className="notif-list">
          {filteredNotifications.length === 0 ? (
            <div className="empty-state">
              <div className="empty-icon">✓</div>
              <div className="empty-title">No notifications</div>
              <div className="empty-desc">
                All memory-linked code changes have been addressed.
              </div>
            </div>
          ) : (
            filteredNotifications.map((notif) => {
              const isCritical = notif.type === 'critical' || notif.status === 'critical';
              const isSelected = selectedNotif?.id === notif.id;

              return (
                <div
                  key={notif.id}
                  className={`notif-card ${
                    isCritical ? 'notif-card--critical' : 'notif-card--normal'
                  } ${isSelected ? 'notif-card--selected' : ''}`}
                  onClick={(e) => handleReview(notif, e)}
                >
                  {/* Left icon badge */}
                  <div className="notif-badge">
                    <div
                      className={`badge-icon ${
                        isCritical ? 'badge-icon--critical' : ''
                      }`}
                    >
                      !
                    </div>
                  </div>

                  {/* Card body */}
                  <div className="notif-content">
                    <div className="card-top-row">
                      <div className="card-heading">{notif.title}</div>
                      {isCritical && (
                        <span className="critical-tag">CRITICAL</span>
                      )}
                    </div>

                    <div
                      className="card-location"
                      onClick={(e) => handleReview(notif, e)}
                      title="Click to jump to file"
                    >
                      <span className="file-name">{notif.filePath}</span>
                      <span className="dot-divider">·</span>
                      <span className="line-range">{notif.lineRange}</span>
                    </div>

                    <div className="card-description">{notif.description}</div>

                    <div className="card-footer">
                      <div className="footer-meta">
                        <span className="time-ago">{notif.timestamp}</span>
                        <span className="affected-memory">
                          <span className="teal-dot" />
                          <span>{notif.affectedAuthor}</span>
                        </span>
                      </div>

                      <div className="footer-actions">
                        <button
                          className="action-btn action-btn--review"
                          onClick={(e) => handleReview(notif, e)}
                        >
                          Review
                        </button>
                        <button
                          className="action-btn action-btn--record"
                          onClick={(e) => handleRecordNew(notif, e)}
                        >
                          Record new
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* ── Right Pane: Tracking "What Changed" Details (Only on Review) ── */}
      {selectedNotif && (
        <div className="notif-detail-pane">
          {/* Header */}
          <div className="detail-header-section">
            <div className="detail-header-top">
              <div className="detail-section-label">ALERT DETAILS</div>
              <button
                className="detail-close-btn"
                onClick={() => setReviewedNotifId(null)}
                title="Close review pane"
              >
                ✕
              </button>
            </div>
            <h2 className="detail-fn-name">{selectedNotif.functionName}</h2>
            <div className="detail-file-path">{selectedNotif.filePath}</div>

            <div className="detail-status-pill">
              <span className="detail-status-dot" />
              <span>{selectedNotif.changeType || 'Logic changed'}</span>
            </div>
          </div>

          {/* WHAT CHANGED — Diff section */}
          <div className="detail-block">
            <div className="detail-block-title">WHAT CHANGED</div>
            <div className="diff-code-box">
              {selectedNotif.diffLines && selectedNotif.diffLines.length > 0 ? (
                selectedNotif.diffLines.map((line, idx) => (
                  <div
                    key={idx}
                    className={`diff-line diff-line--${line.type}`}
                  >
                    {line.text}
                  </div>
                ))
              ) : (
                <div className="diff-fallback">
                  <div className="diff-line diff-line--del">
                    - previous implementation
                  </div>
                  <div className="diff-line diff-line--add">
                    + updated code logic
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* ORIGINAL MEMORY */}
          {selectedNotif.originalMemory && (
            <div className="detail-block">
              <div className="original-memory-card">
                <div className="orig-memory-label">ORIGINAL MEMORY</div>
                <div className="orig-memory-quote">
                  {selectedNotif.originalMemory.quote}
                </div>

                {/* Sound wave player */}
                <div className="audio-player-row">
                  <div className="soundwave-container">
                    {waveformBars.map((height, i) => (
                      <div
                        key={i}
                        className={`wave-bar ${isPlayingAudio ? 'wave-bar--animated' : ''}`}
                        style={{
                          height: `${height}%`,
                          animationDelay: `${(i % 5) * 0.15}s`,
                        }}
                      />
                    ))}
                  </div>
                  <button
                    className={`audio-play-btn ${isPlayingAudio ? 'audio-play-btn--playing' : ''}`}
                    onClick={toggleAudio}
                  >
                    {isPlayingAudio ? '❚❚' : '▶'} {selectedNotif.originalMemory.duration}
                  </button>
                </div>

                <div className="orig-memory-author">
                  {selectedNotif.originalMemory.author} ·{' '}
                  {selectedNotif.originalMemory.authorInfo}
                </div>
              </div>
            </div>
          )}

          {/* Action Footer */}
          <div className="detail-footer">
            <button
              className="detail-action-btn detail-action-btn--record"
              onClick={(e) => handleRecordNew(selectedNotif, e)}
            >
              Record new memory
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
