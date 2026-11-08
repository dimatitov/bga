import { Module, type DynamicModule } from '@nestjs/common';
import { mockScenario } from '@swr/game-data';
import { CommandsModule } from './commands/commands.module';
import {
  CLOCK,
  ID_GENERATOR,
  SCENARIO,
  systemClock,
  uuidGenerator,
  type Clock,
  type IdGenerator,
} from './common/runtime.tokens';
import { GamesModule } from './games/games.module';
import { HealthModule } from './health/health.module';
import { PersistenceModule } from './persistence/persistence.module';

export interface AppModuleOptions {
  databaseUrl: string;
  clock?: Clock;
  idGenerator?: IdGenerator;
}

@Module({})
export class AppModule {
  static forRoot(options: AppModuleOptions): DynamicModule {
    return {
      module: AppModule,
      global: true,
      imports: [
        PersistenceModule.forRoot({ databaseUrl: options.databaseUrl }),
        HealthModule,
        GamesModule,
        CommandsModule,
      ],
      providers: [
        { provide: CLOCK, useValue: options.clock ?? systemClock },
        { provide: ID_GENERATOR, useValue: options.idGenerator ?? uuidGenerator },
        { provide: SCENARIO, useValue: mockScenario },
      ],
      exports: [CLOCK, ID_GENERATOR, SCENARIO],
    };
  }
}
