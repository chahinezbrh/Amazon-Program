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
  const [fileName, setFileName] = useState('middleware.js');
  const [functions, setFunctions] = useState([
    { name: 'authenticateUser', hasMemory: true,  isSelected: true  },
    { name: 'verifyToken',      hasMemory: true,  isSelected: false },
    { name: 'refreshSession',   hasMemory: false, isSelected: false },
    { name: 'revokeToken',      hasMemory: false, isSelected: false },
  ]);
  const [recording, setRecording] = useState(false);

  useEffect(() => {
    const handler = (event) => {
      const msg = event.data;
      if (msg.command === 'setData') {
        if (msg.fileName)  setFileName(msg.fileName);
        if (msg.functions) setFunctions(msg.functions);
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

  return (
    <div className="sidebar-root">
      {/* ── Header ── */}
      <div className="sidebar-header">
        <span className="header-label">MEMORIES — THIS FILE</span>
      </div>

      {/* ── Function list ── */}
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

      {/* ── Record button ── */}
      <div className="sidebar-footer">
        <button
          className={`record-btn ${recording ? 'record-btn--active' : ''}`}
          onClick={handleRecord}
        >
          {recording ? '● RECORDING…' : 'RECORD MEMORY'}
        </button>
      </div>
    </div>
  );
}
