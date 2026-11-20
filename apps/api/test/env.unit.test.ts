/**
 * SWR-005B W1 (AC-01, AC-10): environment schema `parseEnv` / `loadAppConfig` (plan-backend §2.1,
 * specification «Clarifications» Q-1..Q-4, AM-BE-3, AM-BE-4). TC-ENV-01..15. Only sentinel fake keys.
 */
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { inspect } from 'node:util';
import { afterAll, describe, expect, it } from 'vitest';
import {
  DEFAULT_AI_COMMANDER,
  ENV_KEYS,
  EnvValidationError,
  Secret,
  loadAppConfig,
  parseEnv,
  type RawEnv,
} from '../src/config/env';

const SENTINEL_KEY = 'sk-test-SENTINEL-0123456789abcdefghijklmnop';

/** OpenAI off: only the always-required variables. */
const ENV0: RawEnv = { DATABASE_URL: 'file:./x.db', OPENAI_ENABLED: 'false' };
/** OpenAI on: everything required. */
const ENV1: RawEnv = {
  DATABASE_URL: 'file:./x.db',
  OPENAI_ENABLED: 'true',
  OPENAI_API_KEY: SENTINEL_KEY,
  OPENAI_STRATEGY_MODEL: 'gpt-6.1-sol',
  OPENAI_TACTICAL_MODEL: 'gpt-6-luna',
  OPENAI_MAX_COST_PER_SESSION_USD: '0.25',
};

function envError(raw: RawEnv): EnvValidationError {
  try {
    parseEnv(raw);
  } catch (error) {
    expect(error).toBeInstanceOf(EnvValidationError);
    return error as EnvValidationError;
  }
  throw new Error('expected parseEnv to throw');
}

function names(raw: RawEnv): string[] {
  return envError(raw).variables.map((v) => v.name);
}

function without(raw: RawEnv, key: string): RawEnv {
  const copy = { ...raw };
  delete copy[key];
  return copy;
}

describe('parseEnv — valid environments', () => {
  it('TC-ENV-01: defaults with OpenAI off (PORT 3000, development, 30000 ms, 2 retries)', () => {
    const config = parseEnv(ENV0);
    expect(config).toEqual({
      nodeEnv: 'development',
      databaseUrl: 'file:./x.db',
      port: 3000,
      openai: {
        enabled: false,
        apiKeyConfigured: false,
        strategyModel: null,
        tacticalModel: null,
        maxCostPerSessionUsd: null,
        timeoutMs: 30000,
        maxRetries: 2,
      },
      aiCommander: {
        provider: 'bot',
        modelRole: 'tactical',
        maxSteps: 64,
        runDeadlineMs: 45000,
        rulesContext: 'on',
        rulesMaxChars: 6000,
        maxPromptTokens: 16000,
      },
      knowledgeBaseRoot: null,
    });
  });

  it('TC-ENV-02: OpenAI on → boolean flag, numeric cost, key wrapped in Secret', () => {
    const config = parseEnv({ ...ENV1, PORT: '4000', NODE_ENV: 'production' });
    expect(config.port).toBe(4000);
    expect(config.nodeEnv).toBe('production');
    expect(config.openai.enabled).toBe(true);
    if (!config.openai.enabled) throw new Error('unreachable');
    expect(config.openai.maxCostPerSessionUsd).toBe(0.25);
    expect(config.openai.strategyModel).toBe('gpt-6.1-sol');
    expect(config.openai.tacticalModel).toBe('gpt-6-luna');
    expect(config.openai.apiKey).toBeInstanceOf(Secret);
    expect(config.openai.apiKey.reveal()).toBe(SENTINEL_KEY);
  });

  it('the config is deeply frozen', () => {
    const config = parseEnv(ENV1);
    expect(Object.isFrozen(config)).toBe(true);
    expect(Object.isFrozen(config.openai)).toBe(true);
    expect(Object.isFrozen(config.aiCommander)).toBe(true);
  });

  it('only ENV_KEYS are read (other variables are ignored)', () => {
    expect(() =>
      parseEnv({ ...ENV0, SOMETHING_ELSE: 'x', OPENAI_BASE_URL: 'http://evil' }),
    ).not.toThrow();
  });

  it('TC-ENV-11 / Q-3: OPENAI_ENABLED=false — OpenAI variables are neither required nor checked', () => {
    const config = parseEnv({
      ...ENV0,
      OPENAI_API_KEY: 'has whitespace inside',
      OPENAI_STRATEGY_MODEL: 'bad model id!',
      OPENAI_MAX_COST_PER_SESSION_USD: 'abc',
      OPENAI_TIMEOUT_MS: '0',
      OPENAI_MAX_RETRIES: '99',
    });
    expect(config.openai).toEqual({
      enabled: false,
      apiKeyConfigured: true,
      strategyModel: null,
      tacticalModel: null,
      maxCostPerSessionUsd: null,
      timeoutMs: 30000,
      maxRetries: 2,
    });
  });

  it('OPENAI_ENABLED=false keeps valid values but never the key itself', () => {
    const config = parseEnv({ ...ENV1, OPENAI_ENABLED: 'false', OPENAI_TIMEOUT_MS: '5000' });
    expect(config.openai).toEqual({
      enabled: false,
      apiKeyConfigured: true,
      strategyModel: 'gpt-6.1-sol',
      tacticalModel: 'gpt-6-luna',
      maxCostPerSessionUsd: 0.25,
      timeoutMs: 5000,
      maxRetries: 2,
    });
    expect(JSON.stringify(config)).not.toContain(SENTINEL_KEY);
    expect(inspect(config, { depth: 10 })).not.toContain(SENTINEL_KEY);
    expect('apiKey' in config.openai).toBe(false);
  });

  it('blank / whitespace-only values are treated as unset (defaults apply)', () => {
    const config = parseEnv({ ...ENV0, PORT: '  ', NODE_ENV: '', OPENAI_API_KEY: '   ' });
    expect(config.port).toBe(3000);
    expect(config.nodeEnv).toBe('development');
    expect(config.openai.enabled === false && config.openai.apiKeyConfigured).toBe(false);
  });
});

describe('parseEnv — invalid variables', () => {
  it('TC-ENV-03: DATABASE_URL missing or empty', () => {
    for (const raw of [without(ENV0, 'DATABASE_URL'), { ...ENV0, DATABASE_URL: '' }]) {
      const error = envError(raw);
      expect(error.message).toBe('Invalid environment: DATABASE_URL: is required');
    }
  });

  it('TC-ENV-04: PORT boundaries', () => {
    expect(parseEnv({ ...ENV0, PORT: '1' }).port).toBe(1);
    expect(parseEnv({ ...ENV0, PORT: '65535' }).port).toBe(65535);
    for (const port of ['0', '65536', '-1', '3000.5', 'abc']) {
      const error = envError({ ...ENV0, PORT: port });
      expect(error.message).toBe('Invalid environment: PORT: must be an integer 1..65535');
    }
  });

  it('TC-ENV-05: NODE_ENV only development|test|production; missing → development', () => {
    for (const nodeEnv of ['staging', 'PRODUCTION']) {
      expect(names({ ...ENV0, NODE_ENV: nodeEnv })).toEqual(['NODE_ENV']);
    }
    expect(parseEnv(without(ENV0, 'NODE_ENV')).nodeEnv).toBe('development');
    expect(parseEnv({ ...ENV0, NODE_ENV: 'test' }).nodeEnv).toBe('test');
  });

  it('TC-ENV-06 / Q-1: OPENAI_ENABLED required, only "true" | "false"', () => {
    expect(envError(without(ENV0, 'OPENAI_ENABLED')).message).toBe(
      'Invalid environment: OPENAI_ENABLED: is required',
    );
    expect(envError({ ...ENV0, OPENAI_ENABLED: '' }).message).toBe(
      'Invalid environment: OPENAI_ENABLED: is required',
    );
    for (const flag of ['yes', '1', '0', 'TRUE', 'False', ' true']) {
      expect(envError({ ...ENV0, OPENAI_ENABLED: flag }).message).toBe(
        'Invalid environment: OPENAI_ENABLED: must be "true" or "false"',
      );
    }
  });

  it('TC-ENV-07 / Q-2: OPENAI_API_KEY required when enabled; whitespace-only = missing', () => {
    for (const raw of [
      without(ENV1, 'OPENAI_API_KEY'),
      { ...ENV1, OPENAI_API_KEY: '' },
      { ...ENV1, OPENAI_API_KEY: '   ' },
    ]) {
      expect(envError(raw).message).toBe(
        'Invalid environment: OPENAI_API_KEY: is required when OPENAI_ENABLED=true',
      );
    }
    expect(envError({ ...ENV1, OPENAI_API_KEY: 'sk-test-SENTINEL a b' }).message).toBe(
      'Invalid environment: OPENAI_API_KEY: must be a non-empty string without whitespace',
    );
  });

  it.each(['OPENAI_STRATEGY_MODEL', 'OPENAI_TACTICAL_MODEL'])(
    'TC-ENV-08/09: %s required when enabled; must be a model id',
    (key) => {
      for (const raw of [without(ENV1, key), { ...ENV1, [key]: '' }]) {
        expect(envError(raw).variables).toEqual([
          { name: key, reason: 'is required when OPENAI_ENABLED=true' },
        ]);
      }
      for (const bad of ['gpt 6', '-gpt', 'x'.repeat(101), 'gpt/6']) {
        expect(names({ ...ENV1, [key]: bad })).toEqual([key]);
      }
    },
  );

  it('TC-ENV-10: OPENAI_MAX_COST_PER_SESSION_USD > 0 and <= 5 when enabled', () => {
    expect(names(without(ENV1, 'OPENAI_MAX_COST_PER_SESSION_USD'))).toEqual([
      'OPENAI_MAX_COST_PER_SESSION_USD',
    ]);
    for (const bad of ['0', '-0.01', 'abc', 'NaN', 'Infinity', '5.01', '25']) {
      expect(envError({ ...ENV1, OPENAI_MAX_COST_PER_SESSION_USD: bad }).message).toBe(
        'Invalid environment: OPENAI_MAX_COST_PER_SESSION_USD: must be a number > 0 and <= 5',
      );
    }
    for (const [good, value] of [
      ['0.000001', 0.000001],
      ['0.25', 0.25],
      ['5', 5],
    ] as const) {
      const config = parseEnv({ ...ENV1, OPENAI_MAX_COST_PER_SESSION_USD: good });
      expect(config.openai.maxCostPerSessionUsd).toBe(value);
    }
  });

  it('TC-ENV-13 / Q-4: OPENAI_TIMEOUT_MS 1000..120000, OPENAI_MAX_RETRIES 0..5 (checked when enabled)', () => {
    const on = parseEnv(ENV1);
    expect(on.openai.timeoutMs).toBe(30000);
    expect(on.openai.maxRetries).toBe(2);
    expect(parseEnv({ ...ENV1, OPENAI_TIMEOUT_MS: '1000' }).openai.timeoutMs).toBe(1000);
    expect(parseEnv({ ...ENV1, OPENAI_TIMEOUT_MS: '120000' }).openai.timeoutMs).toBe(120000);
    expect(parseEnv({ ...ENV1, OPENAI_MAX_RETRIES: '0' }).openai.maxRetries).toBe(0);
    expect(parseEnv({ ...ENV1, OPENAI_MAX_RETRIES: '5' }).openai.maxRetries).toBe(5);
    for (const bad of ['0', '-1', 'abc', '999', '120001', '1500.5']) {
      expect(envError({ ...ENV1, OPENAI_TIMEOUT_MS: bad }).message).toBe(
        'Invalid environment: OPENAI_TIMEOUT_MS: must be an integer 1000..120000',
      );
    }
    for (const bad of ['-1', '1.5', 'abc', '6']) {
      expect(envError({ ...ENV1, OPENAI_MAX_RETRIES: bad }).message).toBe(
        'Invalid environment: OPENAI_MAX_RETRIES: must be an integer 0..5',
      );
    }
  });

  it('AM-BE-3: NODE_ENV=test rejects OPENAI_ENABLED=true', () => {
    expect(envError({ ...ENV1, NODE_ENV: 'test' }).message).toBe(
      'Invalid environment: OPENAI_ENABLED: must be false when NODE_ENV=test',
    );
    expect(parseEnv({ ...ENV0, NODE_ENV: 'test' }).openai.enabled).toBe(false);
  });

  it('TC-ENV-07..10: all four conditional variables are reported at once', () => {
    const error = envError({ DATABASE_URL: 'file:./x.db', OPENAI_ENABLED: 'true' });
    expect(error.message).toBe(
      'Invalid environment: ' +
        [
          'OPENAI_API_KEY: is required when OPENAI_ENABLED=true',
          'OPENAI_STRATEGY_MODEL: is required when OPENAI_ENABLED=true',
          'OPENAI_TACTICAL_MODEL: is required when OPENAI_ENABLED=true',
          'OPENAI_MAX_COST_PER_SESSION_USD: is required when OPENAI_ENABLED=true',
        ].join('; '),
    );
  });

  it('TC-ENV-14: one error lists every problem, in ENV_KEYS order', () => {
    const error = envError({
      PORT: 'abc',
      OPENAI_ENABLED: 'true',
      OPENAI_STRATEGY_MODEL: 'gpt-6.1-sol',
      OPENAI_TACTICAL_MODEL: 'gpt-6-luna',
      OPENAI_MAX_COST_PER_SESSION_USD: '0',
    });
    expect(error.variables.map((v) => v.name)).toEqual([
      'DATABASE_URL',
      'PORT',
      'OPENAI_API_KEY',
      'OPENAI_MAX_COST_PER_SESSION_USD',
    ]);
    expect(error.message.startsWith('Invalid environment: DATABASE_URL: is required; PORT:')).toBe(
      true,
    );
    const order = error.variables.map((v) => ENV_KEYS.indexOf(v.name));
    expect([...order].sort((a, b) => a - b)).toEqual(order);
  });
});

/** SWR-006 test-cases §1 (TC-ENV-01..06 of SWR-006), plan-backend §7, Q-22. */
describe('parseEnv — AI_COMMANDER_* (SWR-006)', () => {
  it('SWR-006 TC-ENV-01: defaults without AI_COMMANDER_* (bot, tactical, 64, 45000) = DEFAULT_AI_COMMANDER', () => {
    const config = parseEnv(ENV0);
    expect(config.aiCommander).toEqual({
      provider: 'bot',
      modelRole: 'tactical',
      maxSteps: 64,
      runDeadlineMs: 45000,
      // SWR-008 C-7 defaults
      rulesContext: 'on',
      rulesMaxChars: 6000,
      maxPromptTokens: 16000,
    });
    expect(config.aiCommander).toEqual(DEFAULT_AI_COMMANDER);
    expect(parseEnv(ENV1).aiCommander).toEqual(DEFAULT_AI_COMMANDER);
  });

  it('valid values are parsed (openai with OpenAI on, strategy, numbers)', () => {
    const config = parseEnv({
      ...ENV1,
      AI_COMMANDER_PROVIDER: 'openai',
      AI_COMMANDER_MODEL_ROLE: 'strategy',
      AI_COMMANDER_MAX_STEPS: '10',
      AI_COMMANDER_RUN_DEADLINE_MS: '5000',
    });
    expect(config.aiCommander).toEqual({
      ...DEFAULT_AI_COMMANDER,
      provider: 'openai',
      modelRole: 'strategy',
      maxSteps: 10,
      runDeadlineMs: 5000,
    });
    expect(parseEnv({ ...ENV0, AI_COMMANDER_PROVIDER: 'bot' }).aiCommander.provider).toBe('bot');
  });

  it('SWR-006 TC-ENV-02: openai without OPENAI_ENABLED=true fails, naming the variable, no values', () => {
    expect(envError({ ...ENV0, AI_COMMANDER_PROVIDER: 'openai' }).message).toBe(
      'Invalid environment: AI_COMMANDER_PROVIDER: requires OPENAI_ENABLED=true',
    );
    const missingFlag = envError({
      DATABASE_URL: 'file:./x.db',
      AI_COMMANDER_PROVIDER: 'openai',
      OPENAI_API_KEY: SENTINEL_KEY,
    });
    expect(missingFlag.variables).toEqual([
      { name: 'OPENAI_ENABLED', reason: 'is required' },
      { name: 'AI_COMMANDER_PROVIDER', reason: 'requires OPENAI_ENABLED=true' },
    ]);
    expect(missingFlag.message).not.toMatch(/sentinel|SENTINEL|sk-|openai"/);
    // An invalid flag is not "true" either.
    expect(names({ ...ENV0, OPENAI_ENABLED: 'yes', AI_COMMANDER_PROVIDER: 'openai' })).toEqual([
      'OPENAI_ENABLED',
      'AI_COMMANDER_PROVIDER',
    ]);
  });

  it('plan-backend §7: NODE_ENV=test + openai → two errors (OpenAI is never usable in a test process)', () => {
    expect(
      envError({ ...ENV1, NODE_ENV: 'test', AI_COMMANDER_PROVIDER: 'openai' }).variables,
    ).toEqual([
      { name: 'OPENAI_ENABLED', reason: 'must be false when NODE_ENV=test' },
      { name: 'AI_COMMANDER_PROVIDER', reason: 'requires OPENAI_ENABLED=true' },
    ]);
  });

  it('OPENAI_ENABLED=true with missing OpenAI variables reports those, not the provider', () => {
    expect(
      names({
        DATABASE_URL: 'file:./x.db',
        OPENAI_ENABLED: 'true',
        AI_COMMANDER_PROVIDER: 'openai',
      }),
    ).toEqual([
      'OPENAI_API_KEY',
      'OPENAI_STRATEGY_MODEL',
      'OPENAI_TACTICAL_MODEL',
      'OPENAI_MAX_COST_PER_SESSION_USD',
    ]);
  });

  it('SWR-006 TC-ENV-03 / Q-22: exact "bot" | "openai"; blank = unset = bot', () => {
    for (const bad of ['OpenAI', 'mock', 'auto', 'bot ', 'BOT', ' openai']) {
      expect(envError({ ...ENV1, AI_COMMANDER_PROVIDER: bad }).message).toBe(
        'Invalid environment: AI_COMMANDER_PROVIDER: must be "bot" or "openai"',
      );
    }
    for (const blank of ['', '   ']) {
      expect(parseEnv({ ...ENV0, AI_COMMANDER_PROVIDER: blank }).aiCommander.provider).toBe('bot');
    }
  });

  it('SWR-006 TC-ENV-04: AI_COMMANDER_MAX_STEPS integer 1..256', () => {
    expect(parseEnv({ ...ENV0, AI_COMMANDER_MAX_STEPS: '1' }).aiCommander.maxSteps).toBe(1);
    expect(parseEnv({ ...ENV0, AI_COMMANDER_MAX_STEPS: '256' }).aiCommander.maxSteps).toBe(256);
    for (const bad of ['0', '257', '-1', '1.5', 'abc']) {
      expect(envError({ ...ENV0, AI_COMMANDER_MAX_STEPS: bad }).message).toBe(
        'Invalid environment: AI_COMMANDER_MAX_STEPS: must be an integer 1..256',
      );
    }
  });

  it('SWR-006 TC-ENV-05: AI_COMMANDER_RUN_DEADLINE_MS integer 1000..120000', () => {
    const deadline = (v: string) =>
      parseEnv({ ...ENV0, AI_COMMANDER_RUN_DEADLINE_MS: v }).aiCommander.runDeadlineMs;
    expect(deadline('1000')).toBe(1000);
    expect(deadline('120000')).toBe(120000);
    for (const bad of ['999', '120001', 'abc', '1500.5']) {
      expect(envError({ ...ENV0, AI_COMMANDER_RUN_DEADLINE_MS: bad }).message).toBe(
        'Invalid environment: AI_COMMANDER_RUN_DEADLINE_MS: must be an integer 1000..120000',
      );
    }
  });

  it('SWR-006 TC-ENV-06: AI_COMMANDER_MODEL_ROLE tactical | strategy', () => {
    expect(parseEnv({ ...ENV0, AI_COMMANDER_MODEL_ROLE: 'strategy' }).aiCommander.modelRole).toBe(
      'strategy',
    );
    for (const bad of ['Tactical', 'fast']) {
      expect(envError({ ...ENV0, AI_COMMANDER_MODEL_ROLE: bad }).message).toBe(
        'Invalid environment: AI_COMMANDER_MODEL_ROLE: must be "tactical" or "strategy"',
      );
    }
  });

  it('AI_COMMANDER_* are checked even with OPENAI_ENABLED=false; all problems at once, ENV_KEYS order, no values', () => {
    const error = envError({
      ...ENV0,
      AI_COMMANDER_PROVIDER: 'sentinel-provider',
      AI_COMMANDER_MODEL_ROLE: 'sentinel-role',
      AI_COMMANDER_MAX_STEPS: 'sentinel-steps',
      AI_COMMANDER_RUN_DEADLINE_MS: 'sentinel-deadline',
    });
    expect(error.variables.map((v) => v.name)).toEqual([
      'AI_COMMANDER_PROVIDER',
      'AI_COMMANDER_MODEL_ROLE',
      'AI_COMMANDER_MAX_STEPS',
      'AI_COMMANDER_RUN_DEADLINE_MS',
    ]);
    for (const text of [error.message, JSON.stringify(error.variables), inspect(error)]) {
      expect(text).not.toMatch(/sentinel/);
    }
  });

  it('loadAppConfig reads AI_COMMANDER_* from the environment like the other keys', () => {
    const config = loadAppConfig({
      dotenvPath: join(tmpdir(), 'swr006-missing.env'),
      env: { ...ENV0, NODE_ENV: 'production', AI_COMMANDER_MAX_STEPS: '7' },
    });
    expect(config.aiCommander.maxSteps).toBe(7);
  });
});

/** SWR-008 plan-backend C-7: TC-INT-09, TC-BUD-09 (+ TC-SEL-09 env part). */
describe('parseEnv — SWR-008 rules context and prompt limit', () => {
  const rules = (v: string | undefined) =>
    parseEnv({ ...ENV0, AI_COMMANDER_RULES_CONTEXT: v }).aiCommander.rulesContext;
  const maxChars = (v: string) =>
    parseEnv({ ...ENV0, AI_COMMANDER_RULES_MAX_CHARS: v }).aiCommander.rulesMaxChars;
  const promptTokens = (v: string) =>
    parseEnv({ ...ENV0, AI_COMMANDER_MAX_PROMPT_TOKENS: v }).aiCommander.maxPromptTokens;

  it('the three variables are schema keys, in this order, after the SWR-006 ones', () => {
    expect(ENV_KEYS.slice(-4)).toEqual([
      'AI_COMMANDER_RUN_DEADLINE_MS',
      'AI_COMMANDER_RULES_CONTEXT',
      'AI_COMMANDER_RULES_MAX_CHARS',
      'AI_COMMANDER_MAX_PROMPT_TOKENS',
    ]);
  });

  it('TC-INT-09: AI_COMMANDER_RULES_CONTEXT on | off; unset / blank → on (A-4)', () => {
    expect(rules('on')).toBe('on');
    expect(rules('off')).toBe('off');
    expect(rules(undefined)).toBe('on');
    expect(rules('')).toBe('on');
    expect(rules('   ')).toBe('on');
    // Also with OpenAI on and the openai commander.
    expect(
      parseEnv({ ...ENV1, AI_COMMANDER_PROVIDER: 'openai', AI_COMMANDER_RULES_CONTEXT: 'off' })
        .aiCommander,
    ).toMatchObject({ provider: 'openai', rulesContext: 'off' });
  });

  it('TC-INT-09: invalid AI_COMMANDER_RULES_CONTEXT (case-sensitive) → named error, no value', () => {
    for (const bad of ['ON', 'Off', 'true', '1', 'of', 'yes', ' on', 'on ']) {
      const error = envError({ ...ENV0, AI_COMMANDER_RULES_CONTEXT: bad });
      expect(error.message, bad).toBe(
        'Invalid environment: AI_COMMANDER_RULES_CONTEXT: must be "on" or "off"',
      );
    }
  });

  it('TC-BUD-09 / TC-SEL-09: AI_COMMANDER_RULES_MAX_CHARS integer 1000..12000, default 6000', () => {
    expect(parseEnv(ENV0).aiCommander.rulesMaxChars).toBe(6000);
    expect(maxChars('1000')).toBe(1000);
    expect(maxChars('12000')).toBe(12000);
    expect(maxChars('6000')).toBe(6000);
    for (const bad of ['999', '12001', '0', '-1', '1.5', 'NaN', 'abc', 'Infinity', '6000chars']) {
      expect(envError({ ...ENV0, AI_COMMANDER_RULES_MAX_CHARS: bad }).message, bad).toBe(
        'Invalid environment: AI_COMMANDER_RULES_MAX_CHARS: must be an integer 1000..12000',
      );
    }
  });

  it('TC-BUD-09: AI_COMMANDER_MAX_PROMPT_TOKENS integer 4000..64000, default 16000', () => {
    expect(parseEnv(ENV0).aiCommander.maxPromptTokens).toBe(16000);
    expect(promptTokens('4000')).toBe(4000);
    expect(promptTokens('64000')).toBe(64000);
    for (const bad of ['3999', '64001', '0', '-16000', '16000.5', 'NaN', 'abc', 'Infinity']) {
      expect(envError({ ...ENV0, AI_COMMANDER_MAX_PROMPT_TOKENS: bad }).message, bad).toBe(
        'Invalid environment: AI_COMMANDER_MAX_PROMPT_TOKENS: must be an integer 4000..64000',
      );
    }
  });

  it('checked always (OpenAI off too); all problems at once, ENV_KEYS order, never the values', () => {
    const error = envError({
      ...ENV0,
      AI_COMMANDER_MAX_PROMPT_TOKENS: 'sentinel-tokens',
      AI_COMMANDER_RULES_CONTEXT: 'sentinel-rules',
      AI_COMMANDER_RULES_MAX_CHARS: 'sentinel-chars',
      AI_COMMANDER_MAX_STEPS: 'sentinel-steps',
    });
    expect(error.variables.map((v) => v.name)).toEqual([
      'AI_COMMANDER_MAX_STEPS',
      'AI_COMMANDER_RULES_CONTEXT',
      'AI_COMMANDER_RULES_MAX_CHARS',
      'AI_COMMANDER_MAX_PROMPT_TOKENS',
    ]);
    for (const text of [error.message, JSON.stringify(error.variables), inspect(error)]) {
      expect(text).not.toMatch(/sentinel/);
    }
  });

  it('knowledgeBaseRoot never comes from the environment: parseEnv / loadAppConfig return null', () => {
    expect(parseEnv(ENV1).knowledgeBaseRoot).toBeNull();
    const config = loadAppConfig({
      dotenvPath: join(tmpdir(), 'swr008-missing.env'),
      env: {
        ...ENV0,
        NODE_ENV: 'production',
        KNOWLEDGE_BASE_ROOT: '/sentinel',
        AI_COMMANDER_RULES_MAX_CHARS: '7000',
        AI_COMMANDER_MAX_PROMPT_TOKENS: '20000',
        AI_COMMANDER_RULES_CONTEXT: 'off',
      },
    });
    expect(config.knowledgeBaseRoot).toBeNull();
    expect(config.aiCommander).toMatchObject({
      rulesContext: 'off',
      rulesMaxChars: 7000,
      maxPromptTokens: 20000,
    });
  });
});

describe('no values in errors or serialised config (AC-10)', () => {
  it('TC-ENV-15: sentinel values never appear in message / JSON / inspect / variables', () => {
    const error = envError({
      DATABASE_URL: 'file:./sentinel-db-xyz.db',
      PORT: 'sentinel-port-xyz',
      NODE_ENV: 'sentinel-node-xyz',
      OPENAI_ENABLED: 'sentinel-flag-xyz',
      OPENAI_API_KEY: SENTINEL_KEY,
      OPENAI_MAX_COST_PER_SESSION_USD: 'sentinel-cost-xyz',
    });
    const errorOn = envError({
      ...ENV1,
      OPENAI_API_KEY: `${SENTINEL_KEY} with-space`,
      OPENAI_TACTICAL_MODEL: undefined,
      OPENAI_STRATEGY_MODEL: 'sentinel model xyz',
      OPENAI_MAX_COST_PER_SESSION_USD: 'sentinel-cost-xyz',
      OPENAI_TIMEOUT_MS: 'sentinel-timeout-xyz',
      OPENAI_MAX_RETRIES: 'sentinel-retries-xyz',
    });
    expect(errorOn.variables.map((v) => v.name)).toEqual([
      'OPENAI_API_KEY',
      'OPENAI_STRATEGY_MODEL',
      'OPENAI_TACTICAL_MODEL',
      'OPENAI_MAX_COST_PER_SESSION_USD',
      'OPENAI_TIMEOUT_MS',
      'OPENAI_MAX_RETRIES',
    ]);
    for (const e of [error, errorOn]) {
      const texts = [
        e.message,
        String(e),
        e.stack ?? '',
        JSON.stringify(e),
        JSON.stringify(e.variables),
        inspect(e, { depth: 10 }),
      ];
      for (const text of texts) {
        expect(text).not.toMatch(/sentinel|SENTINEL|sk-/);
      }
      expect(e.cause).toBeUndefined();
    }
  });

  it('Secret is redacted in String / template / JSON / inspect', () => {
    const secret = new Secret(SENTINEL_KEY);
    expect(String(secret)).toBe('[redacted]');
    expect(`${secret}`).toBe('[redacted]');
    expect(JSON.stringify({ secret })).toBe('{"secret":"[redacted]"}');
    expect(inspect(secret)).toBe('Secret([redacted])');
    expect(Object.keys(secret)).toEqual([]);
    expect(secret.reveal()).toBe(SENTINEL_KEY);
  });

  it('an enabled config does not leak the key through JSON or inspect', () => {
    const config = parseEnv(ENV1);
    expect(JSON.stringify(config)).not.toContain(SENTINEL_KEY);
    expect(inspect(config, { depth: 10 })).not.toContain(SENTINEL_KEY);
    expect(JSON.stringify(config)).toContain('"apiKey":"[redacted]"');
  });
});

describe('loadAppConfig (.env handling, AM-BE-3)', () => {
  const dir = mkdtempSync(join(tmpdir(), 'swr005b-env-'));
  const dotenvPath = join(dir, '.env');
  writeFileSync(
    dotenvPath,
    [
      'DATABASE_URL="file:./from-file.db"',
      'PORT=4100',
      'OPENAI_ENABLED=false',
      `OPENAI_API_KEY=${SENTINEL_KEY}`,
    ].join('\n'),
  );
  afterAll(() => rmSync(dir, { recursive: true, force: true }));

  it('NODE_ENV=test never reads the .env file', () => {
    const error = (() => {
      try {
        loadAppConfig({ dotenvPath, env: { NODE_ENV: 'test' } });
      } catch (e) {
        return e as EnvValidationError;
      }
      throw new Error('expected a validation error');
    })();
    expect(error.variables.map((v) => v.name)).toEqual(['DATABASE_URL', 'OPENAI_ENABLED']);
  });

  it('outside test: reads the file; variables already set win; process.env is not modified', () => {
    const before = { ...process.env };
    const config = loadAppConfig({
      dotenvPath,
      env: { NODE_ENV: 'development', PORT: '4200' },
    });
    expect(config.databaseUrl).toBe('file:./from-file.db');
    expect(config.port).toBe(4200);
    expect(config.openai).toMatchObject({ enabled: false, apiKeyConfigured: true });
    expect(process.env).toEqual(before);
  });

  it('a missing .env file is fine when the environment is complete', () => {
    const config = loadAppConfig({
      dotenvPath: join(dir, 'missing.env'),
      env: { ...ENV0, NODE_ENV: 'production' },
    });
    expect(config.nodeEnv).toBe('production');
  });
});
