import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import { useQuery } from '@tanstack/react-query';
import { lazy, Suspense } from 'react';
import { useTranslation } from 'react-i18next';
import { useParams } from 'react-router';
import { isApiError, isNotFound } from '@/shared/api/errors';
import { translateUnknownError } from '@/shared/i18n';
import { AutomationNotice } from '../automation/AutomationNotice';
import { SessionAutomationContext } from '../automation/SessionAutomationContext';
import { useAutomationDriver } from '../automation/useAutomationDriver';
import { paths } from '../paths';
import { useGameEntry } from '../registry/useGameRegistry';
import { sessionQuery } from '../sessions/queries';
import { SessionLoading } from './SessionLoading';
import { SessionMessage } from './SessionMessage';
import { SessionNotFound } from './SessionNotFound';
import { SessionUnsupported } from './SessionUnsupported';

const GAME_UNAVAILABLE = 'GAME_UNAVAILABLE';

// SWR-008 AC-13 (plan-frontend §2.1–§2.2): literal guard, as in `app/router.tsx` — folded in `vite build`, so the dev
// chunk of the AI decision panel, its strings, testids and endpoint path vanish from production. The panel itself is
// further gated by the opt-in switch of `/dev/ai` (off by default) and an automated participant.
const DevAiSessionDiagnostics = import.meta.env.DEV
  ? lazy(() => import('@/dev/ai/session/entry'))
  : null;

function SessionView({ sessionId }: { sessionId: string }) {
  const { t } = useTranslation();
  const query = useQuery(sessionQuery(sessionId));
  const entry = useGameEntry(query.data?.gameId);
  const automation = useAutomationDriver(sessionId, query.data, query.dataUpdatedAt);

  if (query.isPending) return <SessionLoading />;
  if (query.isError) {
    const error = query.error;
    // 404 / GAME_UNAVAILABLE win even over cached data: the session is gone or cannot be played.
    if (isNotFound(error)) return <SessionNotFound />;
    if (isApiError(error) && error.code === GAME_UNAVAILABLE) return <SessionUnsupported />;
  }
  if (query.isError && query.data === undefined) {
    const error = query.error;
    return (
      <SessionMessage
        testId="session-error"
        title={t('sessionHost:error.title')}
        text={translateUnknownError(t, error)}
        actions={
          <Button
            variant="outlined"
            loading={query.isFetching}
            onClick={() => void query.refetch()}
          >
            {t('common:actions.retry')}
          </Button>
        }
      />
    );
  }

  // Analyst decision (SWR-003, keeps SWR-002 behaviour): a failed refetch with cached data keeps the table and
  // shows a non-blocking warning with Retry; `session-error` is only for "no data at all".
  const refetchFailed = query.isError;
  const { gameId, status, view } = query.data;
  const TableScreen = entry?.TableScreen;
  if (!entry || !TableScreen) return <SessionUnsupported />;
  return (
    <div
      data-testid="session-host"
      data-session-id={sessionId}
      data-game-id={gameId}
      data-session-status={status}
      data-automation-pending={String(automation.pending)}
      data-automation-strategy={automation.strategy ?? 'none'}
      data-automation-state={automation.phase}
    >
      {refetchFailed ? (
        <Alert
          severity="warning"
          data-testid="session-refetch-warning"
          action={
            <Button
              color="inherit"
              size="small"
              loading={query.isFetching}
              onClick={() => void query.refetch()}
            >
              {t('common:actions.retry')}
            </Button>
          }
          sx={{
            position: 'fixed',
            left: '50%',
            bottom: 16,
            transform: 'translateX(-50%)',
            zIndex: (theme) => theme.zIndex.snackbar,
            maxWidth: 'calc(100% - 32px)',
          }}
        >
          {t('sessionHost:refetchWarning', { reason: translateUnknownError(t, query.error) })}
        </Alert>
      ) : null}
      <AutomationNotice automation={automation} stacked={refetchFailed} />
      {DevAiSessionDiagnostics ? (
        <Suspense fallback={null}>
          <DevAiSessionDiagnostics sessionId={sessionId} automation={automation} />
        </Suspense>
      ) : null}
      <SessionAutomationContext value={automation}>
        <Suspense fallback={<SessionLoading />}>
          <TableScreen
            sessionId={sessionId}
            gameId={gameId}
            status={status}
            view={view}
            definition={entry.definition}
            backHref={paths.game(gameId)}
          />
        </Suspense>
      </SessionAutomationContext>
    </div>
  );
}

/**
 * `/sessions/:sessionId` (plan-frontend §2.1): loads `{ sessionId, gameId, status, settings, view, automation }`, finds the game by the
 * server's `gameId` and renders its `TableScreen` with `view: unknown` (never parsed here, TR-5). Subscribed to
 * `sessionKeys.detail(id)`, so `setQueryData` after a command re-renders the table with the new view.
 * SWR-006: drives the automated participant (`useAutomationDriver`: ≤ 1 automatic `automation/run` per load or
 * command response), shows `AutomationNotice` with «Continue AI turn» and exposes `useSessionAutomation()` to the game.
 */
export function SessionHost() {
  const { sessionId = '' } = useParams();
  return <SessionView key={sessionId} sessionId={sessionId} />;
}
