import type { Command, PlayerEvent, PlayerViewCore } from '@bga/game-rebellion/schema';
import type { TFunction } from 'i18next';
import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { announce } from '@/shared/feedback';
import { translateError } from '@/shared/i18n';
import { REBELLION_ERRORS_NS } from '../../i18n';
import { reportCommandFailure } from '../../board';
import type { CommandOutcome } from '../../board/model/boardContext';
import { IGNORED_CODE } from '../../board/model/commandFeedback';
import { announcementI18n, announcementsFor, endsGame } from '../model/announcements';
import { useCoreBoard } from '../model/coreContext';
import { useCoreUiStore } from '../model/coreUiStore';
import { activationTargets, type MoveSource } from '../model/viewModel';
import { focusWhenReady, MOVE_TITLE_ID, TURN_TITLE_ID } from './focus';
import { announcementText } from '../sidebar/coreLogMessage';
import { leaderLabel, systemLabel } from './labels';
import { useTurnErrorStore } from './turnErrorStore';

type Failure = Extract<CommandOutcome, { ok: false }>;

/** Rejections shown next to the control that caused them (422/400 with a reason); the rest go to the snackbar. */
const SNACKBAR_CODES = new Set([
  'VERSION_CONFLICT',
  'NOT_FOUND',
  'NETWORK',
  'INTERNAL',
  'HTTP_ERROR',
]);

/** Inline text of a rejection, or `null` when it is reported elsewhere (snackbar) or ignored. */
export function inlineError(t: TFunction, outcome: CommandOutcome): string | null {
  if (outcome.ok || outcome.code === IGNORED_CODE || SNACKBAR_CODES.has(outcome.code)) return null;
  return translateError(t, outcome, { gameNs: REBELLION_ERRORS_NS });
}

/**
 * Texts of what the server did in the same response that the player did not do themselves (auto-pass of the AI,
 * new round, base reveal, game over; plan-frontend §5.3), via P2's `announcementText`
 * (`rebellion.match:announce.*`). A key that does not exist is skipped instead of reading out a raw key.
 */
export function responseAnnouncements(
  t: TFunction,
  exists: (key: string) => boolean,
  view: PlayerViewCore,
  events: readonly PlayerEvent[],
): string[] {
  return announcementsFor(events, view.viewer)
    .filter((a) => exists(announcementI18n(a).key))
    .map((a) => announcementText(a, t, view));
}

/**
 * The response ended the game (`GAME_OVER` event or an outcome in the new view): the outcome banner owns the focus
 * then (it moves it to `game-over-title` itself), so the command handler must not move it to the turn panel
 * (SWR-005 D-2, plan-frontend §5.3).
 */
export function responseEndedGame(
  next: PlayerViewCore | null,
  events: readonly PlayerEvent[],
): boolean {
  return (next?.outcome ?? null) !== null || endsGame(events);
}

/**
 * The four `core-v1` turn commands (ACTIVATE_SYSTEM / MOVE_PIECES / FINISH_ACTIVATION / PASS) with the feedback
 * and focus rules of plan-frontend §5.3. Every command is built from what the caller took out of `legalActions`;
 * nothing is validated here — the server is the judge, its 422 reason is returned for inline display.
 */
export function useTurnCommands() {
  const { t, i18n } = useTranslation();
  const { send, isPending, view } = useCoreBoard();

  const run = useCallback(
    async (
      command: Command,
      onSuccess: (next: PlayerViewCore | null, events: PlayerEvent[]) => string | null,
      /** Where an inline rejection text goes; without it every rejection goes to the snackbar. */
      showInline?: (text: string | null) => void,
    ): Promise<CommandOutcome> => {
      const outcome = await send(command);
      if (outcome.ok) {
        const next =
          outcome.view.kind === 'player' && outcome.view.rulesEngine === 'core-v1'
            ? outcome.view
            : null;
        const own = onSuccess(next, outcome.events);
        const extra = next
          ? responseAnnouncements(t, (k) => i18n.exists(k), next, outcome.events)
          : [];
        const text = [own, ...extra].filter(Boolean).join(' ');
        if (text) announce(text);
        return outcome;
      }
      if (outcome.code === 'VERSION_CONFLICT') useCoreUiStore.getState().clearDraft();
      const text = showInline ? inlineError(t, outcome) : null;
      if (text !== null) showInline?.(text);
      else reportCommandFailure(t, outcome as Failure);
      return outcome;
    },
    [send, t, i18n],
  );

  const activate = useCallback(
    (leaderId: string, systemId: string) =>
      run(
        { type: 'ACTIVATE_SYSTEM', leaderId, systemId },
        () => {
          useCoreUiStore.getState().disarm();
          useTurnErrorStore.getState().clear();
          focusWhenReady(MOVE_TITLE_ID);
          return t('rebellion.turn:activate.done', {
            leader: leaderLabel(t, leaderId),
            system: systemLabel(t, view, systemId),
          });
        },
        (text) => useTurnErrorStore.getState().setActivation(text),
      ),
    [run, t, view],
  );

  const move = useCallback(
    (source: MoveSource, pieceIds: readonly string[]) =>
      run(
        {
          type: 'MOVE_PIECES',
          pieceIds: [...pieceIds],
          fromSystemId: source.fromSystemId,
          toSystemId: source.toSystemId,
        },
        (next, events) => {
          useCoreUiStore.getState().clearDraft(source.fromSystemId);
          useTurnErrorStore.getState().setMove(source.fromSystemId, null);
          // A move can end the game too (Empire victory after any move, R-9/Q-12): the banner owns the focus then.
          if (!responseEndedGame(next, events)) focusWhenReady(MOVE_TITLE_ID);
          return t('rebellion.turn:move.done', {
            count: pieceIds.length,
            system: systemLabel(t, view, source.toSystemId),
          });
        },
        (text) => useTurnErrorStore.getState().setMove(source.fromSystemId, text),
      ),
    [run, t, view],
  );

  const finish = useCallback(
    () =>
      run({ type: 'FINISH_ACTIVATION' }, (next, events) => {
        if (!responseEndedGame(next, events)) focusWhenReady(TURN_TITLE_ID);
        useTurnErrorStore.getState().clear();
        return t('rebellion.turn:finish.done');
      }),
    [run, t],
  );

  const pass = useCallback(
    () =>
      run({ type: 'PASS' }, (next, events) => {
        useCoreUiStore.getState().disarm();
        if (!responseEndedGame(next, events)) focusWhenReady(TURN_TITLE_ID);
        useTurnErrorStore.getState().clear();
        return t('rebellion.turn:pass.done');
      }),
    [run, t],
  );

  /** Arms `leaderId` (or disarms it when it is already armed) and reads out how many targets it has. */
  const toggleArm = useCallback(
    (leaderId: string) => {
      const store = useCoreUiStore.getState();
      useTurnErrorStore.getState().setActivation(null);
      if (store.armedLeaderId === leaderId) {
        store.disarm();
        announce(t('rebellion.turn:pool.disarmed'));
        return;
      }
      store.arm(leaderId);
      announce(
        t('rebellion.turn:pool.armed', {
          leader: leaderLabel(t, leaderId),
          count: activationTargets(view, leaderId).length,
        }),
      );
    },
    [t, view],
  );

  return { activate, move, finish, pass, toggleArm, isPending };
}
