// src/backend/services/parseText.ts
//
// Parses source text that isn't on disk — file contents fetched from GitHub
// after a push, where both the before and after versions need parsing but
// neither exists in the workspace.

import type { ParsedFunction } from '../../shared/functionRecordsFile';
import { parseSource } from './wasmParser';

export async function parseTextForLanguage(
  text: string,
  relativeFilePath: string,
  language: string
): Promise<ParsedFunction[]> {
  // No temp file needed: the parser takes text directly, so a webhook's
  // before/after contents parse exactly as a workspace file would.
  return parseSource(text, relativeFilePath, language);
}