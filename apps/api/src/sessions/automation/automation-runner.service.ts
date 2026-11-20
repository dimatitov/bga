/**
 * Automation runner (SWR-006 Contract §2, plan-backend §6.2; AC-02, AC-07). Game-agnostic: the game is reached only
 * through `ServerGameModule.automation`. One run = automated steps of one session until a human's turn, the end of the
 * game, the step limit, a lost race or an error. Every step is its own commit with the optimistic version guard (the
 * same write as a human command: setup, status, events), so an interrupted run never loses an accepted command and is
 * continued later by `POST /api/sessions/:id/automation/run`.
 *
 * One run per session at a time in this process (`KeyedMutex`): a second caller waits, re-reads the row and finds
 * nothing to do (`steps: 0`) — no duplicate moves and no duplicate paid model calls. `run` never throws.
 */
import { Inject, Injectable } from '@nestjs/common';
import {
  AutomationDecisionPointSchema,
  AutomationRunSummarySchema,
  SessionStatusSchema,
  type AutomationDecisionPoint,
  type AutomationFallbackCode,
  type AutomationRunSummary,
  type AutomationStopReason,
  type AutomationStrategyId,
  type GameAutomation,
  type ServerGameModule,
  type SessionEventRecord,
  type SessionStatus,
} from '@bga/platform';
import { AI_RUNTIME } from '../../ai/ai.tokens';
import type { AiRuntime } from '../../ai/ai.types';
import { CLOCK, type Clock } from '../../common/runtime.tokens';
import { APP_CONFIG } from '../../config/app-config.tokens';
import type { AppConfig } from '../../config/env';
import type { GameRegistry } from '../../game-registry/game-registry';
import { GAME_REGISTRY } from '../../game-registry/game-registry.tokens';
import { commitState, statusAfter } from '../session-writer';
import { SessionsRepository } from '../sessions.repository';
import {
  errorName,
  formatErrorLine,
  formatRunLine,
  formatStepLine,
  nestAutomationLogSink,
  type AutomationErrorCode,
  type AutomationLogSink,
} from './automation-log';
import {
  AUTOMATION_TEST_OVERRIDES,
  COMMANDER_STRATEGY,
  type AutomationTestOverrides,
} from './automation.tokens';
import {
  botChoice,
  type CommanderChoice,
  type CommanderRun,
  type CommanderStrategy,
} from './commander-strategy';
import { KeyedMutex } from './keyed-mutex';

export interface AutomationRunResult {
  /**
   * The last stored state the runner knows (after its last commit, or re-read after a conflict) and its status;
   * `null` when the run could not read the session at all (the caller keeps what it has).
   */
  final: { state: unknown; status: SessionStatus } | null;
  /** Raw events of the steps committed by THIS run (the caller filters them with `toPlayerEvents`). */
  events: SessionEventRecord[];
  summary: AutomationRunSummary;
}

/** Mutable bookkeeping of one run. */
interface RunTrack {
  sessionId: string;
  gameId: string;
  startedAt: number;
  module: ServerGameModule | null;
  automation: GameAutomation | null;
  strategy: AutomationStrategyId | null;
  state: unknown;
  status: SessionStatus | null;
  loaded: boolean;
  steps: number;
  fallbacks: number;
  reasons: AutomationFallbackCode[];
  events: SessionEventRecord[];
}

@Injectable()
export class AutomationRunner {
  private readonly mutex = new KeyedMutex();
  private readonly sink: AutomationLogSink;

  constructor(
    private readonly repo: SessionsRepository,
    @Inject(GAME_REGISTRY) private readonly registry: GameRegistry,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    @Inject(COMMANDER_STRATEGY) private readonly strategy: CommanderStrategy,
    @Inject(AI_RUNTIME) private readonly runtime: AiRuntime,
    @Inject(AUTOMATION_TEST_OVERRIDES) overrides: AutomationTestOverrides,
  ) {
    this.sink = overrides.logSink ?? nestAutomationLogSink();
  }

  /** Configured strategy id (`SessionResponse.automation.strategy` of automated sessions). */
  get strategyId(): AutomationStrategyId {
    return this.strategy.id;
  }

  run(sessionId: string): Promise<AutomationRunResult> {
    return this.mutex.runExclusive(sessionId, () => this.runLocked(sessionId));
  }

  private async runLocked(sessionId: string): Promise<AutomationRunResult> {
    const t: RunTrack = {
      sessionId,
      gameId: '-',
      startedAt: this.runtime.monotonicNow(),
      module: null,
      automation: null,
      strategy: null,
      state: undefined,
      status: null,
      loaded: false,
      steps: 0,
      fallbacks: 0,
      reasons: [],
      events: [],
    };
    try {
      if (!(await this.load(t))) return this.finish(t, 'none');
      const automation = t.automation;
      const module = t.module;
      if (automation === null || module === null || t.strategy === null) {
        return this.finish(t, 'none');
      }
      // Started lazily: a run with nothing to do never starts a strategy run (no deadline, no state).
      let run: CommanderRun | null = null;
      for (;;) {
        if (automation.pendingActor(t.state) === null) {
          if (t.steps === 0) return this.finish(t, 'none');
          return this.finish(t, t.status === 'completed' ? 'gameOver' : 'humanTurn');
        }
        if (t.steps >= this.config.aiCommander.maxSteps) return this.finish(t, 'stepLimit');
        run ??= this.strategy.startRun({
          sessionId,
          deadline: t.startedAt + this.config.aiCommander.runDeadlineMs,
        });
        const stop = await this.step(t, module, automation, run);
        if (stop !== null) return this.finish(t, stop);
      }
    } catch (err) {
      this.error(t, 'AUTOMATION_ERROR', errorName(err));
      return this.finish(t, 'error');
    }
  }

  /** Reads the row; `false` when there is nothing to automate (no row / no module). */
  private async load(t: RunTrack): Promise<boolean> {
    const row = await this.repo.findById(t.sessionId);
    if (!row) return false;
    t.gameId = row.gameId;
    const module = this.registry.module(row.gameId);
    if (!module) return false;
    t.module = module;
    t.state = module.parseState(JSON.parse(row.state), {
      sessionId: row.id,
      version: row.version,
    });
    t.status = SessionStatusSchema.parse(row.status);
    t.loaded = true;
    const automation = module.automation;
    if (automation && automation.isAutomated(t.state)) {
      t.automation = automation;
      t.strategy = this.strategy.id;
    }
    return true;
  }

  /** One automated step; `null` = committed, go on; otherwise the stop reason. */
  private async step(
    t: RunTrack,
    module: ServerGameModule,
    automation: GameAutomation,
    run: CommanderRun,
  ): Promise<AutomationStopReason | null> {
    const stepNo = t.steps + 1;
    const parsed = AutomationDecisionPointSchema.safeParse(automation.decisionPoint(t.state));
    if (!parsed.success) {
      // Q-9: a program error of the game — never sent to a model.
      this.error(t, 'INVALID_DECISION_POINT');
      return 'error';
    }
    const point = parsed.data;
    const startedAt = this.runtime.monotonicNow();
    let choice = await this.choose(t, run, point);
    let code: 'OK' | 'ENGINE_REJECTED_RETRY' = 'OK';
    const now = this.clock.now();
    let result = automation.applyCandidate(t.state, choice.candidateId, { now });
    if (!result.ok && choice.candidateId !== point.fallbackCandidateId) {
      // The engine rejected the strategy's pick: the bot's pick instead (AM-BE-4).
      code = 'ENGINE_REJECTED_RETRY';
      choice = botChoice(point, 'AI_INVALID_DECISION');
      result = automation.applyCandidate(t.state, choice.candidateId, { now });
    }
    if (!result.ok) {
      this.error(t, 'ENGINE_REJECTED');
      return 'error';
    }
    const status = statusAfter(module, result.state);
    if (status === null) {
      this.error(t, 'INVALID_STATUS');
      return 'error';
    }
    const committed = await commitState(this.repo, {
      sessionId: t.sessionId,
      module,
      previous: t.state,
      next: result.state,
      status,
      events: result.events,
      now,
    });
    if (!committed.ok) {
      // Another executor moved the session on (another process / a human command): quietly stop.
      this.sink('warn', formatErrorLine({ ...this.ids(t), step: stepNo, code: 'CONFLICT' }));
      await this.reload(t);
      return 'conflict';
    }
    t.state = result.state;
    t.status = status;
    t.events.push(...result.events);
    t.steps = stepNo;
    if (choice.fallbackCode !== undefined) {
      t.fallbacks += 1;
      if (!t.reasons.includes(choice.fallbackCode)) t.reasons.push(choice.fallbackCode);
    }
    this.sink(
      'log',
      formatStepLine({
        ...this.ids(t),
        step: stepNo,
        strategy: t.strategy ?? this.strategy.id,
        source: choice.source,
        fallbackCode: choice.fallbackCode,
        durationMs: this.runtime.monotonicNow() - startedAt,
        code,
      }),
    );
    return null;
  }

  /** The strategy's pick, guarded: an exception or an id outside the candidates → the bot (Q-20). */
  private async choose(
    t: RunTrack,
    run: CommanderRun,
    point: AutomationDecisionPoint,
  ): Promise<CommanderChoice> {
    let choice: CommanderChoice;
    try {
      choice = await run.choose(point);
    } catch (err) {
      this.sink(
        'warn',
        formatErrorLine({
          ...this.ids(t),
          step: t.steps + 1,
          code: 'STRATEGY_ERROR',
          error: errorName(err),
        }),
      );
      return botChoice(point, 'AI_PROVIDER_ERROR');
    }
    if (!point.candidates.some((c) => c.id === choice.candidateId)) {
      return botChoice(point, 'AI_INVALID_DECISION');
    }
    return choice;
  }

  /** After a lost race: the current stored state (AM-FE-3), or the last known one if it cannot be read. */
  private async reload(t: RunTrack): Promise<void> {
    try {
      const row = await this.repo.findById(t.sessionId);
      if (!row || !t.module) return;
      const state = t.module.parseState(JSON.parse(row.state), {
        sessionId: row.id,
        version: row.version,
      });
      const status = SessionStatusSchema.parse(row.status);
      t.state = state;
      t.status = status;
    } catch (err) {
      this.error(t, 'AUTOMATION_ERROR', errorName(err));
    }
  }

  private finish(t: RunTrack, stopReason: AutomationStopReason): AutomationRunResult {
    const summary = AutomationRunSummarySchema.parse({
      steps: t.steps,
      pending: this.pending(t),
      strategy: t.strategy,
      fallbacks: t.fallbacks,
      fallbackReasons: t.reasons,
      stopReason,
    });
    if (t.strategy !== null && (t.steps > 0 || stopReason !== 'none')) {
      this.sink(
        stopReason === 'error' ? 'error' : 'log',
        formatRunLine({
          ...this.ids(t),
          steps: t.steps,
          fallbacks: t.fallbacks,
          stopReason,
          durationMs: this.runtime.monotonicNow() - t.startedAt,
        }),
      );
    }
    return {
      final: t.loaded && t.status !== null ? { state: t.state, status: t.status } : null,
      events: t.events,
      summary,
    };
  }

  /** Whether an automated move is still expected; an unreadable answer counts as pending (the client may retry). */
  private pending(t: RunTrack): boolean {
    if (t.automation === null || t.strategy === null || !t.loaded) return false;
    try {
      return t.automation.pendingActor(t.state) !== null;
    } catch {
      return true;
    }
  }

  private error(t: RunTrack, code: AutomationErrorCode, error?: string): void {
    this.sink('error', formatErrorLine({ ...this.ids(t), step: t.steps + 1, code, error }));
  }

  private ids(t: RunTrack): { sessionId: string; gameId: string } {
    return { sessionId: t.sessionId, gameId: t.gameId };
  }
}
