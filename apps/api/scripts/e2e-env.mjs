// SWR-005B (AM-BE-3, defect D-1): environment of the e2e API child processes.
// (SWR-007: Prisma 7 no longer loads .env as described below; the blanking stays as defence in depth.)
// Importing the generated @prisma/client runs Prisma's own dotenv loader on apps/api/.env (schema-relative path) and
// copies every variable that is NOT already present into process.env — so the PO's real OPENAI_API_KEY and model
// names would reach a NODE_ENV=test process. dotenv never overwrites a key that exists, even with an empty value, and
// our config treats blank values as unset, so every OPENAI_* variable is set explicitly here: blank, and
// OPENAI_ENABLED=false.
// SWR-006 (plan-backend §7, TR-7): the same protection for AI_COMMANDER_* — the PO's .env may hold
// AI_COMMANDER_PROVIDER=openai. Every AI_COMMANDER_* is set explicitly (blank = schema default) and the provider is
// forced to `bot`, so test / e2e API processes always play the deterministic bot.

/** Every OPENAI_* variable of the config schema plus the ones the openai SDK would read from the environment. */
export const BLANKED_OPENAI_VARS = Object.freeze([
  'OPENAI_API_KEY',
  'OPENAI_STRATEGY_MODEL',
  'OPENAI_TACTICAL_MODEL',
  'OPENAI_MAX_COST_PER_SESSION_USD',
  'OPENAI_TIMEOUT_MS',
  'OPENAI_MAX_RETRIES',
  'OPENAI_BASE_URL',
  'OPENAI_ORG_ID',
  'OPENAI_PROJECT_ID',
  'OPENAI_LOG',
  'OPENAI_WEBHOOK_SECRET',
]);

/** Every AI_COMMANDER_* variable of the config schema (src/config/env.ts ENV_KEYS). */
export const AI_COMMANDER_VARS = Object.freeze([
  'AI_COMMANDER_PROVIDER',
  'AI_COMMANDER_MODEL_ROLE',
  'AI_COMMANDER_MAX_STEPS',
  'AI_COMMANDER_RUN_DEADLINE_MS',
  // SWR-008 C-7 (QD-22): blank = schema default (rules on, 6000 chars, 16000 prompt tokens; the bot ignores them).
  'AI_COMMANDER_RULES_CONTEXT',
  'AI_COMMANDER_RULES_MAX_CHARS',
  'AI_COMMANDER_MAX_PROMPT_TOKENS',
]);

/**
 * Overrides for a test / e2e process: every AI_COMMANDER_* blank (= default), the provider `bot`.
 * @returns {Record<string, string>}
 */
export function forcedAiCommanderEnv() {
  return {
    ...Object.fromEntries(AI_COMMANDER_VARS.map((key) => [key, ''])),
    AI_COMMANDER_PROVIDER: 'bot',
  };
}

/**
 * @param {Record<string, string | undefined>} parentEnv
 * @param {{ databaseUrl: string, port: string }} options
 * @returns {Record<string, string>}
 */
export function buildE2eEnv(parentEnv, { databaseUrl, port }) {
  const inherited = Object.fromEntries(
    Object.entries(parentEnv).filter(
      ([key, value]) =>
        !/^OPENAI_/.test(key) && !/^AI_COMMANDER_/.test(key) && typeof value === 'string',
    ),
  );
  const blanks = Object.fromEntries(BLANKED_OPENAI_VARS.map((key) => [key, '']));
  return {
    ...inherited,
    ...blanks,
    ...forcedAiCommanderEnv(),
    DATABASE_URL: databaseUrl,
    PORT: port,
    NODE_ENV: 'test',
    OPENAI_ENABLED: 'false',
  };
}
