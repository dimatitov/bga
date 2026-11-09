import { Module, type DynamicModule } from '@nestjs/common';
import type { GameDefinition, ServerGameModule } from '@bga/platform';
import { AiModule } from './ai/ai.module';
import type { AiTestOverrides } from './ai/ai.types';
import {
  CLOCK,
  ID_GENERATOR,
  uuidGenerator,
  wallClock,
  type Clock,
  type IdGenerator,
} from './common/runtime.tokens';
import { APP_CONFIG } from './config/app-config.tokens';
import type { AppConfig } from './config/env';
import { DevAiModule } from './dev/ai/dev-ai.module';
import { GameRegistryModule } from './game-registry/game-registry.module';
import { HealthModule } from './health/health.module';
import { PersistenceModule } from './persistence/persistence.module';
import { SessionsModule } from './sessions/sessions.module';

export interface AppModuleOptions {
  /** Validated configuration (config/env.ts); available to providers as `APP_CONFIG`. */
  config: AppConfig;
  clock?: Clock;
  idGenerator?: IdGenerator;
  gameModules: readonly ServerGameModule[];
  gameDefinitions: readonly GameDefinition[];
  /** Test-only AI overrides (SWR-005B §5.9); never set in production (createApp refuses). */
  ai?: AiTestOverrides;
}

/** Dev-only modules exist only outside production (SWR-005B BD-8): in production their routes are 404. */
export function isDevRoutesEnabled(config: AppConfig): boolean {
  return config.nodeEnv !== 'production';
}

@Module({})
export class AppModule {
  static forRoot(options: AppModuleOptions): DynamicModule {
    return {
      module: AppModule,
      global: true,
      imports: [
        PersistenceModule.forRoot({ databaseUrl: options.config.databaseUrl }),
        GameRegistryModule.forRoot({
          modules: options.gameModules,
          definitions: options.gameDefinitions,
        }),
        HealthModule,
        SessionsModule,
        AiModule.forRoot({ config: options.config, overrides: options.ai }),
        ...(isDevRoutesEnabled(options.config)
          ? [DevAiModule.forRoot({ rateLimit: options.ai?.devRateLimit })]
          : []),
      ],
      providers: [
        { provide: APP_CONFIG, useValue: options.config },
        { provide: CLOCK, useValue: options.clock ?? wallClock },
        { provide: ID_GENERATOR, useValue: options.idGenerator ?? uuidGenerator },
      ],
      exports: [APP_CONFIG, CLOCK, ID_GENERATOR],
    };
  }
}
