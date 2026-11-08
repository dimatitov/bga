import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Typography from '@mui/material/Typography';
import type { PlayerViewPlayer } from '@bga/game-rebellion/schema';
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link as RouterLink } from 'react-router';
import type { TableScreenProps } from '@/games/types';
import {
  BoardContext,
  type BoardContextValue,
  BoardSidebar,
  BoardView,
  useGlobalEscape,
  useSelectionStore,
} from '../board';
import { GameInfoPanel } from './components/GameInfoPanel';
import { HandoffScreen } from './components/HandoffScreen';
import { SessionTopBar } from './components/SessionTopBar';
import { useRebellionView } from './hooks/useRebellionView';
import { useSendCommand } from './hooks/useSendCommand';

/**
 * D-1 (SWR-004 plan-frontend §5.5): the top row is as tall as the (wrapping) top bar. Below 600 px the table
 * folds into one column (top / map 60dvh / sidebar) and the page scrolls vertically — never horizontally (Q-22).
 */
const GRID = {
  display: 'grid',
  gridTemplateRows: { xs: 'auto 60dvh minmax(70dvh, auto)', sm: 'auto minmax(0, 1fr)' },
  gridTemplateColumns: {
    xs: 'minmax(0, 1fr)',
    sm: 'minmax(0, 1fr) 320px',
    lg: 'minmax(0, 1fr) 384px',
  },
  gridTemplateAreas: { xs: '"top" "board" "side"', sm: '"top top" "board side"' },
  height: { xs: 'auto', sm: '100dvh' },
  overflow: { xs: 'visible', sm: 'hidden' },
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

/** The stored view does not match the Rebellion schema (plan-frontend §3.3): message + "← To game". */
function InvalidView({ backHref }: { backHref: string }) {
  const { t } = useTranslation();
  return (
    <Box
      data-testid="table-invalid-view"
      sx={{ display: 'grid', placeItems: 'center', minHeight: '60vh', p: 4 }}
    >
      <Box sx={{ maxWidth: 560, display: 'grid', gap: 2, justifyItems: 'center' }}>
        <Typography component="h1" variant="h5" sx={{ textAlign: 'center' }}>
          {t('rebellion.session:invalidView.title')}
        </Typography>
        <Alert severity="error" sx={{ width: '100%' }}>
          {t('rebellion.session:invalidView.text')}
        </Alert>
        <Button
          component={RouterLink}
          to={backHref}
          variant="contained"
          startIcon={<ArrowBackIcon />}
          data-testid="session-back-to-game"
        >
          {t('rebellion.session:topBar.backToGame')}
        </Button>
      </Box>
    </Box>
  );
}

function Table({
  sessionId,
  gameId,
  status,
  view,
  backHref,
  focusHeading,
}: {
  sessionId: string;
  gameId: string;
  status: TableScreenProps['status'];
  view: PlayerViewPlayer;
  backHref: string;
  /** After a hot-seat switch the new side starts on the table heading (plan-frontend §5.3 step 5). */
  focusHeading: boolean;
}) {
  const { t } = useTranslation();
  const headingRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    if (focusHeading) headingRef.current?.focus();
  }, [focusHeading]);
  const { send, isPending, saveStatus } = useSendCommand(sessionId);
  const activateGame = useSelectionStore((s) => s.activateGame);
  const reconcile = useSelectionStore((s) => s.reconcile);

  // The board stores are keyed by the session (one selection per open session).
  useLayoutEffect(() => activateGame(sessionId), [activateGame, sessionId]);
  useEffect(() => reconcile(view), [view, reconcile]);
  useGlobalEscape();

  const ctx = useMemo<BoardContextValue>(
    () => ({ gameId: sessionId, view, send, isPending }),
    [sessionId, view, send, isPending],
  );

  return (
    <BoardContext.Provider value={ctx}>
      <Box
        data-testid="game-table"
        data-session-id={sessionId}
        data-game-id={gameId}
        data-version={view.version}
        sx={GRID}
      >
        <Typography component="h1" ref={headingRef} tabIndex={-1} sx={SR_ONLY}>
          {t('rebellion.session:page.title')}
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
          {t('rebellion.session:page.skipToList')}
        </Button>
        <SessionTopBar view={view} status={status} saveStatus={saveStatus} backHref={backHref} />
        <Box sx={{ gridArea: 'board', minHeight: 0, minWidth: 0 }}>
          <BoardView />
        </Box>
        <Box sx={{ gridArea: 'side', minHeight: 0 }}>
          <BoardSidebar gameInfo={<GameInfoPanel view={view} status={status} />} />
        </Box>
      </Box>
    </BoardContext.Provider>
  );
}

/**
 * Rebellion game table (SWR-002 table, SWR-003 plan-frontend §2.1, §3.3, M2). Rendered by the platform's
 * SessionHost (`/sessions/:sessionId`), which owns loading, 404 and "game unavailable"; this screen gets the
 * session's `view: unknown` in props (re-rendered on every `setQueryData`/refetch of `sessionKeys.detail`) and
 * parses it with the Rebellion schema. `game-table[data-game-id]` is the game id, `data-session-id` the session (Q-10).
 */
export default function TableScreen({
  sessionId,
  gameId,
  status,
  view,
  backHref,
}: TableScreenProps) {
  const parsed = useRebellionView(view);
  const kind = 'error' in parsed ? null : parsed.view.kind;
  // Whether this screen has shown the handoff screen: the next table is a hot-seat switch (focus its heading).
  const [sawHandoff, setSawHandoff] = useState(false);
  if (kind === 'handoff' && !sawHandoff) setSawHandoff(true);

  if ('error' in parsed) return <InvalidView backHref={backHref} />;
  if (parsed.view.kind === 'handoff') {
    return (
      <HandoffScreen key="handoff" sessionId={sessionId} view={parsed.view} backHref={backHref} />
    );
  }
  // A different viewer (hot-seat) remounts the whole table: fresh stores, map fitted again.
  return (
    <Table
      key={`player-${parsed.view.viewer}`}
      sessionId={sessionId}
      gameId={gameId}
      status={status}
      view={parsed.view}
      backHref={backHref}
      focusHeading={sawHandoff}
    />
  );
}
