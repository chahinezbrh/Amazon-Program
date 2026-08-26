// src/shared/hash.ts
//
// Used on both the write path (stamping codeHash when a doc is saved) and the
// read path (deciding whether a doc has gone stale). These MUST be the same
// implementation — two slightly different normalisations would make every doc
// report as stale forever.

import { createHash } from 'crypto';

/** Defines what "the code changed" means.
 *
 *  Currently: trailing whitespace and blank lines don't count. Comments and
 *  indentation DO count — reindenting a function will flag its docs as stale.
 *  That is a deliberate starting point, not an oversight: loosen it only after
 *  seeing which false positives actually annoy you. */
export function normalizeSource(text: string): string {
  return text
    .split('\n')
    .map((line) => line.replace(/\s+$/, ''))
    .filter((line) => line.trim() !== '')
    .join('\n');
}

export function hashSource(text: string): string {
  return createHash('sha256').update(normalizeSource(text)).digest('hex').slice(0, 16);
}