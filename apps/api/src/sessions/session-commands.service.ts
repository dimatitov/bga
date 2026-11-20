import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  CommandEnvelopeFrameSchema,
  RunAutomationRequestSchema,
  SessionCommandOkSchema,
  type ServerGameModule,
  type SessionCommandOk,
  type SessionEventRecord,
  type SessionStatus,
} from '@bga/platform';
import { ApiError } from '../common/api-error';
import { CLOCK, type Clock } from '../common/runtime.tokens';
import { AutomationRunner } from './automation/automation-runner.service';
import { settleRun, type SettledRun } from './automation/settle-run';
import { commitState, statusAfter } from './session-writer';
import { SessionsRepository, type SessionRow } from './sessions.repository';
import { SessionsService } from './sessions.service';

/**
 * Command pipeline (D-6, AM-4): 404 → 400 (envelope frame) → 422 (game unavailable) → 500 (corrupt
 * snapshot / status / settings mismatch) → game module (400 → 409 → 422) → commit (409 on a lost race).
 * The commit rewrites `Session.setup` from the new state (`module.setupOf`, review #1) and `Session.status`
 * from `module.statusOf(newState)` (SWR-005, AM-BE-1; invalid → 500) in the same transaction.
 * The body is validated here, after the session lookup — not by a pipe.
 *
 * SWR-006 (plan-backend §6.3): after the human's commit the automation runner plays the automated side in the same
 * request (one commit per step). The response is the view after the run, the human's events + the automated events
 * (all through `toPlayerEvents`, i.e. filtered for the human) and the run summary. The run goes through the shared
 * non-throwing guard (`settleRun`), so the human's accepted command is always answered with 200. A 409 on the human's commit never starts the runner.
 */
@Injectable()
export class SessionCommandsService {
  private readonly logger = new Logger('SessionCommandsService');

  constructor(
    private readonly sessions: SessionsService,
    private readonly repo: SessionsRepository,
    @Inject(CLOCK) private readonly clock: Clock,
    private readonly runner: AutomationRunner,
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

    const status = this.nextStatus(row, module, result.state);
    const committed = await commitState(this.repo, {
      sessionId: row.id,
      module,
      previous: state,
      next: result.state,
      status,
      events: result.events,
      now,
    });
    if (!committed.ok) {
      const current = (await this.repo.currentVersion(row.id)) ?? module.version(state);
      this.logger.warn(`sessionId=${row.id} gameId=${row.gameId} code=VERSION_CONFLICT status=409`);
      throw ApiError.versionConflict(current);
    }

    if (status !== previousStatus) {
      // Only the transition — never state data (hidden information stays out of logs).
      this.logger.log(
        `sessionId=${row.id} gameId=${row.gameId} code=STATUS_CHANGED ${previousStatus}→${status}`,
      );
    }

    const run = await this.safeRun(row.id, module, result.state, status);
    return this.respond(module, run, result.events);
  }

  /**
   * `POST /api/sessions/:id/automation/run` (Contract §1, Q-10): 404 → 400 (body must be empty / `{}`) → 422 (game
   * unavailable) → 500 (corrupt snapshot / settings mismatch) → run. Idempotent: nothing pending → `steps: 0`,
   * `stopReason: 'none'`. `events` = the events of THIS run only.
   */
  async runAutomation(sessionId: string, body: unknown): Promise<SessionCommandOk> {
    const row = await this.sessions.findRow(sessionId);

    const parsed = RunAutomationRequestSchema.safeParse(body ?? {});
    if (!parsed.success) throw ApiError.fromZod(parsed.error);

    const module = this.sessions.requireModule(row);
    const state = this.sessions.parseSnapshot(row, module);
    this.sessions.checkedSettings(row, module, state);
    const status = this.sessions.parseStatus(row);

    const run = await this.safeRun(row.id, module, state, status);
    return this.respond(module, run, []);
  }

  /** The shared non-throwing guard (`settle-run.ts`, review F-1). */
  private safeRun(
    sessionId: string,
    module: ServerGameModule,
    state: unknown,
    status: SessionStatus,
  ): Promise<SettledRun> {
    return settleRun(this.runner, this.logger, sessionId, module, state, status);
  }

  /**
   * Game part (view, events) from the module, `automation` from the platform schema — never a game's strict
   * command-response schema without `automation` (AM-FE-1).
   */
  private respond(
    module: ServerGameModule,
    run: SettledRun,
    humanEvents: readonly SessionEventRecord[],
  ): SessionCommandOk {
    const { final } = run;
    return SessionCommandOkSchema.parse({
      ok: true,
      view: module.toPlayerView(final.state, { status: final.status }),
      events: module.toPlayerEvents([...humanEvents, ...run.events], final.state),
      automation: run.summary,
    });
  }

  /** A status the module returned that is not a `SessionStatus` is a server bug → 500 INTERNAL. */
  private nextStatus(row: SessionRow, module: ServerGameModule, state: unknown): SessionStatus {
    const status = statusAfter(module, state);
    if (status === null) {
      this.logger.error(`sessionId=${row.id} gameId=${row.gameId} code=INVALID_STATUS status=500`);
      throw ApiError.internal();
    }
    return status;
  }
}
