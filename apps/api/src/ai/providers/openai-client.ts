/**
 * The ONLY place that constructs the OpenAI client and reveals the API key (SWR-005B, plan-backend §4.1; TC-A-02).
 * Every option the SDK would otherwise read from the environment is passed explicitly, so `OPENAI_BASE_URL`,
 * `OPENAI_ORG_ID`, `OPENAI_PROJECT_ID`, `OPENAI_LOG` cannot redirect the key or make the SDK log. Retries are ours
 * (`maxRetries: 0`, plan §5.4). Under `nodeEnv: 'test'` a fake fetch is mandatory: a test can never reach the network.
 */
import OpenAI from 'openai';
import type { NodeEnv, OpenAIConfig } from '../../config/env';

export const OPENAI_BASE_URL = 'https://api.openai.com/v1';

export type EnabledOpenAIConfig = Extract<OpenAIConfig, { enabled: true }>;
export type OpenAIClient = OpenAI;

export interface OpenAIClientOptions {
  openai: EnabledOpenAIConfig;
  nodeEnv: NodeEnv;
  /** Test-only fake fetch (AiTestOverrides.openaiFetch); `undefined` → global fetch. */
  fetch?: typeof fetch;
}

/** Thrown when an enabled OpenAI config would run under `nodeEnv: 'test'` without a fake fetch. */
export class OpenAIClientConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'OpenAIClientConfigError';
  }
}

export function createOpenAIClient(options: OpenAIClientOptions): OpenAIClient {
  if (!options.openai.enabled) {
    throw new OpenAIClientConfigError('OpenAI is disabled');
  }
  if (options.nodeEnv === 'test' && options.fetch === undefined) {
    throw new OpenAIClientConfigError('A fake fetch is required for OpenAI under NODE_ENV=test');
  }
  return new OpenAI({
    apiKey: options.openai.apiKey.reveal(),
    baseURL: OPENAI_BASE_URL,
    organization: null,
    project: null,
    webhookSecret: null,
    maxRetries: 0,
    timeout: options.openai.timeoutMs,
    logLevel: 'off',
    fetch: options.fetch,
  });
}

/** Lazily creates the client on first use (and only then); later calls return the same instance. */
export function lazyOpenAIClient(options: OpenAIClientOptions): () => OpenAIClient {
  let client: OpenAIClient | undefined;
  return () => {
    client ??= createOpenAIClient(options);
    return client;
  };
}
