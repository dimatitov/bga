import type { INestApplication } from '@nestjs/common';
import type { CreateAppOptions } from './app.factory';
import { EnvValidationError, type AppConfig } from './config/env';

export interface BootstrapDeps {
  loadConfig: () => AppConfig;
  createApp: (options: CreateAppOptions) => Promise<INestApplication>;
  stderr: (line: string) => void;
  exit: (code: number) => never;
}

/** Fixed text for a non-validation failure while reading the environment (its message may hold values). */
export const UNEXPECTED_CONFIG_ERROR =
  'Invalid environment: unexpected error while reading configuration';

/**
 * SWR-005B (AC-01, plan-backend §2.2): fail-fast start. An invalid environment prints exactly one line
 * `Invalid environment: <VAR>: <reason>; …` (names and fixed reasons, never values) and exits with code 1
 * before the app is created; otherwise the app listens on `config.port`.
 */
export async function runBootstrap(deps: BootstrapDeps): Promise<void> {
  let config: AppConfig;
  try {
    config = deps.loadConfig();
  } catch (error) {
    deps.stderr(error instanceof EnvValidationError ? error.message : UNEXPECTED_CONFIG_ERROR);
    return deps.exit(1);
  }
  const app = await deps.createApp({ config });
  await app.listen(config.port);
}
