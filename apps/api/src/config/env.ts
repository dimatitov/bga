/**
 * SWR-005B (AC-01, plan-backend §2.1): the ONLY place in apps/api/src that reads `process.env` or a `.env`
 * file. The environment is validated by one Zod schema; the result is a deeply frozen `AppConfig`.
 *
 * Rules (specification «Clarifications» Q-1..Q-4, AM-BE-3, AM-BE-4):
 * - a blank / whitespace-only value is the same as an unset variable;
 * - `OPENAI_ENABLED` is required and only `true` | `false` (case-sensitive);
 * - with `OPENAI_ENABLED=false` the other `OPENAI_*` variables are not checked (invalid ones are ignored);
 * - with `OPENAI_ENABLED=true` the key, both models and the session cost limit are required;
 * - `NODE_ENV=test` never loads `.env` and rejects `OPENAI_ENABLED=true`;
 * - the error message lists variable names with fixed reasons, never the values (no Zod messages either).
 *
 * SWR-006 (Contract §4, plan-backend §7, Q-22): `AI_COMMANDER_*` are always checked (independent of OPENAI_ENABLED);
 * blank = unset = default; `AI_COMMANDER_PROVIDER=openai` requires a usable `OPENAI_ENABLED=true` (so never in test).
 *
 * SWR-008 (plan-backend C-7): `AI_COMMANDER_RULES_CONTEXT` (`on` | `off`, case-sensitive, default `on` — A-4),
 * `AI_COMMANDER_RULES_MAX_CHARS` (integer 1000..12000, default 6000) and `AI_COMMANDER_MAX_PROMPT_TOKENS` (integer
 * 4000..64000, default 16000; unit: the upper-bound input token estimate of a request) are always checked too.
 * `knowledgeBaseRoot` never comes from the environment: `parseEnv` returns `null`, `main.ts` sets the repository root.
 */
import { existsSync, readFileSync } from 'node:fs';
import { inspect, parseEnv as parseDotenv } from 'node:util';
import { RULES_CONTEXT_LIMITS } from '@bga/platform';
import { z } from 'zod';

export const ENV_KEYS = [
  'DATABASE_URL',
  'PORT',
  'NODE_ENV',
  'OPENAI_ENABLED',
  'OPENAI_API_KEY',
  'OPENAI_STRATEGY_MODEL',
  'OPENAI_TACTICAL_MODEL',
  'OPENAI_MAX_COST_PER_SESSION_USD',
  'OPENAI_TIMEOUT_MS',
  'OPENAI_MAX_RETRIES',
  'AI_COMMANDER_PROVIDER',
  'AI_COMMANDER_MODEL_ROLE',
  'AI_COMMANDER_MAX_STEPS',
  'AI_COMMANDER_RUN_DEADLINE_MS',
  'AI_COMMANDER_RULES_CONTEXT',
  'AI_COMMANDER_RULES_MAX_CHARS',
  'AI_COMMANDER_MAX_PROMPT_TOKENS',
] as const;
export type EnvKey = (typeof ENV_KEYS)[number];

const MODEL_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,99}$/;

export const DEFAULT_PORT = 3000;
export const DEFAULT_OPENAI_TIMEOUT_MS = 30_000;
export const DEFAULT_OPENAI_MAX_RETRIES = 2;

export type AiCommanderProvider = 'bot' | 'openai';
/** Same union as `AIModelRole` of the AI layer (kept local: config does not depend on ai/). */
export type AiCommanderModelRole = 'tactical' | 'strategy';
/** SWR-008: whether the openai commander gets a rules block (the bot never uses rules). */
export type AiCommanderRulesContext = 'on' | 'off';

/** SWR-008 C-7: bounds of `AI_COMMANDER_MAX_PROMPT_TOKENS` (upper-bound input token estimate of one request). */
export const MAX_PROMPT_TOKENS_LIMITS = { min: 4000, max: 64_000, default: 16_000 } as const;

export interface AiCommanderConfig {
  readonly provider: AiCommanderProvider;
  readonly modelRole: AiCommanderModelRole;
  /** AI steps per automation run (1..256). */
  readonly maxSteps: number;
  /** Wall-clock budget of one automation run for OpenAI calls, ms (1000..120000). */
  readonly runDeadlineMs: number;
  /** SWR-008: rules block for the openai commander (`on` by default, A-4). */
  readonly rulesContext: AiCommanderRulesContext;
  /** SWR-008: size limit of the rules block, characters (1000..12000; checked against the pinned lines at start). */
  readonly rulesMaxChars: number;
  /** SWR-008: limit of one request's upper-bound input token estimate (4000..64000). */
  readonly maxPromptTokens: number;
}

export const DEFAULT_AI_COMMANDER: AiCommanderConfig = Object.freeze({
  provider: 'bot',
  modelRole: 'tactical',
  maxSteps: 64,
  runDeadlineMs: 45_000,
  rulesContext: 'on',
  rulesMaxChars: RULES_CONTEXT_LIMITS.maxCharsDefault,
  maxPromptTokens: MAX_PROMPT_TOKENS_LIMITS.default,
});

/** Each variable on its own (input: a non-blank string or undefined). Conditional rules: `conditionalIssues`. */
export const EnvSchema = z.object({
  DATABASE_URL: z.string().min(1),
  PORT: z.coerce.number().int().min(1).max(65535).default(DEFAULT_PORT),
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  OPENAI_ENABLED: z.enum(['true', 'false']).transform((v) => v === 'true'),
  OPENAI_API_KEY: z.string().regex(/^\S+$/).optional(),
  OPENAI_STRATEGY_MODEL: z.string().regex(MODEL_ID).optional(),
  OPENAI_TACTICAL_MODEL: z.string().regex(MODEL_ID).optional(),
  OPENAI_MAX_COST_PER_SESSION_USD: z.coerce.number().positive().max(5).optional(),
  OPENAI_TIMEOUT_MS: z.coerce
    .number()
    .int()
    .min(1000)
    .max(120_000)
    .default(DEFAULT_OPENAI_TIMEOUT_MS),
  OPENAI_MAX_RETRIES: z.coerce.number().int().min(0).max(5).default(DEFAULT_OPENAI_MAX_RETRIES),
  AI_COMMANDER_PROVIDER: z.enum(['bot', 'openai']).default(DEFAULT_AI_COMMANDER.provider),
  AI_COMMANDER_MODEL_ROLE: z.enum(['tactical', 'strategy']).default(DEFAULT_AI_COMMANDER.modelRole),
  AI_COMMANDER_MAX_STEPS: z.coerce
    .number()
    .int()
    .min(1)
    .max(256)
    .default(DEFAULT_AI_COMMANDER.maxSteps),
  AI_COMMANDER_RUN_DEADLINE_MS: z.coerce
    .number()
    .int()
    .min(1000)
    .max(120_000)
    .default(DEFAULT_AI_COMMANDER.runDeadlineMs),
  AI_COMMANDER_RULES_CONTEXT: z.enum(['on', 'off']).default(DEFAULT_AI_COMMANDER.rulesContext),
  AI_COMMANDER_RULES_MAX_CHARS: z.coerce
    .number()
    .int()
    .min(RULES_CONTEXT_LIMITS.maxCharsMin)
    .max(RULES_CONTEXT_LIMITS.maxCharsMax)
    .default(DEFAULT_AI_COMMANDER.rulesMaxChars),
  AI_COMMANDER_MAX_PROMPT_TOKENS: z.coerce
    .number()
    .int()
    .min(MAX_PROMPT_TOKENS_LIMITS.min)
    .max(MAX_PROMPT_TOKENS_LIMITS.max)
    .default(DEFAULT_AI_COMMANDER.maxPromptTokens),
});

/** Fixed reasons; neither the values nor Zod messages ever reach the error text. */
const INVALID_REASON: Record<EnvKey, string> = {
  DATABASE_URL: 'must be a non-empty string',
  PORT: 'must be an integer 1..65535',
  NODE_ENV: 'must be one of development|test|production',
  OPENAI_ENABLED: 'must be "true" or "false"',
  OPENAI_API_KEY: 'must be a non-empty string without whitespace',
  OPENAI_STRATEGY_MODEL: 'must be a model id ([A-Za-z0-9._:-], up to 100 chars)',
  OPENAI_TACTICAL_MODEL: 'must be a model id ([A-Za-z0-9._:-], up to 100 chars)',
  OPENAI_MAX_COST_PER_SESSION_USD: 'must be a number > 0 and <= 5',
  OPENAI_TIMEOUT_MS: 'must be an integer 1000..120000',
  OPENAI_MAX_RETRIES: 'must be an integer 0..5',
  AI_COMMANDER_PROVIDER: 'must be "bot" or "openai"',
  AI_COMMANDER_MODEL_ROLE: 'must be "tactical" or "strategy"',
  AI_COMMANDER_MAX_STEPS: 'must be an integer 1..256',
  AI_COMMANDER_RUN_DEADLINE_MS: 'must be an integer 1000..120000',
  AI_COMMANDER_RULES_CONTEXT: 'must be "on" or "off"',
  AI_COMMANDER_RULES_MAX_CHARS: `must be an integer ${RULES_CONTEXT_LIMITS.maxCharsMin}..${RULES_CONTEXT_LIMITS.maxCharsMax}`,
  AI_COMMANDER_MAX_PROMPT_TOKENS: `must be an integer ${MAX_PROMPT_TOKENS_LIMITS.min}..${MAX_PROMPT_TOKENS_LIMITS.max}`,
};
const REASON_REQUIRED = 'is required';
const REASON_REQUIRED_WHEN_ENABLED = 'is required when OPENAI_ENABLED=true';
const REASON_FALSE_IN_TEST = 'must be false when NODE_ENV=test';
const REASON_PROVIDER_NEEDS_OPENAI = 'requires OPENAI_ENABLED=true';

/** Variables checked only when OPENAI_ENABLED=true (Q-3: ignored when false). */
const OPENAI_DEPENDENT: readonly EnvKey[] = [
  'OPENAI_API_KEY',
  'OPENAI_STRATEGY_MODEL',
  'OPENAI_TACTICAL_MODEL',
  'OPENAI_MAX_COST_PER_SESSION_USD',
  'OPENAI_TIMEOUT_MS',
  'OPENAI_MAX_RETRIES',
];
const REQUIRED_WHEN_ENABLED: readonly EnvKey[] = [
  'OPENAI_API_KEY',
  'OPENAI_STRATEGY_MODEL',
  'OPENAI_TACTICAL_MODEL',
  'OPENAI_MAX_COST_PER_SESSION_USD',
];

/** A server-side secret that never shows itself in String(), JSON or util.inspect. */
export class Secret {
  readonly #value: string;

  constructor(value: string) {
    this.#value = value;
    Object.freeze(this);
  }

  /** The raw value. Only the OpenAI client factory may call this (architecture test). */
  reveal(): string {
    return this.#value;
  }

  toString(): string {
    return '[redacted]';
  }

  toJSON(): string {
    return '[redacted]';
  }

  [inspect.custom](): string {
    return 'Secret([redacted])';
  }
}

export interface EnvIssue {
  readonly name: EnvKey;
  readonly reason: string;
}

/** Invalid environment. `message` and `variables` hold names and fixed reasons only — never values. */
export class EnvValidationError extends Error {
  readonly variables: readonly EnvIssue[];

  constructor(variables: readonly EnvIssue[]) {
    super(`Invalid environment: ${variables.map((v) => `${v.name}: ${v.reason}`).join('; ')}`);
    this.name = 'EnvValidationError';
    this.variables = Object.freeze(variables.map((v) => Object.freeze({ ...v })));
  }
}

export type NodeEnv = 'development' | 'test' | 'production';

export type OpenAIConfig =
  | {
      readonly enabled: false;
      /** The key itself is not kept when OpenAI is off. */
      readonly apiKeyConfigured: boolean;
      readonly strategyModel: string | null;
      readonly tacticalModel: string | null;
      readonly maxCostPerSessionUsd: number | null;
      readonly timeoutMs: number;
      readonly maxRetries: number;
    }
  | {
      readonly enabled: true;
      readonly apiKey: Secret;
      readonly strategyModel: string;
      readonly tacticalModel: string;
      readonly maxCostPerSessionUsd: number;
      readonly timeoutMs: number;
      readonly maxRetries: number;
    };

export interface AppConfig {
  readonly nodeEnv: NodeEnv;
  readonly databaseUrl: string;
  readonly port: number;
  readonly openai: OpenAIConfig;
  /** SWR-006: who plays the AI side of a session (bot by default). */
  readonly aiCommander: AiCommanderConfig;
  /**
   * SWR-008 C-7: absolute repository root for repository-relative `GameRulesSupport.knowledgeBaseDir`. NOT from the
   * environment: `parseEnv` returns `null`; `main.ts` sets it from its own location; tests set the repository root.
   */
  readonly knowledgeBaseRoot: string | null;
}

export type RawEnv = Readonly<Record<string, string | undefined>>;
type Normalized = Partial<Record<EnvKey, string>>;
type Shape = typeof EnvSchema.shape;

/** Only ENV_KEYS are read; blank / whitespace-only = unset. */
function normalize(raw: RawEnv): Normalized {
  const out: Normalized = {};
  for (const key of ENV_KEYS) {
    const value = raw[key];
    if (typeof value === 'string' && value.trim() !== '') out[key] = value;
  }
  return out;
}

type FieldResult<K extends EnvKey> =
  { ok: true; value: z.output<Shape[K]> } | { ok: false; reason: string };

function checkField<K extends EnvKey>(key: K, input: Normalized): FieldResult<K> {
  const schema = EnvSchema.shape[key] as unknown as z.ZodType<z.output<Shape[K]>>;
  const result = schema.safeParse(input[key]);
  if (result.success) return { ok: true, value: result.data };
  return { ok: false, reason: input[key] === undefined ? REASON_REQUIRED : INVALID_REASON[key] };
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === 'object' && !(value instanceof Secret)) {
    for (const inner of Object.values(value)) deepFreeze(inner);
    Object.freeze(value);
  }
  return value;
}

/**
 * Pure: validates `raw` (e.g. `process.env`) and returns a frozen `AppConfig`.
 * @throws EnvValidationError listing every problematic variable at once, in ENV_KEYS order.
 */
export function parseEnv(raw: RawEnv): AppConfig {
  const input = normalize(raw);
  const issues = new Map<EnvKey, string>();

  const databaseUrl = checkField('DATABASE_URL', input);
  const port = checkField('PORT', input);
  const nodeEnv = checkField('NODE_ENV', input);
  const enabled = checkField('OPENAI_ENABLED', input);
  for (const [key, r] of [
    ['DATABASE_URL', databaseUrl],
    ['PORT', port],
    ['NODE_ENV', nodeEnv],
    ['OPENAI_ENABLED', enabled],
  ] as const) {
    if (!r.ok) issues.set(key, r.reason);
  }

  const openaiOn = enabled.ok && enabled.value === true;
  if (openaiOn && nodeEnv.ok && nodeEnv.value === 'test') {
    issues.set('OPENAI_ENABLED', REASON_FALSE_IN_TEST);
  }

  const apiKey = checkField('OPENAI_API_KEY', input);
  const strategyModel = checkField('OPENAI_STRATEGY_MODEL', input);
  const tacticalModel = checkField('OPENAI_TACTICAL_MODEL', input);
  const maxCost = checkField('OPENAI_MAX_COST_PER_SESSION_USD', input);
  const timeoutMs = checkField('OPENAI_TIMEOUT_MS', input);
  const maxRetries = checkField('OPENAI_MAX_RETRIES', input);

  if (openaiOn) {
    const dependent = {
      OPENAI_API_KEY: apiKey,
      OPENAI_STRATEGY_MODEL: strategyModel,
      OPENAI_TACTICAL_MODEL: tacticalModel,
      OPENAI_MAX_COST_PER_SESSION_USD: maxCost,
      OPENAI_TIMEOUT_MS: timeoutMs,
      OPENAI_MAX_RETRIES: maxRetries,
    } as const;
    for (const key of OPENAI_DEPENDENT) {
      const r = dependent[key as keyof typeof dependent];
      if (!r.ok) issues.set(key, r.reason);
      else if (REQUIRED_WHEN_ENABLED.includes(key) && r.value === undefined) {
        issues.set(key, REASON_REQUIRED_WHEN_ENABLED);
      }
    }
  }

  const provider = checkField('AI_COMMANDER_PROVIDER', input);
  const modelRole = checkField('AI_COMMANDER_MODEL_ROLE', input);
  const maxSteps = checkField('AI_COMMANDER_MAX_STEPS', input);
  const runDeadlineMs = checkField('AI_COMMANDER_RUN_DEADLINE_MS', input);
  const rulesContext = checkField('AI_COMMANDER_RULES_CONTEXT', input);
  const rulesMaxChars = checkField('AI_COMMANDER_RULES_MAX_CHARS', input);
  const maxPromptTokens = checkField('AI_COMMANDER_MAX_PROMPT_TOKENS', input);
  for (const [key, r] of [
    ['AI_COMMANDER_PROVIDER', provider],
    ['AI_COMMANDER_MODEL_ROLE', modelRole],
    ['AI_COMMANDER_MAX_STEPS', maxSteps],
    ['AI_COMMANDER_RUN_DEADLINE_MS', runDeadlineMs],
    ['AI_COMMANDER_RULES_CONTEXT', rulesContext],
    ['AI_COMMANDER_RULES_MAX_CHARS', rulesMaxChars],
    ['AI_COMMANDER_MAX_PROMPT_TOKENS', maxPromptTokens],
  ] as const) {
    if (!r.ok) issues.set(key, r.reason);
  }
  // `openai` needs OpenAI really switched on: OPENAI_ENABLED=true and accepted (not rejected, e.g. in test).
  const openaiUsable = openaiOn && !issues.has('OPENAI_ENABLED');
  if (provider.ok && provider.value === 'openai' && !openaiUsable) {
    issues.set('AI_COMMANDER_PROVIDER', REASON_PROVIDER_NEEDS_OPENAI);
  }

  if (issues.size > 0) {
    throw new EnvValidationError(
      ENV_KEYS.filter((k) => issues.has(k)).map((name) => ({ name, reason: issues.get(name)! })),
    );
  }

  // All always-checked fields are ok here (otherwise we threw above).
  const ok = <K extends EnvKey>(r: FieldResult<K>): z.output<Shape[K]> =>
    (r as { ok: true; value: z.output<Shape[K]> }).value;
  const orNull = <K extends EnvKey>(r: FieldResult<K>) => (r.ok ? (r.value ?? null) : null);

  const openai: OpenAIConfig = openaiOn
    ? {
        enabled: true,
        apiKey: new Secret(ok(apiKey) as string),
        strategyModel: ok(strategyModel) as string,
        tacticalModel: ok(tacticalModel) as string,
        maxCostPerSessionUsd: ok(maxCost) as number,
        timeoutMs: ok(timeoutMs),
        maxRetries: ok(maxRetries),
      }
    : {
        enabled: false,
        apiKeyConfigured: input.OPENAI_API_KEY !== undefined,
        strategyModel: orNull(strategyModel),
        tacticalModel: orNull(tacticalModel),
        maxCostPerSessionUsd: orNull(maxCost),
        timeoutMs: timeoutMs.ok ? timeoutMs.value : DEFAULT_OPENAI_TIMEOUT_MS,
        maxRetries: maxRetries.ok ? maxRetries.value : DEFAULT_OPENAI_MAX_RETRIES,
      };

  return deepFreeze({
    nodeEnv: ok(nodeEnv),
    databaseUrl: ok(databaseUrl),
    port: ok(port),
    openai,
    aiCommander: {
      provider: ok(provider),
      modelRole: ok(modelRole),
      maxSteps: ok(maxSteps),
      runDeadlineMs: ok(runDeadlineMs),
      rulesContext: ok(rulesContext),
      rulesMaxChars: ok(rulesMaxChars),
      maxPromptTokens: ok(maxPromptTokens),
    },
    knowledgeBaseRoot: null,
  });
}

export interface LoadAppConfigOptions {
  /** Path of the optional `.env` file (apps/api/.env). */
  dotenvPath: string;
  /** Defaults to `process.env`; injectable for tests. Never mutated. */
  env?: RawEnv;
}

/**
 * Reads the environment (the only `process.env` access in apps/api/src). The `.env` file is read only when
 * NODE_ENV is not `test` and the file exists; variables already present in the environment win. The file is
 * parsed into a local object — `process.env` is not modified.
 */
export function loadAppConfig(options: LoadAppConfigOptions): AppConfig {
  const env = options.env ?? process.env;
  const nodeEnv = env.NODE_ENV?.trim();
  let fromFile: RawEnv = {};
  if (nodeEnv !== 'test' && existsSync(options.dotenvPath)) {
    fromFile = parseDotenv(readFileSync(options.dotenvPath, 'utf8'));
  }
  const merged: Record<string, string | undefined> = {};
  for (const key of ENV_KEYS) {
    const own = env[key];
    merged[key] = own !== undefined && own.trim() !== '' ? own : fromFile[key];
  }
  return parseEnv(merged);
}
