import { GameDefinitionSchema, type GameDefinition, type ServerGameModule } from '@bga/platform';
import { ApiError } from '../common/api-error';

export interface GameRegistryInput {
  modules: readonly ServerGameModule[];
  definitions: readonly GameDefinition[];
}

/**
 * Throws (= the app fails to start) when the registry is inconsistent:
 * unique definition ids; every definition passes `GameDefinitionSchema`; every module has a unique id,
 * is listed in `definitions` (same object data) and is `available`; every `available` game has a module;
 * `coming_soon` games have none.
 */
export function validateRegistry({ modules, definitions }: GameRegistryInput): void {
  const byId = new Map<string, GameDefinition>();
  for (const definition of definitions) {
    const parsed = GameDefinitionSchema.safeParse(definition);
    if (!parsed.success) {
      throw new Error(`game registry: invalid definition '${String(definition?.id)}'`);
    }
    if (byId.has(definition.id)) {
      throw new Error(`game registry: duplicate definition '${definition.id}'`);
    }
    byId.set(definition.id, definition);
  }

  const moduleIds = new Set<string>();
  for (const module of modules) {
    const id = module.definition.id;
    if (moduleIds.has(id)) throw new Error(`game registry: duplicate module '${id}'`);
    moduleIds.add(id);
    const definition = byId.get(id);
    if (!definition) throw new Error(`game registry: module '${id}' has no definition`);
    if (JSON.stringify(definition) !== JSON.stringify(module.definition)) {
      throw new Error(`game registry: module '${id}' definition differs from the catalogue`);
    }
    if (definition.status !== 'available') {
      throw new Error(
        `game registry: module '${id}' is registered for a '${definition.status}' game`,
      );
    }
  }

  for (const definition of definitions) {
    if (definition.status === 'available' && !moduleIds.has(definition.id)) {
      throw new Error(`game registry: available game '${definition.id}' has no server module`);
    }
  }
}

/** Read-only lookup over the static registries (D-5). The session service knows games only through it. */
export class GameRegistry {
  private readonly definitionsById: ReadonlyMap<string, GameDefinition>;
  private readonly modulesById: ReadonlyMap<string, ServerGameModule>;

  constructor(input: GameRegistryInput) {
    this.definitionsById = new Map(input.definitions.map((d) => [d.id, d]));
    this.modulesById = new Map(input.modules.map((m) => [m.definition.id, m]));
  }

  definition(gameId: string): GameDefinition | undefined {
    return this.definitionsById.get(gameId);
  }

  module(gameId: string): ServerGameModule | undefined {
    return this.modulesById.get(gameId);
  }

  /** For new sessions: unknown game → 404 `errors.gameNotFound`; coming_soon / no module → 422 `GAME_UNAVAILABLE`. */
  requireAvailable(gameId: string): ServerGameModule {
    const definition = this.definition(gameId);
    if (!definition) throw ApiError.gameNotFound();
    const module = this.module(gameId);
    if (definition.status !== 'available' || !module) throw ApiError.gameUnavailable();
    return module;
  }
}

/** Validates (throws on an inconsistent registry) and builds the registry. */
export function createGameRegistry(input: GameRegistryInput): GameRegistry {
  validateRegistry(input);
  return new GameRegistry(input);
}
