/**
 * Test-only: loads the lazy `TableScreen` chunk (Konva board + core-v1 table) before the first test of a file.
 *
 * Under `pnpm -r test` (web and api suites in parallel) the cold transform of this module graph alone took > 5 s, so
 * the first `findByTestId('game-table')` of a file timed out (SWR-006 final gate). Loading it in `beforeAll` (with its
 * own hook timeout) keeps the render waits at the global `asyncUtilTimeout` and measures rendering, not transforming.
 * Same module id as `entry.ts`' `lazy(() => import('./table/TableScreen'))`, so `React.lazy` resolves from the cache.
 */
export async function preloadTableScreen(): Promise<void> {
  await import('../table/TableScreen');
}

/** Hook timeout for {@link preloadTableScreen} (cold transform under parallel load). */
export const PRELOAD_TIMEOUT_MS = 60_000;
