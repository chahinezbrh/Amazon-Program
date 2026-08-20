const esbuild = require('esbuild');

esbuild.buildSync({
  entryPoints: ['webview/functionHoverPopup/index.jsx'],
  bundle: true,
  outfile: 'dist/webview/functionHoverPopup.js',
  loader: { '.jsx': 'jsx', '.css': 'css' },
  jsx: 'automatic',
});

esbuild.buildSync({
  entryPoints: ['webview/docPanel/index.jsx'],
  bundle: true,
  outfile: 'dist/webview/docPanel/docPanel.js',
  loader: { '.jsx': 'jsx' },
  jsx: 'automatic',
});

esbuild.buildSync({
  entryPoints: ['webview/docPanel/docPanel.css'],
  outfile: 'dist/webview/docPanel/docPanel.css',
});

// ── Sidebar ──────────────────────────────────────────────
esbuild.buildSync({
  entryPoints: ['webview/sideBar/index.jsx'],
  bundle: true,
  outfile: 'dist/webview/sideBar/sideBar.js',
  loader: { '.jsx': 'jsx', '.css': 'css' },
  jsx: 'automatic',
});

esbuild.buildSync({
  entryPoints: ['webview/sideBar/sideBar.css'],
  outfile: 'dist/webview/sideBar/sideBar.css',
});

esbuild.buildSync({
  entryPoints: ['webview/playMemory/index.jsx'],
  bundle: true,
  outfile: 'dist/webview/playMemory/playMemory.js',
  loader: { '.jsx': 'jsx' },
  jsx: 'automatic',
});

esbuild.buildSync({
  entryPoints: ['webview/playMemory/playMemory.css'],
  outfile: 'dist/webview/playMemory/playMemory.css',
});

// ── Modification Notification / Notification Center ──────
esbuild.buildSync({
  entryPoints: ['webview/modificationNotif/index.jsx'],
  bundle: true,
  outfile: 'dist/webview/modificationNotif/modificationNotif.js',
  loader: { '.jsx': 'jsx', '.css': 'css' },
  jsx: 'automatic',
});

esbuild.buildSync({
  entryPoints: ['webview/modificationNotif/modificationNotif.css'],
  outfile: 'dist/webview/modificationNotif/modificationNotif.css',
});

console.log('Webview bundle built.');

