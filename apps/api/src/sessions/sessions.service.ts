import { isDeepStrictEqual } from 'node:util';
import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  ListSessionsResponseSchema,
  MAX_SESSIONS_LISTED,
  SessionIdSchema,
  SessionResponseSchema,
  SessionStatusSchema,
  type CreateSessionRequest,
  type ListSessionsResponse,
  type ServerGameModule,
  type SessionDetails,
  type SessionResponse,
  type SessionSettings,
  type SessionStatus,
} from '@bga/platform';
import { ApiError } from '../common/api-error';
import { CLOCK, ID_GENERATOR, type Clock, type IdGenerator } from '../common/runtime.tokens';
import type { GameRegistry } from '../game-registry/game-registry';
import { GAME_REGISTRY } from '../game-registry/game-registry.tokens';
import { idempotencyHash } from './idempotency';
import { SessionsRepository, type IdempotencyRecord, type SessionRow } from './sessions.repository';

/** `POST /api/sessions` outcome: `replayed` → 200 + `Idempotent-Replay: true` (Q-1), else 201. */
export interface CreateSessionResult {
  response: SessionResponse;
  replayed: boolean;
}

/**
 * Game-independent session service (D-5): everything game-specific goes through the `ServerGameModule`
 * found by `Session.gameId` in the registry. Logs carry only sessionId, gameId, code.
 */
@Injectable()
export class SessionsService {
  private readonly logger = new Logger('SessionsService');

  constructor(
    private readonly repo: SessionsRepository,
    @Inject(GAME_REGISTRY) private readonly registry: GameRegistry,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(ID_GENERATOR) private readonly ids: IdGenerator,
  ) {}

  /**
   * Check order (spec, Q-3): 400 body / header (controller) → 404 game → 422 GAME_UNAVAILABLE →
   * idempotency (replay 200 / 409) → 400 setup → 422 SETUP_UNSUPPORTED → create + insert.
   * The key is stored only together with a successfully created session, so a rejected request never
   * "burns" it. A lost insert race (unique violation) is resolved like a replay (Q-4) — never 500 (TR-8).
   */
  async create(
    request: CreateSessionRequest,
    idempotencyKey: string | null = null,
  ): Promise<CreateSessionResult> {
    const module = this.registry.requireAvailable(request.gameId);
    const idempotency: IdempotencyRecord | null =
      idempotencyKey === null ? null : { key: idempotencyKey, hash: idempotencyHash(request) };

    if (idempotency) {
      const replay = await this.replay(idempotency);
      if (replay) return { response: replay, replayed: true };
    }

    const setup = module.parseSetup(request.setup);
    if (!setup.ok) {
      if (setup.kind === 'unsupported') {
        throw ApiError.setupUnsupported(setup.messageKey, setup.details);
      }
      throw ApiError.validation(
        setup.issues.map((issue) => ({ ...issue, path: ['setup', ...issue.path] })),
      );
    }

    const status = SessionStatusSchema.parse(module.initialStatus(setup.value));
    const now = this.clock.now();
    const sessionId = this.ids.sessionId();
    const { state, events } = module.createInitialState(setup.value, { sessionId, now });
    const outcome = await this.repo.insert({
      id: sessionId,
      gameId: request.gameId,
      setup: JSON.stringify(setup.value),
      state: JSON.stringify(state),
      version: module.version(state),
      status,
      idempotency,
      events,
      now,
    });
    if (!outcome.ok) {
      // Q-4: another request with the same key won the race — answer as its replay (or 409).
      const replay = idempotency ? await this.replay(idempotency) : null;
      if (!replay) throw new Error('idempotency key reported taken but no session holds it');
      return { response: replay, replayed: true };
    }

    return {
      response: SessionResponseSchema.parse({
        sessionId,
        gameId: request.gameId,
        status,
        settings: module.publicSettings(setup.value),
        view: module.toPlayerView(state, { status }),
      }),
      replayed: false,
    };
  }

  /**
   * The session created earlier with this key: same body hash → its CURRENT envelope (Q-1, like GET);
   * different hash → 409 IDEMPOTENCY_KEY_REUSED (nothing of that session is echoed); none → null.
   */
  private async replay(idempotency: IdempotencyRecord): Promise<SessionResponse | null> {
    const row = await this.repo.findByIdempotencyKey(idempotency.key);
    if (!row) return null;
    if (row.idempotencyHash !== idempotency.hash) {
      this.logger.warn(`sessionId=- gameId=${row.gameId} code=IDEMPOTENCY_KEY_REUSED status=409`);
      throw ApiError.idempotencyKeyReused();
    }
    this.logger.log(`sessionId=${row.id} gameId=${row.gameId} code=IDEMPOTENT_REPLAY status=200`);
    return this.envelope(row);
  }

  /**
   * Summaries of the most recent sessions (optionally of one game). A row whose game has no server
   * module, or whose snapshot is corrupt, is skipped and logged (Q-7, review #1) — the list keeps working.
   */
  async list(gameId?: string): Promise<ListSessionsResponse> {
    const rows = await this.repo.listRecent(MAX_SESSIONS_LISTED, gameId);
    const summaries: ListSessionsResponse = [];
    for (const row of rows) {
      const module = this.registry.module(row.gameId);
      if (!module) {
        this.logSkipped(row, 'GAME_UNAVAILABLE');
        continue;
      }
      let details: SessionDetails;
      let status: SessionStatus;
      try {
        status = this.parseStatus(row);
        const state = this.parseSnapshot(row, module);
        if (!this.settingsAgree(row, module, state)) {
          this.logSkipped(row, 'SETTINGS_MISMATCH');
          continue;
        }
        details = module.summarize(state);
      } catch {
        this.logSkipped(row, 'CORRUPT_SNAPSHOT');
        continue;
      }
      summaries.push({
        sessionId: row.id,
        gameId: row.gameId,
        status,
        version: row.version,
        createdAt: row.createdAt.toISOString(),
        updatedAt: row.updatedAt.toISOString(),
        details,
      });
    }
    return ListSessionsResponseSchema.parse(summaries);
  }

  /** Always the human player's view; query parameters are ignored. */
  async get(sessionId: string): Promise<SessionResponse> {
    return this.envelope(await this.findRow(sessionId));
  }

  /**
   * `{ sessionId, gameId, status, settings, view }` of a stored row (GET and idempotent replay):
   * 422 (no module) → 500 (corrupt status / setup / snapshot).
   */
  private envelope(row: SessionRow): SessionResponse {
    const module = this.requireModule(row);
    const state = this.parseSnapshot(row, module);
    const status = this.parseStatus(row);
    return SessionResponseSchema.parse({
      sessionId: row.id,
      gameId: row.gameId,
      status,
      settings: this.checkedSettings(row, module, state),
      view: module.toPlayerView(state, { status }),
    });
  }

  /**
   * Review #1 — single source of settings: `Session.setup` (creation input, rewritten from the state on
   * every write) and the state must give the same public settings. Mismatch → 500 INTERNAL, logged by
   * sessionId + code only (never the settings themselves). Corrupt `setup` → throws (500) as before.
   */
  checkedSettings<State>(
    row: SessionRow,
    module: ServerGameModule<State>,
    state: State,
  ): SessionSettings {
    const { settings, agree } = this.compareSettings(row, module, state);
    if (!agree) {
      this.logger.error(
        `sessionId=${row.id} gameId=${row.gameId} code=SETTINGS_MISMATCH status=500`,
      );
      throw ApiError.internal();
    }
    return settings;
  }

  /** `checkedSettings` without throwing on a mismatch (list: such a row is skipped). */
  private settingsAgree<State>(
    row: SessionRow,
    module: ServerGameModule<State>,
    state: State,
  ): boolean {
    return this.compareSettings(row, module, state).agree;
  }

  private compareSettings<State>(
    row: SessionRow,
    module: ServerGameModule<State>,
    state: State,
  ): { settings: SessionSettings; agree: boolean } {
    const settings = module.publicSettings(module.parseStoredSetup(JSON.parse(row.setup)));
    const fromState = module.publicSettings(module.setupOf(state));
    return { settings, agree: isDeepStrictEqual(settings, fromState) };
  }

  /** `Session.status` → `SessionStatus`; an unknown value is a server fault (500 INTERNAL). */
  parseStatus(row: SessionRow): SessionStatus {
    return SessionStatusSchema.parse(row.status);
  }

  /** 404 (unknown or malformed id). */
  async findRow(sessionId: string): Promise<SessionRow> {
    if (!SessionIdSchema.safeParse(sessionId).success) throw ApiError.sessionNotFound();
    const row = await this.repo.findById(sessionId);
    if (!row) throw ApiError.sessionNotFound();
    return row;
  }

  /** 422 when the session's game has no server module (Q-7). */
  requireModule(row: SessionRow): ServerGameModule {
    const module = this.registry.module(row.gameId);
    if (!module) {
      this.logger.warn(`sessionId=${row.id} gameId=${row.gameId} code=GAME_UNAVAILABLE status=422`);
      throw ApiError.gameUnavailable();
    }
    return module;
  }

  /** A corrupt snapshot is a server fault: the error propagates and the filter answers 500 INTERNAL. */
  parseSnapshot<State>(row: SessionRow, module: ServerGameModule<State>): State {
    return module.parseState(JSON.parse(row.state), { sessionId: row.id, version: row.version });
  }

  private logSkipped(row: SessionRow, code: string): void {
    this.logger.warn(`sessionId=${row.id} gameId=${row.gameId} code=${code} skipped in list`);
  }
}
