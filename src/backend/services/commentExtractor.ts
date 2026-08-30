// src/backend/services/commentExtractor.ts
//
// Pulls the documentation comment sitting directly above a function.
//
// Text-scanning rather than AST parsing: it works on any C-style language
// without a per-language parser, and the symbol's exact start line already
// comes from VS Code's language server, so there is nothing to guess about
// where the function begins.
//
// No vscode import — pure string work, unit-testable with a fixture.

export interface ExtractedComment {
  /** Comment body, markers stripped, as lines. */
  content: string[];
  /** 0-indexed line where the comment block starts. */
  startLine: number;
  /** True for /** ... *\/ JSDoc blocks, false for // or # runs. Lets the UI
   *  distinguish a deliberate doc block from an incidental note. */
  isDocBlock: boolean;
}

/**
 * Reads upward from `functionStartLine` looking for a comment block.
 *
 * Returns null when the line above is code, or blank-then-code — a comment two
 * blank lines up usually belongs to whatever came before it, not to this
 * function.
 */
export function extractCommentAbove(
  lines: string[],
  functionStartLine: number
): ExtractedComment | null {
  let cursor = functionStartLine - 1;

  // Decorators (@Injectable, @Component) and export modifiers can sit between
  // the comment and the declaration. Skip at most one blank line: more than
  // that and the comment is detached.
  let blanksSkipped = 0;
  while (cursor >= 0) {
    const text = (lines[cursor] ?? '').trim();
    if (text === '') {
      if (++blanksSkipped > 1) return null;
      cursor--;
      continue;
    }
    if (text.startsWith('@')) {
      cursor--;
      continue;
    }
    break;
  }

  if (cursor < 0) return null;
  const line = (lines[cursor] ?? '').trim();

  // Block comment: walk up from the closing marker to its opener.
  if (line.endsWith('*/')) {
    const endLine = cursor;
    while (cursor >= 0) {
      const text = (lines[cursor] ?? '').trim();
      if (text.startsWith('/*')) break;
      cursor--;
    }
    if (cursor < 0) return null;

    const isDocBlock = (lines[cursor] ?? '').trim().startsWith('/**');
    const content = cleanBlock(lines.slice(cursor, endLine + 1));
    return content.length ? { content, startLine: cursor, isDocBlock } : null;
  }

  // A run of consecutive line comments.
  const marker = line.startsWith('///')
    ? '///'
    : line.startsWith('//')
      ? '//'
      : line.startsWith('#')
        ? '#'
        : null;
  if (!marker) return null;

  const endLine = cursor;
  while (cursor >= 0 && (lines[cursor] ?? '').trim().startsWith(marker)) {
    cursor--;
  }

  const content = cleanBlock(lines.slice(cursor + 1, endLine + 1));
  return content.length
    ? { content, startLine: cursor + 1, isDocBlock: marker === '///' }
    : null;
}


/** Strips comment markers and the leading `*` gutter so the content renders as
 *  prose rather than a wall of asterisks. */
function cleanBlock(raw: string[]): string[] {
  const cleaned = raw.map((line) =>
    line
      .trim()
      .replace(/^\/\*\*?/, '')
      .replace(/\*\/\s*$/, '')
      .replace(/^\*\s?/, '')
      .replace(/^\/\/\/?\s?/, '')
      .replace(/^#\s?/, '')
      .trimEnd()
  );

  while (cleaned.length && (cleaned[0] ?? '').trim() === '') cleaned.shift();
  while (cleaned.length && (cleaned[cleaned.length - 1] ?? '').trim() === '') {
    cleaned.pop();
  }

  // A block of only markers (a `// ----` separator, say) is not documentation.
  return cleaned.some((l) => /[A-Za-z0-9]/.test(l)) ? cleaned : [];
}

/**
 * Reads a docstring from INSIDE the function — Python's convention, where the
 * documentation is the first statement of the body rather than a comment above
 * the declaration.
 *
 * Returns null when the first statement is code, which is also the normal
 * result for C-style languages.
 */
export function extractDocstringInside(
  lines: string[],
  startLine: number,
  endLine: number
): ExtractedComment | null {
  for (let i = startLine + 1; i <= endLine; i++) {
    const text = (lines[i] ?? '').trim();
    if (text === '') continue;

    const quote = text.startsWith('"""') ? '"""' : text.startsWith("'''") ? "'''" : null;
    if (!quote) return null;

    // Single line: """Does the thing."""
    const rest = text.slice(3);
    if (rest.endsWith(quote) && rest.length >= 3) {
      const body = rest.slice(0, -3).trim();
      return body ? { content: [body], startLine: i, isDocBlock: true } : null;
    }

    // Multi-line: collect until the closing delimiter.
    const collected = rest ? [rest] : [];
    for (let j = i + 1; j <= endLine; j++) {
      const line = lines[j] ?? '';
      if (line.trim().endsWith(quote)) {
        const tail = line.trim().slice(0, -3);
        if (tail) collected.push(tail);
        return collected.length
          ? { content: trimBlank(collected), startLine: i, isDocBlock: true }
          : null;
      }
      collected.push(line.trim());
    }
    return null; // unterminated
  }
  return null;
}

function trimBlank(lines: string[]): string[] {
  const out = [...lines];
  while (out.length && (out[0] ?? '').trim() === '') out.shift();
  while (out.length && (out[out.length - 1] ?? '').trim() === '') out.pop();
  return out;
}