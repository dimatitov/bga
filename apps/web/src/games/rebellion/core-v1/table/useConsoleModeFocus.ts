import type { PlayerViewCore } from '@bga/game-rebellion/schema';
import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { announce } from '@/shared/feedback';
import { focusWhenReady, PX_TITLE_ID, TURN_TITLE_ID } from '../panels/focus';
import { consoleMode, headTask, TABLE_NS, taskTitle } from './model/tableModel';

/**
 * Focus on a console-mode switch (SWR-010 FE-B, plan-frontend §2.3). Only a **change** after mount moves the focus —
 * the first render (page load, reload, remount) leaves it to `RouteFocus` / `focusHeading`:
 * - `turn → physical` (e.g. the human's pass started a Refresh): focus the Physical Execution heading and read out
 *   «Table task: <title>»;
 * - `physical → turn` (the last task was confirmed): focus the turn panel heading (the response itself is read out
 *   by `useTableCommands`).
 * A switch that comes with the end of the game leaves the focus to the outcome banner (it focuses its own title).
 */
export function useConsoleModeFocus(view: PlayerViewCore): void {
  const { t } = useTranslation();
  const mode = consoleMode(view);
  const ended = view.outcome !== null;
  const prev = useRef({ mode, ended });
  const head = headTask(view);
  const title = head ? taskTitle(t, head) : null;

  useEffect(() => {
    const before = prev.current;
    prev.current = { mode, ended };
    if (before.mode === mode) return;
    if (ended && !before.ended) return;
    if (mode === 'physical') {
      focusWhenReady(PX_TITLE_ID);
      if (title) announce(t(`${TABLE_NS}:px.announce.task`, { title }));
    } else {
      focusWhenReady(TURN_TITLE_ID);
    }
  }, [mode, ended, title, t]);
}
