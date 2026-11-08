import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Typography from '@mui/material/Typography';
import type { PlayerViewMock } from '@bga/game-rebellion/schema';
import { useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { useTranslation } from 'react-i18next';
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
import { SessionTopBar } from './components/SessionTopBar';
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

/**
 * Table of an old `mock-v1` session (SWR-002…004 board, moved here unchanged in SWR-005 FE-0; plan-frontend §0.6,
 * §3.1): the fictional map with the mock rules. Not developed further — new sessions use the `core-v1` table.
 * `game-table[data-rules-engine="mock-v1"]` tells the two tables apart (plan-frontend §9).
 */
export function LegacyTable({
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
  view: PlayerViewMock;
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
        data-rules-engine={view.rulesEngine}
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
        <SessionTopBar
          view={view}
          status={status}
          saveStatus={saveStatus}
          backHref={backHref}
          badgeVariant="legacy"
        />
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
