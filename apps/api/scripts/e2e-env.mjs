// SWR-005B (AM-BE-3, defect D-1): environment of the e2e API child processes.
// Importing the generated @prisma/client runs Prisma's own dotenv loader on apps/api/.env (schema-relative path) and
// copies every variable that is NOT already present into process.env — so the PO's real OPENAI_API_KEY and model
// names would reach a NODE_ENV=test process. dotenv never overwrites a key that exists, even with an empty value, and
// our config treats blank values as unset, so every OPENAI_* variable is set explicitly here: blank, and
// OPENAI_ENABLED=false.

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

/**
 * @param {Record<string, string | undefined>} parentEnv
 * @param {{ databaseUrl: string, port: string }} options
 * @returns {Record<string, string>}
 */
export function buildE2eEnv(parentEnv, { databaseUrl, port }) {
  const inherited = Object.fromEntries(
    Object.entries(parentEnv).filter(
      ([key, value]) => !/^OPENAI_/.test(key) && typeof value === 'string',
    ),
  );
  const blanks = Object.fromEntries(BLANKED_OPENAI_VARS.map((key) => [key, '']));
  return {
    ...inherited,
    ...blanks,
    DATABASE_URL: databaseUrl,
    PORT: port,
    NODE_ENV: 'test',
    OPENAI_ENABLED: 'false',
  };
}
