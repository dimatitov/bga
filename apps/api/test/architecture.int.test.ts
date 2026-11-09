/**
 * TC-A-01 / TC-A-02 (AC-12): the platform contracts and the API service know nothing about a game's
 * factions, rulesets or modes; the API has no OpenAI / AI client (nothing AI runs on session creation).
 * SWR-005B (plan-backend §2.4, §8): the openai SDK lives only in apps/api/src/ai/** (key revealed only in
 * ai/providers/openai-client.ts); process.env is read only in apps/api/src/config/env.ts.
 */
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { describe, expect, it } from 'vitest';
import { API_ROOT } from './global-setup';

const PLATFORM_SRC = join(API_ROOT, '..', '..', 'packages', 'platform', 'src');
const API_SRC = join(API_ROOT, 'src');
const GAME_TERMS = /rebels|empire|ruleset|gameMode|faction/i;
/**
 * SWR-005 W4 (AM-BE-1): the status after a command comes from `module.statusOf`; nothing outside the game
 * reads a game's result or engine. `outcome` is matched as a game-state field (`.outcome`, `outcome:`), because
 * the session service uses the plain English word for repository results (`InsertOutcome`, local `outcome`).
 * Comment lines are not code and are skipped by `offendingCode`.
 */
const GAME_RESULT_TERMS = /\b(rebels|empire|winner|rulesEngine)\b|\.outcome\b|\boutcome\??\s*:/i;

/** SWR-005B §8: an import of the openai SDK (static, side-effect, require, dynamic; any subpath). */
const IMPORTS_OPENAI =
  /from\s+['"]openai(\/[^'"]*)?['"]|require\(\s*['"]openai(\/[^'"]*)?['"]\s*\)|import\(\s*['"]openai(\/[^'"]*)?['"]\s*\)|^\s*import\s+['"]openai(\/[^'"]*)?['"]/;

function sourceFiles(dir: string): string[] {
  if (statSync(dir).isFile()) return [dir];
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    return statSync(full).isDirectory() ? sourceFiles(full) : full.endsWith('.ts') ? [full] : [];
  });
}

/**
 * SWR-005B AM-BE-1 (accepted): the dev-only diagnostics `apps/api/src/dev/**` carry the test scenario's
 * `faction: 'rebels' | 'empire'` wire field (test data, not rules) and are excluded from the game-term checks;
 * the AI core `apps/api/src/ai/**` stays under them.
 */
function outsideDev(hit: string): boolean {
  return !relative(API_SRC, hit).startsWith(`dev${sep}`);
}

function offending(dir: string, pattern: RegExp): string[] {
  return sourceFiles(dir).flatMap((file) =>
    readFileSync(file, 'utf8')
      .split('\n')
      .flatMap((line, i) => (pattern.test(line) ? [`${file}:${i + 1}: ${line.trim()}`] : [])),
  );
}

function offendingCode(dir: string, pattern: RegExp): string[] {
  const comment = /^\s*(\/\/|\/\*|\*)/;
  return sourceFiles(dir).flatMap((file) =>
    readFileSync(file, 'utf8')
      .split('\n')
      .flatMap((line, i) =>
        !comment.test(line) && pattern.test(line) ? [`${file}:${i + 1}: ${line.trim()}`] : [],
      ),
  );
}

describe('architecture boundaries (SWR-004)', () => {
  it('TC-A-01: packages/platform/src has no faction / ruleset / game-mode knowledge', () => {
    expect(sourceFiles(PLATFORM_SRC).length).toBeGreaterThan(0);
    expect(offending(PLATFORM_SRC, GAME_TERMS)).toEqual([]);
  });

  it('TC-A-01: apps/api/src (session service, repository, migrationless code) is game-agnostic', () => {
    expect(offending(API_SRC, GAME_TERMS).filter(outsideDev)).toEqual([]);
  });

  it('SWR-005 W4: packages/platform/src and apps/api/src never read a game result / engine (statusOf only)', () => {
    expect(offendingCode(PLATFORM_SRC, GAME_RESULT_TERMS)).toEqual([]);
    expect(offendingCode(API_SRC, GAME_RESULT_TERMS).filter(outsideDev)).toEqual([]);
    // Self-check of the pattern: the forms a leak would take are caught.
    for (const leak of [
      'state.outcome',
      'outcome: null',
      'outcome?: x',
      'winner',
      'rulesEngine',
      'Rebels',
    ]) {
      expect(GAME_RESULT_TERMS.test(leak)).toBe(true);
    }
    expect(GAME_RESULT_TERMS.test('const outcome = await repo.insert(x);')).toBe(false);
  });

  it('TC-A-02 (SWR-005B §8): the openai package is imported only in apps/api/src/ai/**', () => {
    const outsideAi = offendingCode(API_SRC, IMPORTS_OPENAI).filter(
      (hit) => !relative(API_SRC, hit).startsWith(`ai${sep}`),
    );
    expect(outsideAi).toEqual([]);
    // Self-check of the pattern.
    for (const form of [
      "import OpenAI from 'openai';",
      "import { APIError } from 'openai/error';",
      "const m = require('openai');",
      "const m = await import('openai');",
      "import 'openai';",
    ]) {
      expect(IMPORTS_OPENAI.test(form)).toBe(true);
    }
    expect(IMPORTS_OPENAI.test("const k = 'OPENAI_API_KEY';")).toBe(false);
  });

  it('TC-A-02 (SWR-005B §8): `new OpenAI(` and `.reveal()` only in ai/providers/openai-client.ts', () => {
    const allowed = join(API_SRC, 'ai', 'providers', 'openai-client.ts');
    const hits = offendingCode(API_SRC, /new\s+OpenAI\s*\(|\.reveal\s*\(/).filter(
      (hit) => !hit.startsWith(`${allowed}:`),
    );
    expect(hits).toEqual([]);
  });

  it('TC-A-02: no direct model calls outside apps/api/src/ai/**', () => {
    const hits = offendingCode(API_SRC, /responses\.create|chat\.completions/).filter(
      (hit) => !relative(API_SRC, hit).startsWith(`ai${sep}`),
    );
    expect(hits).toEqual([]);
  });

  it('TC-ENV-21 (SWR-005B §2.4): process.env / loadEnvFile only in apps/api/src/config/env.ts', () => {
    const envFile = join(API_SRC, 'config', 'env.ts');
    const hits = offending(API_SRC, /process\.env|process\[|loadEnvFile/).filter(
      (hit) => !hit.startsWith(`${envFile}:`),
    );
    expect(hits).toEqual([]);
    expect(offending(envFile, /process\.env/).length).toBeGreaterThan(0);
  });

  it('SWR-005B §8: packages/platform/src and packages/games/*/src never import openai', () => {
    const gamesDir = join(API_ROOT, '..', '..', 'packages', 'games');
    const gameSrcs = readdirSync(gamesDir)
      .map((g) => join(gamesDir, g, 'src'))
      .filter((d) => existsSync(d));
    expect(gameSrcs.length).toBeGreaterThan(0);
    for (const dir of [PLATFORM_SRC, ...gameSrcs]) {
      expect(offendingCode(dir, IMPORTS_OPENAI)).toEqual([]);
    }
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
