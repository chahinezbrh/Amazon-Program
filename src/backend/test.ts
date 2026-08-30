import { getDocsForSymbol, saveDoc } from './services/docService';

const ROOT = 'C:/Users/rayha/Documents/doc-manager-playground';
const meta = {
  symbolName: 'authenticate',
  filePath: `${ROOT}/middleware.js`,
  startLine: 2,
  endLine: 14,
};

async function main() {
  const read = await getDocsForSymbol(ROOT, meta);
  console.log('READ:', read.map((e) => `${e.type} stale=${e.isStale}`));

  // New function in the same file — proves the write merges instead of replacing.
  await saveDoc(ROOT, {
    type: 'written',
    meta: { ...meta, symbolName: 'refreshToken', startLine: 20, endLine: 30 },
    codeHash: 'STUB_HASH',
    content: 'Issues a new access token.\nRejects expired refresh tokens.',
    author: 'Test',
  });

  const still = await getDocsForSymbol(ROOT, meta);
  console.log('AUTHENTICATE STILL THERE:', still.length);

  const missing = await getDocsForSymbol(ROOT, { ...meta, symbolName: 'nope' });
  console.log('MISSING:', missing);
}

main();