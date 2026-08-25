import * as os from 'os';
import * as path from 'path';
import { promises as fsp } from 'fs';
import { parseFile, isLanguageSupported, ParsedFunction } from '../db/parser';

export async function parseTextForLanguage(
  text: string,
  relativeFilePath: string,
  language: string
): Promise<ParsedFunction[]> {
  if (!isLanguageSupported(language)) return [];

  const tempPath = path.join(
    os.tmpdir(),
    `funcmanager-${Date.now()}-${Math.random().toString(36).slice(2)}-${path.basename(relativeFilePath)}`
  );
  await fsp.writeFile(tempPath, text, 'utf-8');
  try {
    return parseFile({ path: tempPath, language });
  } finally {
    await fsp.unlink(tempPath).catch(() => {});
  }
}