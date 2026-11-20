// SWR-005B review F-1 (defect D-1 for the Playwright side): the Playwright runner and its workers load the API's
// generated `@prisma/client` through `e2e/support/seed.ts`. Prisma's own dotenv loader copies every variable of
// apps/api/.env that is NOT already present into process.env (at `require` and on `new PrismaClient`); dotenv never
// overwrites a present key, even an empty one. So every OPENAI_* variable is set here: blank (= unset for the API
// config) and OPENAI_ENABLED=false — the PO's real key and model names never enter the e2e test process (nor any
// child it spawns, incl. the Playwright webServer commands, which inherit process.env).
//
// Imported for its side effect as the FIRST import of `playwright.config.ts` (evaluated in the runner and again in
// every worker) and of `seed.ts`; `seed.ts` also calls `blankOpenAiEnv()` right before its `require`.
// The list is the single source of `apps/api/scripts/e2e-env.mjs` (same as the Vitest setup and the e2e API child).
// Values are never read or printed here — only names / blankness.
// SWR-006 (TR-7, TC-E-08): the same for AI_COMMANDER_* — the PO's apps/api/.env may hold AI_COMMANDER_PROVIDER=openai;
// every AI_COMMANDER_* is present and blank (= schema default) and the provider is `bot` (`forcedAiCommanderEnv()`).
import {
  AI_COMMANDER_VARS,
  BLANKED_OPENAI_VARS,
  forcedAiCommanderEnv,
} from '../../apps/api/scripts/e2e-env.mjs';

/**
 * Blanks every present OPENAI_* variable plus every name of {@link BLANKED_OPENAI_VARS}; sets OPENAI_ENABLED=false.
 * SWR-006: also blanks every present AI_COMMANDER_* and applies `forcedAiCommanderEnv()` (provider `bot`).
 */
export function blankOpenAiEnv(env: NodeJS.ProcessEnv = process.env): void {
  for (const key of Object.keys(env)) {
    if (/^OPENAI_/.test(key) || /^AI_COMMANDER_/.test(key)) env[key] = '';
  }
  for (const key of BLANKED_OPENAI_VARS) env[key] = '';
  env.OPENAI_ENABLED = 'false';
  Object.assign(env, forcedAiCommanderEnv());
}

/** NAMES of OPENAI_* variables (except OPENAI_ENABLED) that hold a non-blank value. Never returns values. */
export function nonBlankOpenAiVarNames(env: NodeJS.ProcessEnv = process.env): string[] {
  return Object.keys(env).filter(
    (key) => /^OPENAI_/.test(key) && key !== 'OPENAI_ENABLED' && (env[key] ?? '').trim() !== '',
  );
}

/**
 * SWR-006: NAMES of AI_COMMANDER_* variables that differ from the forced test values (provider `bot`, the rest blank).
 * Never returns values.
 */
export function unexpectedAiCommanderVarNames(env: NodeJS.ProcessEnv = process.env): string[] {
  const forced: Record<string, string> = forcedAiCommanderEnv();
  return Object.keys(env).filter(
    (key) => /^AI_COMMANDER_/.test(key) && (env[key] ?? '') !== (forced[key] ?? ''),
  );
}

export { AI_COMMANDER_VARS, BLANKED_OPENAI_VARS };

blankOpenAiEnv();
