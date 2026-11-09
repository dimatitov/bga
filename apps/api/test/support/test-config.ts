import {
  DEFAULT_OPENAI_MAX_RETRIES,
  DEFAULT_OPENAI_TIMEOUT_MS,
  DEFAULT_PORT,
  type AppConfig,
  type OpenAIConfig,
} from '../../src/config/env';

/** OpenAI switched off — the only mode of ordinary api tests (plan-backend §2.5). */
export const OPENAI_DISABLED: OpenAIConfig = Object.freeze({
  enabled: false,
  apiKeyConfigured: false,
  strategyModel: null,
  tacticalModel: null,
  maxCostPerSessionUsd: null,
  timeoutMs: DEFAULT_OPENAI_TIMEOUT_MS,
  maxRetries: DEFAULT_OPENAI_MAX_RETRIES,
});

export interface TestConfigOverrides {
  databaseUrl?: string;
  port?: number;
  nodeEnv?: AppConfig['nodeEnv'];
  openai?: OpenAIConfig;
}

/**
 * An `AppConfig` for tests, built directly (never from `process.env` or `.env`): `nodeEnv: 'test'`, OpenAI off.
 * Tests of the OpenAI provider pass their own `openai` (enabled, sentinel key) together with a fake fetch.
 */
export function testConfig(overrides: TestConfigOverrides = {}): AppConfig {
  return Object.freeze({
    nodeEnv: overrides.nodeEnv ?? 'test',
    databaseUrl: overrides.databaseUrl ?? 'file:./never-opened.db',
    port: overrides.port ?? DEFAULT_PORT,
    openai: overrides.openai ?? OPENAI_DISABLED,
  });
}
