const esbuild = require('esbuild');

esbuild.buildSync({
  entryPoints: ['webview/functionHoverPopup/index.jsx'],
  bundle: true,
  outfile: 'dist/webview/functionHoverPopup.js',
  loader: { '.jsx': 'jsx', '.css': 'css' },
  jsx: 'automatic',
});

console.log('Webview bundle built.');