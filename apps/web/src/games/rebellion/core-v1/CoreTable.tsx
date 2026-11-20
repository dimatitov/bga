import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Typography from '@mui/material/Typography';
import {
  type PlayerEvent,
  PlayerEventSchema,
  type PlayerViewCore,
} from '@bga/game-rebellion/schema';
import { useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import type { TableScreenProps } from '@/games/types';
import { type AutomationLastRun, useSessionAutomation } from '@/platform';
import { announce } from '@/shared/feedback';
import { useDragStore, useGlobalEscape, useSelectionStore } from '../board';
import { CoreBoardStage } from './canvas/CoreBoardStage';
import { useSendCommand } from '../table/hooks/useSendCommand';
import { aiSideOf, aiSummaryText, coreAutomationFlags } from './model/aiCommander';
import { CoreBoardContext, type CoreBoardContextValue } from './model/coreContext';
import { useCoreUiStore } from './model/coreUiStore';
import { BOARD_LIST_ID, focusWhenReady, TURN_TITLE_ID } from './panels/focus';
import { TurnControls } from './panels/TurnControls';
import { responseAnnouncements } from './panels/useTurnCommands';
import { CoreEventLog } from './sidebar/CoreEventLog';
import { CoreSidebar } from './sidebar/CoreSidebar';
import { CoreGameInfoPanel, CoreTopBar, OutcomeBanner } from './top-bar';

export interface CoreTableProps {
  sessionId: string;
  gameId: string;
  status: TableScreenProps['status'];
  view: PlayerViewCore;
  backHref: string;
  /** After a hot-seat switch the new side starts on the table heading (SWR-004 plan-frontend §5.3 step 5). */
  focusHeading: boolean;
}

/**
 * Grid of the core table (plan-frontend §3.4, §6 step 5): ≥ 1200 px map | sidebar 384; 900–1199 map | 320;
 * < 900 one column (top bar / map `min(64dvh, 85vw)` / sidebar) with vertical page scroll, never horizontal.
 */
const GRID = {
  display: 'grid',
  gridTemplateRows: { xs: 'auto min(64dvh, 85vw) auto', md: 'auto minmax(0, 1fr)' },
  gridTemplateColumns: {
    xs: 'minmax(0, 1fr)',
    md: 'minmax(0, 1fr) 320px',
    lg: 'minmax(0, 1fr) 384px',
  },
  gridTemplateAreas: { xs: '"top" "board" "side"', md: '"top top" "board side"' },
  height: { xs: 'auto', md: '100dvh' },
  overflow: { xs: 'visible', md: 'hidden' },
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

/**
 * Skip links: clipped to nothing until focused, then shown at the top-left of the table. Not hidden by an offset
 * (`top: -64`): content above the table (e.g. the in-flow automation notice of SessionHost on `xs`, SWR-006 D-1) would
 * bring an offset link into view.
 */
const SKIP_LINK = {
  position: 'absolute',
  left: 8,
  top: 8,
  zIndex: 1500,
  bgcolor: 'background.paper',
  // Explicit px: in `sx`, `width: 1` means 100% (that widened the page by `left` on xs).
  '&:not(:focus-visible)': {
    width: '1px',
    height: '1px',
    minWidth: 0,
    p: 0,
    overflow: 'hidden',
    clipPath: 'inset(50%)',
    whiteSpace: 'nowrap',
  },
} as const;

function focusObjectsList() {
  useSelectionStore.getState().setSidebarTab('objects');
  requestAnimationFrame(() =>
    document.querySelector<HTMLElement>(`#${BOARD_LIST_ID} [role="option"][tabindex="0"]`)?.focus(),
  );
}

function isTypingTarget(el: Element | null): boolean {
  return (
    el instanceof HTMLElement &&
    (el.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName))
  );
}

/**
 * Esc priority (plan-frontend §5.3 step 6): cancel a drag (global handler) → drop the armed leader (here, capture
 * phase, so the global handler does not also clear the selection) → clear the selection (global handler).
 */
function useDisarmOnEscape(disarmedText: string) {
  useEffect(() => {
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key !== 'Escape' || e.defaultPrevented) return;
      if (useDragStore.getState().drag) return;
      if (isTypingTarget(document.activeElement)) return;
      const ui = useCoreUiStore.getState();
      if (ui.armedLeaderId === null) return;
      ui.disarm();
      announce(disarmedText);
      e.preventDefault();
    };
    document.addEventListener('keydown', onKey, true);
    return () => document.removeEventListener('keydown', onKey, true);
  }, [disarmedText]);
}

/** Events of an automation run that this game understands (unknown ones are skipped, plan-frontend §6.4). */
function parseRunEvents(events: readonly unknown[]): PlayerEvent[] {
  return events.flatMap((e) => {
    const parsed = PlayerEventSchema.safeParse(e);
    return parsed.success ? [parsed.data] : [];
  });
}

/**
 * Reads out a new automation-run summary once (plan-frontend §6.4): «Ход AI: N действий» + what the AI did that is
 * announced anyway (its pass, a new round, the base reveal, the end of the game). Summaries of a command response
 * are announced by `useTurnCommands` with the command's own feedback, and a summary that was already there when
 * the table mounted is not repeated.
 */
function useAnnounceAutomationRuns(lastRun: AutomationLastRun | null, view: PlayerViewCore) {
  const { t, i18n } = useTranslation();
  const seenSeq = useRef(lastRun?.seq ?? 0);
  useEffect(() => {
    if (!lastRun || lastRun.seq <= seenSeq.current) return;
    seenSeq.current = lastRun.seq;
    if (lastRun.source !== 'run') return;
    const summary = aiSummaryText(t, lastRun.summary);
    const extra = responseAnnouncements(
      t,
      (k) => i18n.exists(k),
      view,
      parseRunEvents(lastRun.events),
    );
    const text = [summary, ...extra].filter(Boolean).join(' ');
    if (text) announce(text);
    // `view` only names things in the text; the `seq` guard reads each summary out once.
  }, [lastRun, view, t, i18n]);
}

/**
 * Table of a `core-v1` session (SWR-005 plan-frontend §3.4): context provider, store reconcile against every new
 * view, sr-only heading, skip links («To the turn panel», «To the object list»), the top bar, the map and the
 * sidebar (turn panel · context · tabs). Everything the player may do comes from `legalActions` via `viewModel`.
 * `game-table[data-rules-engine="core-v1"]` (+ `data-phase`, `data-active-side`, plan-frontend §9).
 *
 * Composition: `CoreTopBar` (P2) with `controls={<TurnControls />}`, `OutcomeBanner` (P2) over the map,
 * sidebar slots `log` (`CoreEventLog`, P2) and `gameInfo` (`CoreGameInfoPanel`, P2).
 * Map: `<CoreBoardStage />` (M) — the `board-canvas` container with the Konva stage, zoom controls and caption.
 *
 * SWR-006 (plan-frontend §6.2): the automation of the session comes from the platform (`useSessionAutomation`,
 * `null` outside SessionHost). `isPending` = a command in flight or an AI run in flight (every action disabled);
 * `aiThinking` = AI game and (a run in flight, or the viewer's PASS / FINISH_ACTIVATION in flight, Q-FE-3).
 */
export function CoreTable({
  sessionId,
  gameId,
  status,
  view,
  backHref,
  focusHeading,
}: CoreTableProps) {
  const { t } = useTranslation();
  const headingRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    if (focusHeading) headingRef.current?.focus();
  }, [focusHeading]);
  const { send, isPending: sending, pendingCommand, saveStatus } = useSendCommand(sessionId);
  const automation = useSessionAutomation();
  const { isPending, aiThinking } = coreAutomationFlags(
    view.settings,
    automation?.phase,
    sending,
    pendingCommand,
  );
  const aiGame = aiSideOf(view.settings) !== null;
  useAnnounceAutomationRuns(aiGame ? (automation?.lastRun ?? null) : null, view);
  const activateGame = useSelectionStore((s) => s.activateGame);
  const reconcileSelection = useSelectionStore((s) => s.reconcile);
  const reconcileUi = useCoreUiStore((s) => s.reconcile);

  useLayoutEffect(() => activateGame(sessionId), [activateGame, sessionId]);
  useEffect(() => {
    reconcileSelection(view);
    reconcileUi(view);
  }, [view, reconcileSelection, reconcileUi]);
  useDisarmOnEscape(t('rebellion.turn:pool.disarmed'));
  useGlobalEscape();

  const ctx = useMemo<CoreBoardContextValue>(
    () => ({ sessionId, view, send, isPending, aiThinking }),
    [sessionId, view, send, isPending, aiThinking],
  );

  return (
    <CoreBoardContext.Provider value={ctx}>
      <Box
        data-testid="game-table"
        data-session-id={sessionId}
        data-game-id={gameId}
        data-version={view.version}
        data-rules-engine={view.rulesEngine}
        data-phase={view.phase}
        data-active-side={view.activeSide}
        data-status={status}
        sx={GRID}
      >
        <Typography component="h1" ref={headingRef} tabIndex={-1} sx={SR_ONLY}>
          {t('rebellion.session:page.title')}
        </Typography>
        <Button
          onClick={() => focusWhenReady(TURN_TITLE_ID)}
          data-testid="skip-to-turn"
          sx={SKIP_LINK}
        >
          {t('rebellion.turn:skip.toTurn')}
        </Button>
        <Button onClick={focusObjectsList} data-testid="skip-to-list" sx={SKIP_LINK}>
          {t('rebellion.turn:skip.toList')}
        </Button>
        <CoreTopBar
          status={status}
          saveStatus={saveStatus}
          backHref={backHref}
          controls={<TurnControls />}
        />
        <Box sx={{ gridArea: 'board', minHeight: 0, minWidth: 0, position: 'relative' }}>
          <OutcomeBanner backHref={backHref} />
          <CoreBoardStage />
        </Box>
        <Box sx={{ gridArea: 'side', minHeight: 0 }}>
          <CoreSidebar log={<CoreEventLog />} gameInfo={<CoreGameInfoPanel status={status} />} />
        </Box>
      </Box>
    </CoreBoardContext.Provider>
  );
}
