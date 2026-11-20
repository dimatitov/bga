/**
 * Allow-listed log lines of the automation runner (SWR-006 Contract §2, plan-backend §6.2, Q-BE-1). Only ids of the
 * session and the game, counters, the strategy / source, fixed codes and an error CLASS name. Never candidates,
 * commands, game data, situation / summary texts, model reasons or exception messages.
 */
import { Logger } from '@nestjs/common';
import type {
  AutomationFallbackCode,
  AutomationStopReason,
  AutomationStrategyId,
} from '@bga/platform';

export type AutomationLogLevel = 'log' | 'warn' | 'error';
export type AutomationLogSink = (level: AutomationLogLevel, line: string) => void;

export type AutomationStepCode = 'OK' | 'ENGINE_REJECTED_RETRY';
export type AutomationErrorCode =
  | 'ENGINE_REJECTED'
  | 'CONFLICT'
  | 'AUTOMATION_ERROR'
  | 'INVALID_DECISION_POINT'
  | 'INVALID_STATUS'
  | 'STRATEGY_ERROR';

const SAFE_TOKEN = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$/;

/** Ids come from the DB / registry; anything unexpected is masked instead of printed. */
function token(value: string): string {
  return SAFE_TOKEN.test(value) ? value : '?';
}

/** Class name of an error (`err.name` by a strict pattern), never its message. */
export function errorName(err: unknown): string {
  const name = err instanceof Error ? err.name : typeof err;
  return /^[A-Za-z][A-Za-z0-9_]{0,63}$/.test(name) ? name : 'UnknownError';
}

export interface StepLine {
  sessionId: string;
  gameId: string;
  step: number;
  strategy: AutomationStrategyId;
  source: 'bot' | 'openai';
  fallbackCode?: AutomationFallbackCode;
  durationMs: number;
  code: AutomationStepCode;
}

export function formatStepLine(l: StepLine): string {
  return (
    `automation.step sessionId=${token(l.sessionId)} gameId=${token(l.gameId)} step=${l.step} ` +
    `strategy=${l.strategy} source=${l.source} fallbackCode=${l.fallbackCode ?? '-'} ` +
    `durationMs=${Math.max(0, Math.round(l.durationMs))} code=${l.code}`
  );
}

export interface RunLine {
  sessionId: string;
  gameId: string;
  steps: number;
  fallbacks: number;
  stopReason: AutomationStopReason;
  durationMs: number;
}

export function formatRunLine(l: RunLine): string {
  return (
    `automation.run sessionId=${token(l.sessionId)} gameId=${token(l.gameId)} steps=${l.steps} ` +
    `fallbacks=${l.fallbacks} stopReason=${l.stopReason} durationMs=${Math.max(0, Math.round(l.durationMs))}`
  );
}

export interface ErrorLine {
  sessionId: string;
  gameId: string;
  step: number;
  code: AutomationErrorCode;
  /** Class name only (see `errorName`). */
  error?: string;
}

export function formatErrorLine(l: ErrorLine): string {
  const error = l.error === undefined ? '' : ` error=${token(l.error)}`;
  return (
    `automation.error sessionId=${token(l.sessionId)} gameId=${token(l.gameId)} step=${l.step} ` +
    `code=${l.code}${error}`
  );
}

/** Default sink: Nest `Logger('Automation')`. */
export function nestAutomationLogSink(): AutomationLogSink {
  const logger = new Logger('Automation');
  return (level, line) => {
    if (level === 'error') logger.error(line);
    else if (level === 'warn') logger.warn(line);
    else logger.log(line);
  };
}
