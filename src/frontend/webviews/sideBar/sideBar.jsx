import { useState, useEffect } from 'react';
import './sideBar.css';

const vscode = acquireVsCodeApi();

/**
 * Status dot colour logic:
 *  - first function in the list  → teal  (selected / has memory)
 *  - functions with a memory     → yellow (has memory, not selected)
 *  - functions without a memory  → red   (no memory yet)
 *
 * The extension sends:
 *   { command: 'setData', fileName: string, functions: FunctionItem[] }
 *
 * FunctionItem: { name: string, hasMemory: boolean, isSelected: boolean }
 */

export default function SideBar() {
  const [fileName, setFileName] = useState('');
  const [functions, setFunctions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [recording, setRecording] = useState(false);

  useEffect(() => {
    const handler = (event) => {
      const msg = event.data;
      if (msg.command === 'setLoading') {
        setLoading(true);
        if (msg.fileName) setFileName(msg.fileName);
      } else if (msg.command === 'setData') {
        setLoading(false);
        setFileName(msg.fileName || '');
        setFunctions(msg.functions || []);
      }
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, []);

  const dotClass = (fn) => {
    if (fn.isSelected) return 'dot dot-teal';
    if (fn.hasMemory)  return 'dot dot-yellow';
    return 'dot dot-red';
  };

  const handleFunctionClick = (fn) => {
    vscode.postMessage({ command: 'selectFunction', functionName: fn.name });
    setFunctions((prev) =>
      prev.map((f) => ({ ...f, isSelected: f.name === fn.name }))
    );
  };

  const handleRecord = () => {
    setRecording(true);
    vscode.postMessage({ command: 'recordMemory' });
    setTimeout(() => setRecording(false), 2000);
  };

  const hasFile = Boolean(fileName);

  return (
    <div className="sidebar-root">
      {/* ── Header ── */}
      <div className="sidebar-header">
        <span className="header-label">
          {hasFile ? `MEMORIES — ${fileName.toUpperCase()}` : 'MEMORIES — THIS FILE'}
        </span>
      </div>

      {/* ── Content: Empty State / Loading / Function list ── */}
      {loading ? (
        <div className="sidebar-empty-state">
          <div className="loading-spinner" />
          <div className="empty-subtitle">Fetching functions from backend…</div>
        </div>
      ) : !hasFile ? (
        <div className="sidebar-empty-state">
          <div className="empty-icon-wrapper">
            <svg className="head-gear-icon" viewBox="0 0 24 24" width="36" height="36" fill="currentColor">
              <path d="M12 2C7.03 2 3 6.03 3 11c0 2.48 1.01 4.73 2.65 6.35L5 22h8l2-2h1.5c3.59 0 6.5-2.91 6.5-6.5C23 6.94 18.06 2 12 2zm0 4.5c.34 0 .66.04.97.11l.33.86 1.05.43.78-.53c.47.28.88.65 1.2 1.09l-.49.81.4 1.07.91.24c.07.27.1.55.1.85 0 .3-.03.58-.1.85l-.91.24-.4 1.07.49.81c-.32.44-.73.81-1.2 1.09l-.78-.53-1.05.43-.33.86c-.31.07-.63.11-.97.11s-.66-.04-.97-.11l-.33-.86-1.05-.43-.78.53c-.47-.28-.88-.65-1.2-1.09l.49-.81-.4-1.07-.91-.24c-.07-.27-.1-.55-.1-.85 0-.3.03-.58.1-.85l.91-.24.4-1.07-.49-.81c.32-.44.73-.81 1.2-1.09l.78.53 1.05-.43.33-.86c.31-.07.63-.11.97-.11zm0 3c-1.38 0-2.5 1.12-2.5 2.5s1.12 2.5 2.5 2.5 2.5-1.12 2.5-2.5-1.12-2.5-2.5-2.5z"/>
            </svg>
          </div>
          <div className="empty-title">No file selected yet</div>
          <div className="empty-subtitle">
            Please select one to fetch the functions.
          </div>
        </div>
      ) : functions.length === 0 ? (
        <div className="sidebar-empty-state">
          <div className="empty-title">No functions found</div>
          <div className="empty-subtitle">
            No functions detected in this file.
          </div>
        </div>
      ) : (
        <ul className="fn-list">
          {functions.map((fn) => (
            <li
              key={fn.name}
              className={`fn-item ${fn.isSelected ? 'fn-item--selected' : ''}`}
              onClick={() => handleFunctionClick(fn)}
            >
              <span className={dotClass(fn)} />
              <span className="fn-name">{fn.name}</span>
            </li>
          ))}
        </ul>
      )}

      {/* ── Record button ── */}
      <div className="sidebar-footer">
        <button
          className={`record-btn ${recording ? 'record-btn--active' : ''}`}
          onClick={handleRecord}
          disabled={!hasFile}
        >
          {recording ? '● RECORDING…' : 'RECORD MEMORY'}
        </button>
      </div>
    </div>
  );
}


