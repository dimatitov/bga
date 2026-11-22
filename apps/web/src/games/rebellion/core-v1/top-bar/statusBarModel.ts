import type { LedState } from '@/shared/ui/terminal';
import type { AiCommanderState } from '../model/aiCommander';

/**
 * Pure helpers of the console status bar (SWR-009 C1): the AI box LEDs and the time / reputation scale.
 * Kept apart from the components (fast refresh: component files export components only).
 */

/**
 * The three LEDs of the AI box per state: power · activity · fault.
 * idle → green (power on) · thinking → green + blinking amber · stalled → green + red · over → all off.
 */
export const AI_LEDS: Readonly<Record<AiCommanderState, readonly [LedState, LedState, LedState]>> =
  {
    idle: ['green', 'off', 'off'],
    thinking: ['green', 'amber', 'off'],
    stalled: ['green', 'off', 'red'],
    over: ['off', 'off', 'off'],
  };

const MIN_TICKS = 16;

/** Number of ticks of the time / reputation scale: `max(reputation, time, 16)`. */
export function trackTicks(time: number, reputation: number): number {
  return Math.max(reputation, time, MIN_TICKS);
}

/** Position (0…100 %) of marker value `n` on a scale `1..ticks` (clamped). */
export function trackPercent(n: number, ticks: number): number {
  if (ticks <= 1) return 0;
  const clamped = Math.min(Math.max(n, 1), ticks);
  return ((clamped - 1) / (ticks - 1)) * 100;
}
