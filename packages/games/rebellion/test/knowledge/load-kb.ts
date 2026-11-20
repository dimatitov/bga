/**
 * SWR-005C W2 — loads the Rebellion rules knowledge base from `packages/games/rebellion/knowledge` (plan-backend §3, BD-3).
 * JSON is read with node:fs (never imported), every `entries/*.json` file is checked on its own first so that a broken
 * entry is reported with its file name, then everything goes through `parseKnowledgeBase`.
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';
import {
  KbEntrySchema,
  parseKnowledgeBase,
  type KnowledgeBase,
  type KnowledgeBaseIo,
} from '@bga/platform/rules-kb';

/** Repository root (this file: packages/games/rebellion/test/knowledge/load-kb.ts). */
export const REPO_ROOT = fileURLToPath(new URL('../../../../../', import.meta.url));
export const KB_DIR = 'packages/games/rebellion/knowledge';
export const DOCS_DIR = 'docs/game-rules/rebellion';

export function repoPath(relative: string): string {
  return `${REPO_ROOT}${relative}`;
}

function readJson(relative: string): unknown {
  return JSON.parse(readFileSync(repoPath(relative), 'utf8')) as unknown;
}

/** `entries/*.json` in sorted order, each validated as an array of entries (error names the file). */
export function loadRawEntries(): unknown[] {
  const files = readdirSync(repoPath(`${KB_DIR}/entries`))
    .filter((name) => name.endsWith('.json'))
    .sort();
  return files.flatMap((name) => {
    const raw = readJson(`${KB_DIR}/entries/${name}`);
    const result = z.array(KbEntrySchema).safeParse(raw);
    if (!result.success) {
      throw new Error(`${KB_DIR}/entries/${name}: ${z.prettifyError(result.error)}`);
    }
    return raw as unknown[];
  });
}

export interface RawKnowledgeBase {
  manifest: unknown;
  entries: unknown[];
  coverage: unknown;
  discrepancies: unknown;
}

export function loadRawKnowledgeBase(): RawKnowledgeBase {
  return {
    manifest: readJson(`${KB_DIR}/manifest.json`),
    entries: loadRawEntries(),
    coverage: readJson(`${KB_DIR}/coverage.json`),
    discrepancies: readJson(`${KB_DIR}/discrepancies.json`),
  };
}

export function loadKnowledgeBase(): KnowledgeBase {
  return parseKnowledgeBase(loadRawKnowledgeBase());
}

export function readAuditSummary(): string {
  return readFileSync(repoPath(`${KB_DIR}/audit-summary.md`), 'utf8');
}

/** Real file system, paths relative to the repository root (Q-BE-5). */
export const nodeIo: KnowledgeBaseIo = {
  fileExists: (path) => existsSync(repoPath(path)),
  readText: (path) => readFileSync(repoPath(path), 'utf8'),
};
