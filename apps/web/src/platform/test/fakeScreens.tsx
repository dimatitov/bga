import type { SetupScreenProps, TableScreenProps } from '@/games/registry';

/* eslint-disable no-restricted-syntax -- test-only fake screens render raw ids/JSON, not UI text. */

/** Fake setup screen: `fake-setup-submit` → `start.submit({ answer: 42 })`; shows `start.error`. */
export function FakeSetupScreen({ gameId, start, backHref }: SetupScreenProps) {
  return (
    <div data-testid="fake-setup" data-game-id={gameId} data-back-href={backHref}>
      <h1>{gameId}</h1>
      <button
        type="button"
        data-testid="fake-setup-submit"
        disabled={start.isPending}
        onClick={() => start.submit({ answer: 42 })}
      >
        {'submit'}
      </button>
      {start.error ? <p data-testid="fake-setup-error">{String(start.error)}</p> : null}
    </div>
  );
}

/** Fake table: `fake-table[data-session-id][data-session-status]`, the JSON of `view` from props, link to `backHref`. */
export function FakeTableScreen({ sessionId, gameId, status, view, backHref }: TableScreenProps) {
  return (
    <div
      data-testid="fake-table"
      data-session-id={sessionId}
      data-game-id={gameId}
      data-session-status={status}
    >
      <h1>{sessionId}</h1>
      <pre data-testid="fake-table-view">{JSON.stringify(view)}</pre>
      <a href={backHref} data-testid="session-back-to-game">
        {'back'}
      </a>
    </div>
  );
}

/* eslint-enable no-restricted-syntax */
