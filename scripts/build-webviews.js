const esbuild = require('esbuild');
const fs = require('fs');
const watch = process.argv.includes('--watch');
const panels = ['docPanel', 'recordPanel'];

(async () => {
  const contexts = [];

  for (const name of panels) {
    const outdir = `out/frontend/webviews/${name}`;
    fs.mkdirSync(outdir, { recursive: true });
    fs.copyFileSync(
      `src/frontend/webviews/${name}/${name}.css`,
      `${outdir}/${name}.css`
    );

    const options = {
      entryPoints: [`src/frontend/webviews/${name}/index.jsx`],
      bundle: true,
      outfile: `${outdir}/${name}.js`,
      format: 'iife',
    };

    if (watch) {
      const ctx = await esbuild.context(options);
      await ctx.watch();
      contexts.push(ctx);
    } else {
      await esbuild.build(options);
    }
  }

  if (watch) {
    console.log('watching webviews… (ctrl-c to stop)');
    // esbuild's watch does not block, so without this the process exits
    // immediately and nothing is actually being watched.
    await new Promise(() => {});
  } else {
    console.log('webviews built');
  }
})();