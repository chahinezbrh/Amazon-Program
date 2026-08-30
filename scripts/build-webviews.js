// scripts/build-webviews.js
//
// Bundles every webview into out/webviews/<name>/.
//
// One table rather than a call per panel: adding a webview should be one line,
// and the watch path shouldn't have to be written twice.

const esbuild = require('esbuild');

const SRC = 'src/frontend/webviews';
const OUT = 'out/webviews';

/**
 * `css` is only needed when the stylesheet's filename differs from the panel
 * name — RecordPanel.css is the one that does.
 */
const panels = [
  { name: 'docPanel' },
  { name: 'sideBar' },
  { name: 'modificationNotif' },
  { name: 'connectRepo' },
];

const watch = process.argv.includes('--watch');

function optionsFor({ name, css }) {
  return [
    {
      entryPoints: [`${SRC}/${name}/index.jsx`],
      bundle: true,
      outfile: `${OUT}/${name}/${name}.js`,
      format: 'iife',
      loader: { '.jsx': 'jsx', '.css': 'css' },
      // Automatic runtime: components that use JSX without importing React
      // still compile. Classic would fail on those files.
      jsx: 'automatic',
      logLevel: 'info',
    },
    {
      // Bundled separately so the <link> in getHtml() gets the full stylesheet,
      // independent of esbuild's implicit companion-CSS extraction from the JSX
      // bundle — which only emits rules actually imported by a component.
      entryPoints: [`${SRC}/${name}/${css ?? `${name}.css`}`],
      outfile: `${OUT}/${name}/${name}.css`,
      logLevel: 'info',
    },
  ];
}

(async () => {
  const all = panels.flatMap(optionsFor);

  if (!watch) {
    await Promise.all(all.map((options) => esbuild.build(options)));
    console.log(`Built ${panels.length} webviews.`);
    return;
  }

  for (const options of all) {
    const ctx = await esbuild.context(options);
    await ctx.watch();
  }

  console.log(`Watching ${panels.length} webviews… (ctrl-c to stop)`);
  // esbuild's watch() returns as soon as watching has STARTED — it does not
  // block. Without this the process would exit and nothing would be watched.
  await new Promise(() => {});
})().catch((err) => {
  console.error(err);
  process.exit(1);
});