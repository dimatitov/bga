/**
 * SWR-008 C-8: reads a game's rules knowledge base from disk (the only place in apps/api that touches KB files).
 * Layout: `manifest.json` (required), `entries/*.json` (required directory; every file one JSON array; files in
 * sorted name order, concatenated), `coverage.json` and `discrepancies.json` (optional). Parsing and validation of
 * the data belong to the game's `GameRulesSupport.createRulesContextProvider`.
 *
 * Errors carry the directory, the file and a FIXED reason — never file content (a `JSON.parse` message may quote
 * it) and never anything from the environment.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import type { KnowledgeBaseSource } from '@bga/platform';

/** Reads the knowledge base in an absolute directory. Injectable for tests (TR-1: broken KB, load counter). */
export type KnowledgeBaseLoader = (absoluteDir: string) => KnowledgeBaseSource;

export type KnowledgeBaseLoadReason =
  | 'directory not found'
  | 'not a directory'
  | 'file not found'
  | 'not a file'
  | 'not readable'
  | 'invalid JSON'
  | 'must contain a JSON array';

/** The knowledge base files could not be read. Message: `rules knowledge base <dir>: <file>: <reason>`. */
export class KnowledgeBaseLoadError extends Error {
  readonly file: string;
  readonly reason: KnowledgeBaseLoadReason;

  constructor(dir: string, file: string, reason: KnowledgeBaseLoadReason) {
    super(`rules knowledge base ${dir}: ${file}: ${reason}`);
    this.name = 'KnowledgeBaseLoadError';
    this.file = file;
    this.reason = reason;
  }
}

const MANIFEST = 'manifest.json';
const ENTRIES_DIR = 'entries';
const COVERAGE = 'coverage.json';
const DISCREPANCIES = 'discrepancies.json';

function isMissing(error: unknown): boolean {
  return (error as NodeJS.ErrnoException | null)?.code === 'ENOENT';
}

/** `null` when the path does not exist; otherwise its kind. */
function kindOf(dir: string, file: string): 'file' | 'directory' | 'other' | null {
  try {
    const stat = statSync(join(dir, file));
    return stat.isFile() ? 'file' : stat.isDirectory() ? 'directory' : 'other';
  } catch (error) {
    if (isMissing(error)) return null;
    throw new KnowledgeBaseLoadError(dir, file, 'not readable');
  }
}

/** Reads and parses one JSON file (`file` is relative to `dir`, POSIX separators). */
function readJson(dir: string, file: string): unknown {
  let text: string;
  try {
    text = readFileSync(join(dir, file), 'utf8');
  } catch (error) {
    throw new KnowledgeBaseLoadError(
      dir,
      file,
      isMissing(error) ? 'file not found' : 'not readable',
    );
  }
  try {
    return JSON.parse(text) as unknown;
  } catch {
    // The SyntaxError message may quote the file content: never pass it on.
    throw new KnowledgeBaseLoadError(dir, file, 'invalid JSON');
  }
}

function readRequired(dir: string, file: string): unknown {
  const kind = kindOf(dir, file);
  if (kind === null) throw new KnowledgeBaseLoadError(dir, file, 'file not found');
  if (kind !== 'file') throw new KnowledgeBaseLoadError(dir, file, 'not a file');
  return readJson(dir, file);
}

function readOptional(dir: string, file: string): unknown {
  const kind = kindOf(dir, file);
  if (kind === null) return undefined;
  if (kind !== 'file') throw new KnowledgeBaseLoadError(dir, file, 'not a file');
  return readJson(dir, file);
}

/** Code-unit order (locale independent), like the KB tooling of the games. */
function byName(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

function readEntries(dir: string): unknown[] {
  const kind = kindOf(dir, ENTRIES_DIR);
  if (kind === null)
    throw new KnowledgeBaseLoadError(dir, `${ENTRIES_DIR}/`, 'directory not found');
  if (kind !== 'directory')
    throw new KnowledgeBaseLoadError(dir, `${ENTRIES_DIR}/`, 'not a directory');
  let names: string[];
  try {
    names = readdirSync(join(dir, ENTRIES_DIR));
  } catch {
    throw new KnowledgeBaseLoadError(dir, `${ENTRIES_DIR}/`, 'not readable');
  }
  const files = names.filter((name) => name.endsWith('.json')).sort(byName);
  return files.flatMap((name) => {
    const file = `${ENTRIES_DIR}/${name}`;
    const raw = readRequired(dir, file);
    if (!Array.isArray(raw))
      throw new KnowledgeBaseLoadError(dir, file, 'must contain a JSON array');
    return raw as unknown[];
  });
}

/** `node:fs` loader of `GameRulesSupport.knowledgeBaseDir` (the default of the rules context registry). */
export const readKnowledgeBaseDir: KnowledgeBaseLoader = (absoluteDir) => {
  const kind = kindOf(absoluteDir, '.');
  if (kind === null) throw new KnowledgeBaseLoadError(absoluteDir, '.', 'directory not found');
  if (kind !== 'directory') throw new KnowledgeBaseLoadError(absoluteDir, '.', 'not a directory');

  const source: KnowledgeBaseSource = {
    manifest: readRequired(absoluteDir, MANIFEST),
    entries: readEntries(absoluteDir),
  };
  const coverage = readOptional(absoluteDir, COVERAGE);
  if (coverage !== undefined) source.coverage = coverage;
  const discrepancies = readOptional(absoluteDir, DISCREPANCIES);
  if (discrepancies !== undefined) source.discrepancies = discrepancies;
  return source;
};
