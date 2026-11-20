/**
 * SWR-008 C-8: game id → `RulesContextProvider`, built ONCE at server start (fail fast) from the optional
 * `ServerGameModule.rules` of each game. Game-agnostic: the knowledge base directory and its parsing belong to the
 * game (`GameRulesSupport`); this module only reads the files (`KnowledgeBaseLoader`) and checks the configuration.
 *
 * - The knowledge bases are loaded iff `aiCommander.provider === 'openai' && aiCommander.rulesContext === 'on'`
 *   (Q-BE-2): otherwise the registry is empty and nothing is read from disk.
 * - A game without `rules` gets no provider (no rules block; nothing required).
 * - Any problem (unreadable / invalid / inconsistent knowledge base, `knowledgeBaseRoot` missing for a relative
 *   directory, `rulesMaxChars` below the mandatory pinned lines — QD-3) throws `RulesContextStartupError`, so
 *   `createApp` rejects and the server does not start. Messages hold paths, ids and issue codes — never secrets.
 * - Never sees a game state, never applies or builds a command (TC-ARB-07).
 */
import { isAbsolute, join } from 'node:path';
import {
  RULES_CONTEXT_LIMITS,
  type RulesContextProvider,
  type ServerGameModule,
} from '@bga/platform';
import type { AppConfig } from '../config/env';
import { readKnowledgeBaseDir, type KnowledgeBaseLoader } from './knowledge-base.loader';

/** Test-only overrides of the rules context (TR-1); refused by `createApp` in production. */
export interface RulesContextTestOverrides {
  /** Replaces the `node:fs` loader (broken knowledge bases, load counter). */
  loader?: KnowledgeBaseLoader;
}

export interface RulesContextRegistryInput {
  config: AppConfig;
  modules: readonly ServerGameModule[];
  /** Defaults to `readKnowledgeBaseDir` (TR-1). */
  loader?: KnowledgeBaseLoader;
}

/** The rules context of a game could not be built. Message: `rules knowledge base of game <id>: <cause>`. */
export class RulesContextStartupError extends Error {
  readonly gameId: string;

  constructor(gameId: string, cause: string) {
    super(`rules knowledge base of game ${gameId}: ${cause}`);
    this.name = 'RulesContextStartupError';
    this.gameId = gameId;
  }
}

export class RulesContextRegistry {
  readonly #providers: ReadonlyMap<string, RulesContextProvider>;
  /** Game ids whose provider was built (diagnostics/tests), in module order. */
  readonly gameIds: readonly string[];

  constructor(providers: ReadonlyMap<string, RulesContextProvider>) {
    this.#providers = providers;
    this.gameIds = Object.freeze([...providers.keys()]);
    Object.freeze(this);
  }

  /** The provider of a game, or `null` (no `rules`, or rules not loaded: bot / `rulesContext: 'off'`). */
  forGame(gameId: string): RulesContextProvider | null {
    return this.#providers.get(gameId) ?? null;
  }
}

/** Whether the configuration uses rules at all (Q-BE-2: only the openai commander with rules on). */
export function rulesContextEnabled(config: AppConfig): boolean {
  return config.aiCommander.provider === 'openai' && config.aiCommander.rulesContext === 'on';
}

function describeError(error: unknown): string {
  if (error instanceof Error) return `${error.name}: ${error.message}`;
  return 'unexpected non-error value thrown';
}

function buildProvider(
  module: ServerGameModule,
  config: AppConfig,
  loader: KnowledgeBaseLoader,
): RulesContextProvider {
  const gameId = module.definition.id;
  const rules = module.rules!;
  const dir = rules.knowledgeBaseDir;
  let absoluteDir: string;
  if (isAbsolute(dir)) {
    absoluteDir = dir;
  } else if (config.knowledgeBaseRoot === null) {
    throw new RulesContextStartupError(
      gameId,
      `knowledgeBaseRoot is not set, the relative directory ${dir} cannot be resolved`,
    );
  } else {
    absoluteDir = join(config.knowledgeBaseRoot, dir);
  }

  let provider: RulesContextProvider;
  try {
    provider = rules.createRulesContextProvider(loader(absoluteDir));
  } catch (error) {
    throw new RulesContextStartupError(gameId, describeError(error));
  }

  // QD-3: the size limit must hold the mandatory (pinned) lines; otherwise every decision would fail.
  const maxChars = config.aiCommander.rulesMaxChars;
  if (!Number.isInteger(maxChars) || maxChars < 1 || maxChars > RULES_CONTEXT_LIMITS.maxCharsMax) {
    throw new RulesContextStartupError(
      gameId,
      `rulesMaxChars must be an integer 1..${RULES_CONTEXT_LIMITS.maxCharsMax}`,
    );
  }
  if (maxChars < provider.requiredChars) {
    throw new RulesContextStartupError(
      gameId,
      `rulesMaxChars ${maxChars} is below the ${provider.requiredChars} characters of the mandatory rules`,
    );
  }
  return provider;
}

/** Synchronous, fail fast (throws → `createApp` rejects, the server does not start). Loads each base once. */
export function createRulesContextRegistry(input: RulesContextRegistryInput): RulesContextRegistry {
  const providers = new Map<string, RulesContextProvider>();
  if (rulesContextEnabled(input.config)) {
    const loader = input.loader ?? readKnowledgeBaseDir;
    for (const module of input.modules) {
      if (module.rules === undefined) continue;
      const gameId = module.definition.id;
      if (providers.has(gameId)) continue; // duplicate ids are rejected by the game registry
      providers.set(gameId, buildProvider(module, input.config, loader));
    }
  }
  return new RulesContextRegistry(providers);
}
