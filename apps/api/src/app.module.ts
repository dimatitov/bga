import { Module, type DynamicModule } from '@nestjs/common';
import type { GameDefinition, ServerGameModule } from '@bga/platform';
import {
  CLOCK,
  ID_GENERATOR,
  uuidGenerator,
  wallClock,
  type Clock,
  type IdGenerator,
} from './common/runtime.tokens';
import { GameRegistryModule } from './game-registry/game-registry.module';
import { HealthModule } from './health/health.module';
import { PersistenceModule } from './persistence/persistence.module';
import { SessionsModule } from './sessions/sessions.module';

export interface AppModuleOptions {
  databaseUrl: string;
  clock?: Clock;
  idGenerator?: IdGenerator;
  gameModules: readonly ServerGameModule[];
  gameDefinitions: readonly GameDefinition[];
}

@Module({})
export class AppModule {
  static forRoot(options: AppModuleOptions): DynamicModule {
    return {
      module: AppModule,
      global: true,
      imports: [
        PersistenceModule.forRoot({ databaseUrl: options.databaseUrl }),
        GameRegistryModule.forRoot({
          modules: options.gameModules,
          definitions: options.gameDefinitions,
        }),
        HealthModule,
        SessionsModule,
      ],
      providers: [
        { provide: CLOCK, useValue: options.clock ?? wallClock },
        { provide: ID_GENERATOR, useValue: options.idGenerator ?? uuidGenerator },
      ],
      exports: [CLOCK, ID_GENERATOR],
    };
  }
}
