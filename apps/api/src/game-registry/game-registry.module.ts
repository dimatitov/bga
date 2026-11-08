import { Module, type DynamicModule } from '@nestjs/common';
import { createGameRegistry, type GameRegistryInput } from './game-registry';
import { GAME_REGISTRY } from './game-registry.tokens';

@Module({})
export class GameRegistryModule {
  /** Builds the registry eagerly: an inconsistent registry fails the app start. */
  static forRoot(input: GameRegistryInput): DynamicModule {
    const registry = createGameRegistry(input);
    return {
      module: GameRegistryModule,
      global: true,
      providers: [{ provide: GAME_REGISTRY, useValue: registry }],
      exports: [GAME_REGISTRY],
    };
  }
}
