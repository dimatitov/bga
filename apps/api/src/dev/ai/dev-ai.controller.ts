/**
 * Dev-only AI diagnostics (SWR-005B, plan-backend §10; AC-08). Registered only when `nodeEnv !== 'production'`.
 * Check order (AM-BE-11): 404 (production: no module) → 403 guard → 400/413 body → 429 dev rate limit →
 * 503 pricing / model → 429 budget → model call. Responses are parsed with the strict platform schemas; errors use
 * the unified envelope with the allow-listed `details` (plan §6.2); 429 responses carry `Retry-After` when known.
 */
import { Body, Controller, Get, HttpCode, Inject, Post, Res, UseGuards } from '@nestjs/common';
import {
  AI_DEV_BUDGET_KEY,
  ERROR_MESSAGE_KEYS,
  type AiDevStatus,
  type AiTestDecisionResponse,
} from '@bga/platform';
import type { Response } from 'express';
import { ApiError } from '../../common/api-error';
import { ZodValidationPipe } from '../../common/zod-validation.pipe';
import { AiDecisionService, AiUsageWriteError } from '../../ai/ai-decision.service';
import { AiFailure, retryAfterSeconds, toApiError } from '../../ai/ai.errors';
import { AiStatusService } from '../../ai/ai-status.service';
import {
  DevAiTestDecisionRequestSchema,
  toDecisionContext,
  toWireDecision,
  toWireStatus,
  type DevAiTestDecisionRequest,
} from './dev-ai.schemas';
import { DevRateLimiter } from './dev-rate-limiter';
import { LoopbackGuard } from './loopback.guard';

export const DEV_RATE_LIMITER = Symbol('DEV_RATE_LIMITER');

function devRateLimited(res: Response, seconds: number): ApiError {
  res.setHeader('Retry-After', String(seconds));
  return new ApiError('AI_RATE_LIMITED', ERROR_MESSAGE_KEYS.aiDevRateLimited, {
    retryAfterSeconds: seconds,
  });
}

@Controller('dev/ai')
@UseGuards(LoopbackGuard)
export class DevAiController {
  constructor(
    @Inject(AiDecisionService) private readonly decisions: AiDecisionService,
    @Inject(AiStatusService) private readonly statusService: AiStatusService,
    @Inject(DEV_RATE_LIMITER) private readonly limiter: DevRateLimiter,
  ) {}

  @Get('status')
  async status(@Res({ passthrough: true }) res: Response): Promise<AiDevStatus> {
    const rate = this.limiter.hit(false);
    if (!rate.ok) throw devRateLimited(res, rate.retryAfterSeconds);
    return toWireStatus(await this.statusService.status(AI_DEV_BUDGET_KEY));
  }

  @Post('test-decision')
  @HttpCode(200)
  async testDecision(
    @Body(new ZodValidationPipe(DevAiTestDecisionRequestSchema)) body: DevAiTestDecisionRequest,
    @Res({ passthrough: true }) res: Response,
  ): Promise<AiTestDecisionResponse> {
    const paid = this.decisions.resolveProvider(body.provider) === 'openai';
    const rate = this.limiter.hit(paid);
    if (!rate.ok) throw devRateLimited(res, rate.retryAfterSeconds);
    try {
      return toWireDecision(await this.decisions.decide(toDecisionContext(body), body.provider));
    } catch (err) {
      if (err instanceof AiFailure) {
        const seconds =
          err.code === 'AI_RATE_LIMITED' ? retryAfterSeconds(err.retryAfterMs) : undefined;
        if (seconds !== undefined) res.setHeader('Retry-After', String(seconds));
        throw toApiError(err);
      }
      if (err instanceof AiUsageWriteError) throw ApiError.internal();
      throw err;
    }
  }
}
