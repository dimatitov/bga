import { Body, Controller, Get, Headers, HttpCode, Param, Post, Query, Res } from '@nestjs/common';
import {
  CreateSessionRequestSchema,
  IDEMPOTENCY_KEY_HEADER_LC,
  IDEMPOTENT_REPLAY_HEADER,
  ListSessionsQuerySchema,
  parseIdempotencyKeyHeader,
  type CreateSessionRequest,
  type ListSessionsQuery,
  type ListSessionsResponse,
  type SessionCommandOk,
  type SessionResponse,
} from '@bga/platform';
import type { Response } from 'express';
import { ApiError } from '../common/api-error';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { SessionCommandsService } from './session-commands.service';
import { SessionsService } from './sessions.service';

@Controller('sessions')
export class SessionsController {
  constructor(
    private readonly sessions: SessionsService,
    private readonly commands: SessionCommandsService,
  ) {}

  /**
   * 201 — created; 200 + `Idempotent-Replay: true` — the same `Idempotency-Key` with the same body (Q-1).
   * The optional header must be one UUID (empty / malformed / repeated → 400 under `headers.idempotency-key`).
   */
  @Post()
  async create(
    @Body(new ZodValidationPipe(CreateSessionRequestSchema)) body: CreateSessionRequest,
    @Headers(IDEMPOTENCY_KEY_HEADER_LC) rawKey: unknown,
    @Res({ passthrough: true }) res: Response,
  ): Promise<SessionResponse> {
    const key = parseIdempotencyKeyHeader(rawKey);
    if (!key.ok) throw ApiError.validation(key.issues);
    const { response, replayed } = await this.sessions.create(body, key.key);
    if (replayed) {
      res.status(200);
      res.setHeader(IDEMPOTENT_REPLAY_HEADER, 'true');
    } else {
      res.status(201);
    }
    return response;
  }

  /** Q-5: no / empty `gameId` → every game; repeated or malformed → 400; unknown → []. */
  @Get()
  list(
    @Query(new ZodValidationPipe(ListSessionsQuerySchema)) query: ListSessionsQuery,
  ): Promise<ListSessionsResponse> {
    return this.sessions.list(query.gameId);
  }

  @Get(':sessionId')
  get(@Param('sessionId') sessionId: string): Promise<SessionResponse> {
    return this.sessions.get(sessionId);
  }

  /** The only state-changing route besides session creation (TC-SES-15). */
  @Post(':sessionId/commands')
  @HttpCode(200)
  execute(@Param('sessionId') sessionId: string, @Body() body: unknown): Promise<SessionCommandOk> {
    return this.commands.execute(sessionId, body);
  }
}
