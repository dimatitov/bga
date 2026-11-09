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
