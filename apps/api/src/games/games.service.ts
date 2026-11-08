import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  CreateGameResponseSchema,
  GameIdParamSchema,
  ListGamesResponseSchema,
  MAX_GAMES_LISTED,
  PlayerViewSchema,
  type CreateGameResponse,
  type GameSetup,
  type ListGamesResponse,
  type PlayerView,
  type Scenario,
} from '@swr/contracts';
import { createGame, toPlayerView } from '@swr/game-core';
import { ApiError } from '../common/api-error';
import {
  CLOCK,
  ID_GENERATOR,
  SCENARIO,
  type Clock,
  type IdGenerator,
} from '../common/runtime.tokens';
import { parseStoredState } from './game-state.parser';
import { GamesRepository, type GameRow } from './games.repository';

@Injectable()
export class GamesService {
  private readonly logger = new Logger('GamesService');

  constructor(
    private readonly repo: GamesRepository,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(ID_GENERATOR) private readonly ids: IdGenerator,
    @Inject(SCENARIO) private readonly scenario: Scenario,
  ) {}

  /** `setup` is already validated by the controller pipe (GameSetupSchema; A-7 defaults applied). */
  async create(setup: GameSetup): Promise<CreateGameResponse> {
    const now = this.clock.now();
    const state = createGame(setup, this.scenario, { gameId: this.ids.gameId(), now });
    await this.repo.insertGame(state, now);
    // Only the human side's PlayerView leaves the server (A-3).
    return CreateGameResponseSchema.parse({
      gameId: state.id,
      view: toPlayerView(state, state.setup.humanFaction),
    });
  }

  /**
   * Summaries of the most recent games. A corrupt snapshot must not break the whole list:
   * such rows are skipped and logged with gameId + code only (never the stored text).
   * Opening that game directly still answers 500 INTERNAL.
   */
  async list(): Promise<ListGamesResponse> {
    const rows = await this.repo.listRecent(MAX_GAMES_LISTED);
    const summaries: ListGamesResponse = [];
    for (const row of rows) {
      let state;
      try {
        state = parseStoredState(row);
      } catch {
        this.logger.warn(`gameId=${row.id} code=CORRUPT_SNAPSHOT skipped in list`);
        continue;
      }
      summaries.push({
        gameId: row.id,
        setup: state.setup,
        round: state.round,
        phase: state.phase,
        updatedAt: row.updatedAt.toISOString(),
      });
    }
    return ListGamesResponseSchema.parse(summaries);
  }

  async getView(id: string): Promise<PlayerView> {
    const row = await this.findRow(id);
    const state = parseStoredState(row);
    return PlayerViewSchema.parse(toPlayerView(state, state.setup.humanFaction));
  }

  /** Malformed ids are treated as unknown (404 first, A-5). */
  async findRow(id: string): Promise<GameRow> {
    if (!GameIdParamSchema.safeParse(id).success) throw ApiError.notFound();
    const row = await this.repo.findById(id);
    if (!row) throw ApiError.notFound();
    return row;
  }
}
