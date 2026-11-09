/** DI tokens of the AI layer (SWR-005B, plan-backend §1). Services themselves are provided by class. */

/** Test-only `AiTestOverrides` given to `createApp({ ai })` (`{}` in normal runs). */
export const AI_TEST_OVERRIDES = Symbol('AI_TEST_OVERRIDES');

/** `AiRuntime` (sleep / random / monotonic clock / log sink) shared by providers and the dev rate limiter. */
export const AI_RUNTIME = Symbol('AI_RUNTIME');
