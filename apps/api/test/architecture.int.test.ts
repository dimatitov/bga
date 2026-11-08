/**
 * TC-A-01 / TC-A-02 (AC-12): the platform contracts and the API service know nothing about a game's
 * factions, rulesets or modes; the API has no OpenAI / AI client (nothing AI runs on session creation).
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { API_ROOT } from './global-setup';

const PLATFORM_SRC = join(API_ROOT, '..', '..', 'packages', 'platform', 'src');
const API_SRC = join(API_ROOT, 'src');
const GAME_TERMS = /rebels|empire|ruleset|gameMode|faction/i;

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    return statSync(full).isDirectory() ? sourceFiles(full) : full.endsWith('.ts') ? [full] : [];
  });
}

function offending(dir: string, pattern: RegExp): string[] {
  return sourceFiles(dir).flatMap((file) =>
    readFileSync(file, 'utf8')
      .split('\n')
      .flatMap((line, i) => (pattern.test(line) ? [`${file}:${i + 1}: ${line.trim()}`] : [])),
  );
}

describe('architecture boundaries (SWR-004)', () => {
  it('TC-A-01: packages/platform/src has no faction / ruleset / game-mode knowledge', () => {
    expect(sourceFiles(PLATFORM_SRC).length).toBeGreaterThan(0);
    expect(offending(PLATFORM_SRC, GAME_TERMS)).toEqual([]);
  });

  it('TC-A-01: apps/api/src (session service, repository, migrationless code) is game-agnostic', () => {
    expect(offending(API_SRC, GAME_TERMS)).toEqual([]);
  });

  it('TC-A-02: no OpenAI / AI client in apps/api/src', () => {
    expect(
      offending(API_SRC, /openai|responses\.create|chat\.completions|aiClient|AiClient/i),
    ).toEqual([]);
  });

  it('the hand-written SQL migrations contain no game knowledge', () => {
    const dir = join(API_ROOT, 'prisma', 'migrations');
    const sql = readdirSync(dir)
      .filter((d) => statSync(join(dir, d)).isDirectory())
      .map((d) => readFileSync(join(dir, d, 'migration.sql'), 'utf8'))
      .join('\n');
    expect(sql).not.toMatch(/rebels|empire|faction|ruleset|gameMode/i);
  });
});
