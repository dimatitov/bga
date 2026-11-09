/**
 * SWR-005B W1 (AC-01, plan-backend §2.2): fail-fast bootstrap. Invalid environment → exactly one stderr line
 * `Invalid environment: …` without values, exit(1), createApp never called; valid → listen(config.port).
 */
import type { INestApplication } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { runBootstrap, UNEXPECTED_CONFIG_ERROR, type BootstrapDeps } from '../src/bootstrap';
import { parseEnv } from '../src/config/env';
import { testConfig } from './support/test-config';

const SENTINEL_KEY = 'sk-test-SENTINEL-bootstrap-0123456789';

class ExitCalled extends Error {
  constructor(readonly code: number) {
    super(`exit(${code})`);
  }
}

function harness(loadConfig: BootstrapDeps['loadConfig']) {
  const stderr: string[] = [];
  const listen = vi.fn(async () => undefined);
  const createApp = vi.fn(async () => ({ listen }) as unknown as INestApplication);
  const deps: BootstrapDeps = {
    loadConfig,
    createApp,
    stderr: (line) => stderr.push(line),
    exit: (code) => {
      throw new ExitCalled(code);
    },
  };
  return { deps, stderr, listen, createApp };
}

describe('runBootstrap', () => {
  it('invalid environment → one line without values, exit(1), no createApp', async () => {
    const h = harness(() =>
      parseEnv({
        DATABASE_URL: 'file:./x.db',
        OPENAI_ENABLED: 'true',
        OPENAI_API_KEY: SENTINEL_KEY,
        OPENAI_STRATEGY_MODEL: 'gpt-6.1-sol',
        OPENAI_MAX_COST_PER_SESSION_USD: 'sentinel-cost',
      }),
    );
    await expect(runBootstrap(h.deps)).rejects.toEqual(new ExitCalled(1));
    expect(h.stderr).toEqual([
      'Invalid environment: OPENAI_TACTICAL_MODEL: is required when OPENAI_ENABLED=true; ' +
        'OPENAI_MAX_COST_PER_SESSION_USD: must be a number > 0 and <= 5',
    ]);
    expect(h.stderr.join('\n')).not.toMatch(/sentinel|SENTINEL|sk-/);
    expect(h.createApp).not.toHaveBeenCalled();
  });

  it('an unexpected error while loading → fixed line (its message is not printed), exit(1)', async () => {
    const h = harness(() => {
      throw new Error(`boom ${SENTINEL_KEY}`);
    });
    await expect(runBootstrap(h.deps)).rejects.toEqual(new ExitCalled(1));
    expect(h.stderr).toEqual([UNEXPECTED_CONFIG_ERROR]);
    expect(h.createApp).not.toHaveBeenCalled();
  });

  it('valid environment → createApp({ config }) and listen(config.port)', async () => {
    const config = testConfig({ port: 4321 });
    const h = harness(() => config);
    await runBootstrap(h.deps);
    expect(h.createApp).toHaveBeenCalledWith({ config });
    expect(h.listen).toHaveBeenCalledWith(4321);
    expect(h.stderr).toEqual([]);
  });
});
