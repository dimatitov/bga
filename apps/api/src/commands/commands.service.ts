import { Inject, Injectable, Logger } from '@nestjs/common';
import { CommandEnvelopeSchema, CommandOkSchema, type CommandOk } from '@swr/contracts';
import { applyCommand, toPlayerEvents, toPlayerView } from '@swr/game-core';
import { ApiError } from '../common/api-error';
import { CLOCK, type Clock } from '../common/runtime.tokens';
import { parseStoredState } from '../games/game-state.parser';
import { GamesRepository } from '../games/games.repository';
import { GamesService } from '../games/games.service';

/**
 * Command pipeline (plan-backend §6.4). Check order (A-5): 404 → 400 → 409 → 422.
 * The body is validated here, after the game lookup — not by a pipe (D-7).
 */
@Injectable()
export class CommandsService {
  private readonly logger = new Logger('CommandsService');

  constructor(
    private readonly games: GamesService,
    private readonly repo: GamesRepository,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async execute(gameId: string, body: unknown): Promise<CommandOk> {
    // 1. 404
    const row = await this.games.findRow(gameId);

    // 2. 400
    const parsed = CommandEnvelopeSchema.safeParse(body);
    if (!parsed.success) throw ApiError.fromZod(parsed.error);
    const envelope = parsed.data;

    // 3. snapshot (corrupt → 500 via the filter)
    const state = parseStoredState(row);

    // 4. 409 fast path
    if (envelope.expectedVersion !== row.version) throw ApiError.versionConflict(row.version);

    // 5. rules (game-core): 400 / 409 / 422
    const now = this.clock.now();
    const result = applyCommand(state, envelope, { now });
    if (!result.ok) throw ApiError.fromCore(result.error);

    // 6. atomic commit with optimistic concurrency
    const outcome = await this.repo.commitCommand(
      gameId,
      envelope.expectedVersion,
      result.state,
      result.events,
      now,
    );
    if (!outcome.ok) {
      const current = (await this.repo.currentVersion(gameId)) ?? row.version;
      this.logger.warn(`gameId=${gameId} code=VERSION_CONFLICT status=409`);
      throw ApiError.versionConflict(current);
    }

    // 7. only the human side's view leaves the server
    const viewer = result.state.setup.humanFaction;
    return CommandOkSchema.parse({
      ok: true,
      view: toPlayerView(result.state, viewer),
      events: toPlayerEvents(result.events, result.state, viewer),
    });
  }
}
