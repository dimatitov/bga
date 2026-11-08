import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  CommandEnvelopeFrameSchema,
  SessionCommandOkSchema,
  SessionStatusSchema,
  type SessionCommandOk,
  type SessionStatus,
} from '@bga/platform';
import { ApiError } from '../common/api-error';
import { CLOCK, type Clock } from '../common/runtime.tokens';
import { SessionsRepository } from './sessions.repository';
import { SessionsService } from './sessions.service';

/**
 * Command pipeline (D-6, AM-4): 404 → 400 (envelope frame) → 422 (game unavailable) → 500 (corrupt
 * snapshot / status / settings mismatch) → game module (400 → 409 → 422) → commit (409 on a lost race).
 * The commit rewrites `Session.setup` from the new state (`module.setupOf`, review #1) and `Session.status`
 * from `module.statusOf(newState)` (SWR-005, AM-BE-1; invalid → 500) in the same transaction.
 * The body is validated here, after the session lookup — not by a pipe.
 */
@Injectable()
export class SessionCommandsService {
  private readonly logger = new Logger('SessionCommandsService');

  constructor(
    private readonly sessions: SessionsService,
    private readonly repo: SessionsRepository,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async execute(sessionId: string, body: unknown): Promise<SessionCommandOk> {
    const row = await this.sessions.findRow(sessionId);

    const frame = CommandEnvelopeFrameSchema.safeParse(body);
    if (!frame.success) throw ApiError.fromZod(frame.error);

    const module = this.sessions.requireModule(row);
    const state = this.sessions.parseSnapshot(row, module);
    // Review #1: both copies of the settings must agree before anything is written (mismatch → 500).
    this.sessions.checkedSettings(row, module, state);
    const previousStatus = this.sessions.parseStatus(row);

    const now = this.clock.now();
    const result = module.applyCommand(state, body, { now });
    if (!result.ok) throw ApiError.fromModule(result.error);

    const status = this.nextStatus(row, module.statusOf(result.state));
    const expectedVersion = module.version(state);
    const committed = await this.repo.commit({
      id: row.id,
      expectedVersion,
      setup: JSON.stringify(module.setupOf(result.state)),
      state: JSON.stringify(result.state),
      version: module.version(result.state),
      status,
      events: result.events,
      now,
    });
    if (!committed.ok) {
      const current = (await this.repo.currentVersion(row.id)) ?? expectedVersion;
      this.logger.warn(`sessionId=${row.id} gameId=${row.gameId} code=VERSION_CONFLICT status=409`);
      throw ApiError.versionConflict(current);
    }

    if (status !== previousStatus) {
      // Only the transition — never state data (hidden information stays out of logs).
      this.logger.log(
        `sessionId=${row.id} gameId=${row.gameId} code=STATUS_CHANGED ${previousStatus}→${status}`,
      );
    }

    return SessionCommandOkSchema.parse({
      ok: true,
      view: module.toPlayerView(result.state, { status }),
      events: module.toPlayerEvents(result.events, result.state),
    });
  }

  /** A status the module returned that is not a `SessionStatus` is a server bug → 500 INTERNAL. */
  private nextStatus(row: { id: string; gameId: string }, raw: unknown): SessionStatus {
    const parsed = SessionStatusSchema.safeParse(raw);
    if (!parsed.success) {
      this.logger.error(`sessionId=${row.id} gameId=${row.gameId} code=INVALID_STATUS status=500`);
      throw ApiError.internal();
    }
    return parsed.data;
  }
}
