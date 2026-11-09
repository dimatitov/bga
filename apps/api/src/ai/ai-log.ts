/**
 * Safe AI logs (SWR-005B, plan-backend §5.7; AC-10). One line per attempt and one summary line, built ONLY from an
 * allow-list of fields; every value is sanitised (numbers, short ids from a fixed character set). Never logged: the
 * key, headers, instructions / input, objective, model text / reason, SDK error messages, error bodies.
 */
import type { AiLogSink, AIModelRole, AIProviderId, AIUsage } from './ai.types';

export type AttemptResult = 'ok' | 'retry' | 'fail';

export interface AiAttemptLog {
  provider: AIProviderId;
  model: string;
  role: AIModelRole;
  attempt: number;
  maxAttempts: number;
  result: AttemptResult;
  code?: string;
  httpStatus?: number;
  sdkError?: string;
  durationMs: number;
  usage?: AIUsage;
  costMicroUsd?: number;
  budgetKey?: string;
  requestId?: string;
}

export interface AiSummaryLog {
  provider: AIProviderId;
  model: string;
  role: AIModelRole;
  attempts: number;
  result: 'ok' | 'fail';
  code?: string;
  durationMs: number;
  usage?: AIUsage;
  costMicroUsd?: number;
  budgetKey?: string;
}

const SAFE_ID = /^[A-Za-z0-9._:-]{1,100}$/;
const SAFE_REQUEST_ID = /^[A-Za-z0-9_-]{1,128}$/;
const SAFE_NAME = /^[A-Za-z][A-Za-z0-9_]{0,63}$/;

function id(value: string | undefined, pattern = SAFE_ID): string {
  return value !== undefined && pattern.test(value) ? value : value === undefined ? '-' : '?';
}

function int(value: number | null | undefined): string {
  return typeof value === 'number' && Number.isFinite(value) ? String(Math.trunc(value)) : '-';
}

function usd(micro: number | undefined): string {
  return typeof micro === 'number' && Number.isSafeInteger(micro) && micro >= 0
    ? (micro / 1_000_000).toFixed(6)
    : '-';
}

function usageFields(u: AIUsage | undefined): string {
  return u
    ? `in=${int(u.inputTokens)} cached=${int(u.cachedInputTokens)} out=${int(u.outputTokens)} reasoning=${int(u.reasoningTokens)}`
    : 'in=- cached=- out=- reasoning=-';
}

export function formatAiAttemptLine(f: AiAttemptLog): string {
  return [
    'ai.attempt',
    `provider=${id(f.provider)}`,
    `model=${id(f.model)}`,
    `role=${id(f.role)}`,
    `attempt=${int(f.attempt)}/${int(f.maxAttempts)}`,
    `outcome=${id(f.result)}`,
    `code=${id(f.code, SAFE_NAME)}`,
    `httpStatus=${int(f.httpStatus)}`,
    `sdkError=${id(f.sdkError, SAFE_NAME)}`,
    `durationMs=${int(f.durationMs)}`,
    usageFields(f.usage),
    `costUsd=${usd(f.costMicroUsd)}`,
    `budgetKey=${id(f.budgetKey)}`,
    `requestId=${id(f.requestId, SAFE_REQUEST_ID)}`,
  ].join(' ');
}

export function formatAiSummaryLine(f: AiSummaryLog): string {
  return [
    'ai.decision',
    `provider=${id(f.provider)}`,
    `model=${id(f.model)}`,
    `role=${id(f.role)}`,
    `attempts=${int(f.attempts)}`,
    `outcome=${id(f.result)}`,
    `code=${id(f.code, SAFE_NAME)}`,
    `durationMs=${int(f.durationMs)}`,
    usageFields(f.usage),
    `costUsd=${usd(f.costMicroUsd)}`,
    `budgetKey=${id(f.budgetKey)}`,
  ].join(' ');
}

/** Writes a line; a throwing sink never breaks a decision. */
export function emitAiLog(sink: AiLogSink, line: string): void {
  try {
    sink(line);
  } catch {
    // logging must not change the result
  }
}
