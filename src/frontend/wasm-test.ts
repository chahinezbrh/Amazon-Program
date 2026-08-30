import TreeSitterParser from 'web-tree-sitter';
import path from 'path';

async function main() {
  await TreeSitterParser.init();
  const wasmPath = path.join(
    __dirname, 'node_modules', 'tree-sitter-wasms', 'out', 'tree-sitter-javascript.wasm'
  );
  const lang = await TreeSitterParser.Language.load(wasmPath);
  console.log('Loaded successfully:', lang);
}

main().catch((err) => console.error('Failed:', err));