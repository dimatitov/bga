import type { Command, PlayerEvent, PlayerViewCore } from '@bga/game-rebellion/schema';
import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { announce } from '@/shared/feedback';
import { reportCommandFailure } from '../../board';
import type { SendOutcome } from '../../table/hooks/useSendCommand';
import { cardName } from '../cards/model/catalog';
import { aiSummaryText } from '../model/aiCommander';
import { useCoreBoard } from '../model/coreContext';
import { focusWhenReady, PX_TITLE_ID } from '../panels/focus';
import { inlineError, responseAnnouncements, responseEndedGame } from '../panels/useTurnCommands';
import { useTableErrorStore } from './model/tableErrorStore';
import { consoleMode, headTask, registrationOf, TABLE_NS, taskTitle } from './model/tableModel';

/**
 * The two Physical Execution commands (SWR-010 FE-B, plan-frontend §4.2, §4.3): `CONFIRM_TABLE_TASK { taskId }` and
 * `REGISTER_CARD { zoneId, definitionId }`, sent through the table's `send` (`useSendCommand`: actor = viewer,
 * `expectedVersion` from the session cache at send time). The task id and the registration zone are read from the
 * current view at click time. Double submit: `useSendCommand` ignores a second send while one is in flight (sync ref),
 * the keys are `disabled` while `isPending`, and the server answers a stale repeat with 409 / 422.
 * 200 → read out what happened (+ the AI summary of the same response), focus the new head (the `physical → turn`
 * switch is focused by `useConsoleModeFocus`); 422 → inline text under the head task; 409 / network → snackbar (the
 * sender already refetches the session).
 */
export function useTableCommands() {
  const { t, i18n } = useTranslation();
  const { send, isPending, view } = useCoreBoard();

  const run = useCallback(
    async (command: Command, own: string | null): Promise<SendOutcome> => {
      const taskId = headTask(view)?.id ?? null;
      const outcome = await send(command);
      if (outcome.ok) {
        useTableErrorStore.getState().clear();
        const next: PlayerViewCore | null =
          outcome.view.kind === 'player' && outcome.view.rulesEngine === 'core-v1'
            ? outcome.view
            : null;
        const events: PlayerEvent[] = outcome.events;
        const summary = outcome.automation ? aiSummaryText(t, outcome.automation) : null;
        const extra = next ? responseAnnouncements(t, (k) => i18n.exists(k), next, events) : [];
        let status: string | null = null;
        if (next && consoleMode(next) === 'physical') {
          const head = headTask(next);
          if (head) status = t(`${TABLE_NS}:px.announce.next`, { title: taskTitle(t, head) });
          if (!responseEndedGame(next, events)) focusWhenReady(PX_TITLE_ID);
        } else if (next) {
          status = t(`${TABLE_NS}:px.announce.synced`);
        }
        const text = [own, summary, ...extra, status].filter(Boolean).join(' ');
        if (text) announce(text);
        return outcome;
      }
      const text = inlineError(t, outcome);
      if (text !== null) useTableErrorStore.getState().set(taskId, text);
      else reportCommandFailure(t, outcome);
      return outcome;
    },
    [send, t, i18n, view],
  );

  /** Confirms the current head task (its id is taken from the view now, not from when the key was rendered). */
  const confirm = useCallback(async (): Promise<SendOutcome | null> => {
    const head = headTask(view);
    if (!head || head.completion !== 'confirm') return null;
    return run(
      { type: 'CONFIRM_TABLE_TASK', taskId: head.id },
      t(`${TABLE_NS}:px.announce.done`, { title: taskTitle(t, head) }),
    );
  }, [run, t, view]);

  /** Registers the Location card `definitionId` in the zone the server named (`view.table.registration.zoneId`). */
  const register = useCallback(
    async (definitionId: string): Promise<SendOutcome | null> => {
      const registration = registrationOf(view);
      if (!registration) return null;
      return run(
        { type: 'REGISTER_CARD', zoneId: registration.zoneId, definitionId },
        t(`${TABLE_NS}:register.done`, { card: cardName(t, definitionId) }),
      );
    },
    [run, t, view],
  );

  return { confirm, register, isPending };
}
