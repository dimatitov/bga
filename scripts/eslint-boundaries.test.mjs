// SWR-003 TR-7: architecture boundaries of eslint.config.mjs (plan-backend §1.8, B-1…B-17) as an automated
// test. Each probe lints an in-memory snippet as if it lived at `filePath` (the file need not exist), so the
// real config decides. Covers TC-EXT-09..12, TC-ARCH-02 and the probes of plan-backend §1.8.
import { test, describe, before } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ESLint } from 'eslint';


const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** Relative specifier from `file` to a repo path (posix). */
function rel(file, target) {
  const r = path.posix.relative(path.posix.dirname(file), target);
  return r.startsWith('.') ? r : `./${r}`;
}

const imp = (spec) => `import '${spec}';`;
const dyn = (spec) => `export const load = () => import('${spec}');`;
const COMPUTED = 'export const load = (id: string) => import(`@bga/game-${id}/definition`);';

/** [filePath, code, expected] — expected: 'error' (at least one error) or 'ok' (no errors). */
const CASES = [];
const add = (file, code, expected) => CASES.push([file, code, expected]);

// TC-EXT-09: shared code (api sessions/common, web app/shared/platform, platform package) never imports games.
for (const file of [
  'apps/api/src/sessions/probe.ts',
  'apps/api/src/common/probe.ts',
  'apps/web/src/app/probe.tsx',
  'apps/web/src/shared/probe.ts',
  'apps/web/src/platform/probe.tsx',
  'packages/platform/src/probe.ts',
]) {
  for (const spec of [
    '@bga/game-rebellion',
    '@bga/game-rebellion/definition',
    '@bga/game-rebellion/schema',
    '@bga/game-forbidden-stars/definition',
    rel(file, 'packages/games/rebellion/src/definition'),
  ]) {
    add(file, imp(spec), 'error');
  }
}
// The allowlist (AM-7) lists files, so a new file in shared stays checked even while it is non-empty.
add('apps/web/src/shared/probe.ts', imp('@bga/game-rebellion/definition'), 'error');
add('apps/web/src/platform/probe.ts', imp('@/games/rebellion/x'), 'error');
add('apps/web/src/platform/probe.ts', imp('@/features/game-setup'), 'error');
add('apps/web/src/app/probe.tsx', imp('../games/rebellion/entry'), 'error');
add('apps/web/src/platform/probe.ts', imp('@/games/registry'), 'ok');
add('apps/web/src/platform/probe.ts', imp('@bga/platform'), 'ok');
add('packages/platform/src/probe.ts', imp('zod'), 'ok');
add('packages/platform/src/probe.ts', imp('react'), 'error');
add('packages/platform/src/probe.ts', imp('node:fs'), 'error');

// TC-EXT-10: positive controls.
add('apps/api/src/game-registry/probe.ts', imp('@bga/game-rebellion/server'), 'ok');
add('apps/api/src/game-registry/probe.ts', imp('@bga/game-forbidden-stars/definition'), 'ok');
add('apps/web/src/games/probe.ts', imp('@bga/game-rebellion/definition'), 'ok');
add('apps/web/src/games/rebellion/probe.tsx', imp('@bga/game-rebellion/definition'), 'ok');

// TC-EXT-11: web game folder — only definition/schema/board/assets.
{
  const file = 'apps/web/src/games/rebellion/probe.tsx';
  for (const sub of ['rules', 'scenario', 'server', 'ai']) add(file, imp(`@bga/game-rebellion/${sub}`), 'error');
  add(file, "export * from '@bga/game-rebellion/rules';", 'error');
  add(file, dyn('@bga/game-rebellion/scenario'), 'error');
  add(file, imp('@bga/game-rebellion/src/rules'), 'error');
  add(file, imp(rel(file, 'packages/games/rebellion/src/rules')), 'error');
  add(file, imp('@bga/game-rebellion'), 'error');
  for (const sub of ['definition', 'schema', 'board', 'assets']) add(file, imp(`@bga/game-rebellion/${sub}`), 'ok');
  add(file, dyn('@bga/game-rebellion/board'), 'ok');
  // B-17: a game sees neither the registry nor other games' folders.
  add(file, imp('@/games/registry'), 'error');
  add(file, imp('@/games/forbidden-stars/entry'), 'error');
  add(file, imp('@/games/types'), 'ok');
}
for (const sub of ['rules', 'scenario', 'server', 'ai']) {
  add('apps/web/src/features/probe.ts', imp(`@bga/game-rebellion/${sub}`), 'error');
}
add('apps/web/src/features/probe.ts', imp('@prisma/client'), 'error');
add('apps/web/src/features/probe.ts', imp('@nestjs/common'), 'error');
add('apps/web/src/games/forbidden-stars/probe.ts', imp('@bga/game-rebellion/definition'), 'error');
add('apps/web/src/games/forbidden-stars/probe.ts', imp('@bga/game-forbidden-stars/schema'), 'error');
add('apps/web/src/games/forbidden-stars/probe.ts', imp('@bga/game-forbidden-stars/assets'), 'ok');
add('apps/web/src/games/forbidden-stars/probe.ts', imp('@bga/platform'), 'ok');

// B-10: web i18n tests may read the scenario, never rules/server/ai.
add('apps/web/src/games/rebellion/locales.i18n.test.ts', imp('@bga/game-rebellion/scenario'), 'ok');
add('apps/web/src/games/rebellion/locales.i18n.test.ts', imp('@bga/game-rebellion/rules'), 'error');

// B-16: only the registry consistency test may read api sources, and only the definitions list.
{
  const file = 'apps/web/src/games/registry.consistency.test.ts';
  add(file, imp('../../../api/src/game-registry/definitions'), 'ok');
  add(file, imp('../../../api/src/game-registry/registry'), 'error');
  add('apps/web/src/platform/probe.ts', imp('../../../api/src/game-registry/definitions'), 'error');
}

// TC-EXT-12: game packages depend only on @bga/platform and zod; rules are deterministic.
{
  const file = 'packages/games/rebellion/src/rules/probe.ts';
  for (const spec of ['react', '@nestjs/core', '@prisma/client', 'openai', '@bga/game-forbidden-stars/definition', '@bga/game-rebellion/schema', 'node:fs']) {
    add(file, imp(spec), 'error');
  }
  add(file, imp(rel(file, 'apps/web/src/main')), 'error');
  add(file, imp(rel(file, 'packages/games/forbidden-stars/src/definition')), 'error');
  add(file, 'export const t = Date.now();', 'error');
  add(file, 'export const r = Math.random();', 'error');
  add(file, 'export const d = new Date();', 'error');
  add(file, imp('@bga/platform'), 'ok');
  add(file, imp('zod'), 'ok');
  add(file, imp('../schema'), 'ok');
  add(file, imp('../scenario'), 'error');
}
add('packages/games/forbidden-stars/src/definition/probe.ts', imp('@bga/game-rebellion/definition'), 'error');
add('packages/games/forbidden-stars/src/definition/probe.ts', imp('@bga/platform'), 'ok');

// B-3…B-7: layering between game subpaths.
add('packages/games/rebellion/src/board/probe.ts', imp('../scenario'), 'error');
add('packages/games/rebellion/src/schema/probe.ts', imp('../rules'), 'error');
add('packages/games/rebellion/src/definition/probe.ts', imp('../schema'), 'error');
add('packages/games/rebellion/src/assets/probe.ts', imp('./cover'), 'ok');
add('packages/games/rebellion/src/scenario/probe.ts', imp('../schema'), 'ok');
add('packages/games/rebellion/src/scenario/probe.ts', imp('../rules'), 'error');
add('packages/games/rebellion/src/ai/probe.ts', imp('../schema'), 'ok');
add('packages/games/rebellion/src/ai/probe.ts', imp('../rules'), 'error');
add('packages/games/rebellion/src/ai/probe.ts', imp('openai'), 'error');
add('packages/games/rebellion/src/server/probe.ts', imp('../rules'), 'ok');
add('packages/games/rebellion/src/server/probe.ts', imp('../scenario'), 'ok');
add('packages/games/rebellion/src/server/probe.ts', imp('../board'), 'error');

// B-12/B-13/B-14: api.
add('apps/api/src/game-registry/probe.ts', imp('@bga/game-rebellion/rules'), 'error');
add('apps/api/src/game-registry/probe.ts', imp('@bga/game-rebellion/schema'), 'error');
add('apps/api/src/sessions/probe.ts', imp('@bga/game-rebellion/server'), 'error');
add('apps/api/src/sessions/probe.ts', imp('@bga/platform'), 'ok');
add('apps/api/src/sessions/probe.ts', imp('../game-registry/registry'), 'ok');
add('apps/api/src/main.ts', imp('@bga/game-rebellion/scenario'), 'error');
add('apps/api/src/common/probe.ts', imp('react'), 'error');
add('apps/api/test/support/fake-game.ts', imp('@bga/game-rebellion/schema'), 'error');
add('apps/api/test/support/fake-game.ts', imp('@bga/platform'), 'ok');

// TC-ARCH-02 / Q-21: no import() with a computed specifier in web, api or packages sources.
for (const file of [
  'apps/web/src/platform/probe.ts',
  'apps/web/src/games/probe.ts',
  'apps/web/src/games/rebellion/probe.tsx',
  'apps/api/src/game-registry/probe.ts',
  'apps/api/src/sessions/probe.ts',
  'packages/platform/src/probe.ts',
  'packages/games/rebellion/src/server/probe.ts',
  'packages/games/rebellion/src/rules/probe.ts',
]) {
  add(file, COMPUTED, 'error');
}
add('apps/web/src/app/probe.tsx', dyn('./pages/SettingsPage'), 'ok');

describe('ESLint architecture boundaries (TR-7)', () => {
  /** @type {ESLint} */
  let eslint;
  before(() => {
    eslint = new ESLint({ cwd: REPO_ROOT });
  });

  for (const [filePath, code, expected] of CASES) {
    test(`${expected === 'error' ? 'rejects' : 'allows '} ${filePath}: ${code}`, async () => {
      const [result] = await eslint.lintText(`${code}\n`, { filePath: path.join(REPO_ROOT, filePath) });
      const errors = result.messages.filter((m) => m.severity === 2);
      const relevant = errors.filter((m) =>
        ['no-restricted-imports', 'no-restricted-syntax', 'no-restricted-properties'].includes(m.ruleId),
      );
      if (expected === 'error') {
        assert.ok(relevant.length > 0, `expected a boundary error, got: ${JSON.stringify(errors)}`);
      } else {
        assert.deepEqual(
          errors.map((m) => `${m.ruleId}: ${m.message}`),
          [],
          'expected no errors (false positive)',
        );
      }
    });
  }
});
