import React, { useState, useEffect, useMemo } from 'react';
import './modificationNotif.css';

const vscode = acquireVsCodeApi();

export default function ModificationNotif() {
  const [notifications, setNotifications] = useState([]);
  const [resolvedNotifications, setResolvedNotifications] = useState([]);

  const [activeTab, setActiveTab] = useState('modifications');
  const [reviewedNotifId, setReviewedNotifId] = useState(null);

  useEffect(() => {
    vscode.postMessage({ command: 'ready' });

    const messageHandler = (event) => {
      const msg = event.data;
      if (msg.command === 'setData') {
        if (msg.notifications) {
          setNotifications(msg.notifications);
        }
        if (msg.resolvedNotifications) {
          setResolvedNotifications(msg.resolvedNotifications);
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

  // notifications.json only ever holds unresolved items now — resolved ones
  // are physically moved to resolvedNotifications.json — so no status
  // filtering is needed here anymore, just plain lengths.
  const modificationsCount = notifications.length;
  const resolvedCount = resolvedNotifications.length;

  const filteredNotifications = useMemo(() => {
    return activeTab === 'resolved' ? resolvedNotifications : notifications;
  }, [notifications, resolvedNotifications, activeTab]);

  const selectedNotif = useMemo(() => {
    if (!reviewedNotifId) return null;
    return (
      notifications.find((n) => n.id === reviewedNotifId) ||
      resolvedNotifications.find((n) => n.id === reviewedNotifId) ||
      null
    );
  }, [notifications, resolvedNotifications, reviewedNotifId]);

  const handleReview = (notif, e) => {
    if (e) e.stopPropagation();
    setReviewedNotifId(notif.id);
    vscode.postMessage({
      command: 'reviewNotification',
      notification: notif,
    });
  };

  // Opens the documentation panel for the changed function. A notification
  // says "this changed"; the natural next question is what the docs claimed
  // about it — and any doc written against the old code shows as stale there.
  const handleSeeDocs = (notif, e) => {
    if (e) e.stopPropagation();
    vscode.postMessage({
      command: 'seeDocs',
      notification: notif,
    });
  };

  // Sends the resolve request to the extension host, which physically moves
  // the entry from notifications.json to resolvedNotifications.json. This
  // webview waits for the follow-up setData to reflect the real result.
  const handleResolve = (notif, e) => {
    if (e) e.stopPropagation();
    if (reviewedNotifId === notif.id) setReviewedNotifId(null);
    vscode.postMessage({
      command: 'resolveNotification',
      notification: notif,
    });
  };

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
              const isResolved = activeTab === 'resolved';

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
                          onClick={(e) => handleSeeDocs(notif, e)}
                        >
                          See docs
                        </button>
                        {!isResolved && (
                          <button
                            className="action-btn action-btn--resolve"
                            onClick={(e) => handleResolve(notif, e)}
                          >
                            Resolve
                          </button>
                        )}
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

          {/* Action Footer */}
          <div className="detail-footer">
            {activeTab !== 'resolved' && (
              <button
                className="detail-action-btn detail-action-btn--resolve"
                onClick={(e) => handleResolve(selectedNotif, e)}
              >
                Mark as resolved
              </button>
            )}
            <button
              className="detail-action-btn detail-action-btn--record"
              onClick={(e) => handleSeeDocs(selectedNotif, e)}
            >
              See docs
            </button>
          </div>
        </div>
      )}
    </div>
  );
}