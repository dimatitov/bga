import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import CircularProgress from '@mui/material/CircularProgress';
import Skeleton from '@mui/material/Skeleton';
import Typography from '@mui/material/Typography';
import { useEffect, useLayoutEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useParams } from 'react-router';
import {
  BoardContext,
  type BoardContextValue,
  BoardSidebar,
  BoardView,
  useGlobalEscape,
  useSelectionStore,
} from '@/features/game-board';
import { translateUnknownError } from '@/shared/i18n';
import { GameInfoPanel } from './components/GameInfoPanel';
import { GameNotFound } from './components/GameNotFound';
import { SessionTopBar } from './components/SessionTopBar';
import { useGameView } from './hooks/useGameView';
import { useSendCommand } from './hooks/useSendCommand';

const GRID = {
  display: 'grid',
  gridTemplateRows: '56px minmax(0, 1fr)',
  gridTemplateColumns: { xs: 'minmax(0, 1fr) 320px', lg: 'minmax(0, 1fr) 384px' },
  gridTemplateAreas: '"top top" "board side"',
  height: '100dvh',
  overflow: 'hidden',
  position: 'relative',
} as const;

/** Visually hidden but focusable heading (RouteFocus moves focus to `#main h1`, D-A-8). */
const SR_ONLY = {
  position: 'absolute',
  width: 1,
  height: 1,
  overflow: 'hidden',
  clip: 'rect(0 0 0 0)',
  whiteSpace: 'nowrap',
} as const;

function focusObjectsList() {
  useSelectionStore.getState().setSidebarTab('objects');
  requestAnimationFrame(() =>
    document
      .querySelector<HTMLElement>('[data-testid="board-list"] [role="option"][tabindex="0"]')
      ?.focus(),
  );
}

/** `/games/:id` — the game table (plan-frontend §5). Route → page contract: no props, id from the URL. */
export function GameTablePage() {
  const { id = '' } = useParams();
  const { t } = useTranslation();
  const { view, status, error, refetch, isFetching } = useGameView(id);
  const { send, isPending, saveStatus } = useSendCommand(id);
  const activateGame = useSelectionStore((s) => s.activateGame);
  const reconcile = useSelectionStore((s) => s.reconcile);

  useLayoutEffect(() => activateGame(id), [activateGame, id]);
  useEffect(() => {
    if (view) reconcile(view);
  }, [view, reconcile]);
  useGlobalEscape();

  const ctx = useMemo<BoardContextValue | null>(
    () => (view ? { gameId: id, view, send, isPending } : null),
    [id, view, send, isPending],
  );

  if (status === 'notFound') return <GameNotFound />;

  if (!ctx) {
    return (
      <Box sx={GRID} aria-busy={status === 'loading'} data-testid="game-table-loading">
        <Typography component="h1" sx={SR_ONLY}>
          {t('session:page.title')}
        </Typography>
        <Box sx={{ gridArea: 'top', px: 2, display: 'flex', alignItems: 'center' }}>
          <Skeleton width="60%" height={32} />
        </Box>
        <Box sx={{ gridArea: 'board', display: 'grid', placeItems: 'center' }}>
          {status === 'error' ? (
            <Alert
              severity="error"
              action={
                <Button color="inherit" size="small" onClick={refetch} disabled={isFetching}>
                  {t('common:actions.retry')}
                </Button>
              }
            >
              {translateUnknownError(t, error)}
            </Alert>
          ) : (
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
              <CircularProgress size={24} aria-hidden />
              <Typography>{t('session:page.loading')}</Typography>
            </Box>
          )}
        </Box>
      </Box>
    );
  }

  return (
    <BoardContext.Provider value={ctx}>
      <Box
        data-testid="game-table"
        data-game-id={ctx.view.id}
        data-version={ctx.view.version}
        sx={GRID}
      >
        <Typography component="h1" sx={SR_ONLY}>
          {t('session:page.title')}
        </Typography>
        <Button
          onClick={focusObjectsList}
          sx={{
            position: 'absolute',
            left: 8,
            top: -64,
            zIndex: 1500,
            bgcolor: 'background.paper',
            '&:focus-visible': { top: 8 },
          }}
        >
          {t('session:page.skipToList')}
        </Button>
        <SessionTopBar view={ctx.view} saveStatus={saveStatus} />
        {status === 'error' && (
          <Alert severity="warning" sx={{ position: 'absolute', top: 64, left: 16, zIndex: 2 }}>
            {translateUnknownError(t, error)}
          </Alert>
        )}
        <Box sx={{ gridArea: 'board', minHeight: 0, minWidth: 0 }}>
          <BoardView />
        </Box>
        <Box sx={{ gridArea: 'side', minHeight: 0 }}>
          <BoardSidebar gameInfo={<GameInfoPanel view={ctx.view} />} />
        </Box>
      </Box>
    </BoardContext.Provider>
  );
}
