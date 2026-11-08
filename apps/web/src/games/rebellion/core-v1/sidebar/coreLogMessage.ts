/**
 * Texts of the `core-v1` event log and of the response announcements (SWR-005 plan-frontend §7, §8.5; Worker P2).
 * Pure: `(event | announcement, t, view) → string`. Events arrive already redacted by the server — a `null` system
 * means the hidden rebel-base zone and is shown as «скрытая зона» (never looked up). Unknown event types fall back
 * to `rebellion.match:log.unknown`.
 *
 * Side-dependent verbs use the i18next context (`_rebels` / `_empire`): «Повстанцы пасуют» / «Империя пасует».
 * Names of data objects come from `rebellion.data` (Worker M): `systems.<id>`, `leaders.<id>.name`,
 * `pieceTypes.<typeKey>`; until a key exists the id is shown (`defaultValue`), never `undefined`.
 */
import type { CoreViewEvent, FactionId, PlayerViewCore } from '@bga/game-rebellion/schema';
import type { TFunction } from 'i18next';
import type { Announcement } from '../model/announcements';
import { announcementI18n } from '../model/announcements';

const DATA_NS = 'rebellion.data';

/** Minimal event shape so unknown future types still render (`rebellion.match:log.unknown`). */
export type CoreLogEvent = Pick<CoreViewEvent, 'seq' | 'at'> & {
  type: string;
  actor: string;
  payload?: unknown;
};

type ViewNames = Pick<PlayerViewCore, 'map' | 'units'>;

function isFaction(actor: string): actor is FactionId {
  return actor === 'rebels' || actor === 'empire';
}

export function coreFactionName(t: TFunction, side: string): string {
  return t(`rebellion.common:faction.${side}`);
}

/** System name; `null` = the hidden rebel-base zone («скрытая зона»). */
export function coreSystemName(t: TFunction, systemId: string | null, view?: ViewNames): string {
  if (systemId === null) return t('rebellion.match:log.hiddenZone');
  const nameKey =
    view?.map.systems.find((s) => s.id === systemId)?.nameKey ?? `systems.${systemId}`;
  return t(nameKey, { ns: DATA_NS, defaultValue: systemId });
}

export function coreLeaderName(t: TFunction, leaderId: string): string {
  return t(`leaders.${leaderId}.name`, { ns: DATA_NS, defaultValue: leaderId });
}

/** Unit name by its id in the current view (unit type → `pieceTypes.<typeKey>`); unknown → «юнит». */
export function coreUnitName(t: TFunction, unitId: string, view?: ViewNames): string {
  const typeKey = view?.units.find((u) => u.id === unitId)?.typeKey;
  if (!typeKey) return t('rebellion.match:log.unknownUnit');
  return t(`pieceTypes.${typeKey}`, { ns: DATA_NS, defaultValue: typeKey });
}

export function outcomeWinnerText(t: TFunction, winner: string): string {
  return t(`rebellion.match:outcome.winner.${winner}`);
}

export function outcomeReasonText(t: TFunction, reason: string): string {
  return t(`rebellion.match:outcome.reason.${reason}`);
}

/** Whether the event was an automatic AI move (`payload.auto`, AM-BE-4). */
export function isAutoEvent(event: CoreLogEvent): boolean {
  const payload = event.payload;
  return (
    typeof payload === 'object' && payload !== null && (payload as { auto?: unknown }).auto === true
  );
}

/** Localized one-line text of a `core-v1` log event. */
export function coreLogMessage(event: CoreLogEvent, t: TFunction, view?: ViewNames): string {
  const e = event as CoreViewEvent;
  const actor = isFaction(event.actor) ? coreFactionName(t, event.actor) : event.actor;
  const context = isFaction(event.actor) ? event.actor : undefined;
  switch (e.type) {
    case 'GAME_CREATED':
      return t('rebellion.match:log.GAME_CREATED');
    case 'HANDOFF_ACCEPTED':
      return t('rebellion.match:log.HANDOFF_ACCEPTED', { actor, context });
    case 'PHASE_STARTED':
      return t('rebellion.match:log.PHASE_STARTED', {
        round: e.payload.round,
        phase: t(`rebellion.common:phase.${e.payload.phase}`),
      });
    case 'SYSTEM_ACTIVATED':
      return t('rebellion.match:log.SYSTEM_ACTIVATED', {
        actor,
        leader: coreLeaderName(t, e.payload.leaderId),
        system: coreSystemName(t, e.payload.systemId, view),
      });
    case 'PIECES_MOVED':
      return t('rebellion.match:log.PIECES_MOVED', {
        actor,
        pieces: e.payload.pieceIds.map((id) => coreUnitName(t, id, view)).join(', '),
        from: coreSystemName(t, e.payload.fromSystemId, view),
        to: coreSystemName(t, e.payload.toSystemId, view),
      });
    case 'ACTIVATION_FINISHED':
      return t(
        e.payload.auto
          ? 'rebellion.match:log.ACTIVATION_FINISHED_auto'
          : 'rebellion.match:log.ACTIVATION_FINISHED',
        { actor, context },
      );
    case 'PASSED':
      return t(e.payload.auto ? 'rebellion.match:log.PASSED_auto' : 'rebellion.match:log.PASSED', {
        actor,
        context,
      });
    case 'LEADERS_RETURNED':
      return e.payload.leaderIds.length === 0
        ? t('rebellion.match:log.LEADERS_RETURNED_none')
        : t('rebellion.match:log.LEADERS_RETURNED', {
            leaders: e.payload.leaderIds.map((id) => coreLeaderName(t, id)).join(', '),
          });
    case 'TIME_ADVANCED':
      return t('rebellion.match:log.TIME_ADVANCED', { from: e.payload.from, to: e.payload.to });
    case 'BASE_REVEALED':
      return t('rebellion.match:log.BASE_REVEALED', {
        system: coreSystemName(t, e.payload.systemId, view),
      });
    case 'GAME_OVER':
      return t('rebellion.match:log.GAME_OVER', {
        winner: outcomeWinnerText(t, e.payload.winner),
        reason: outcomeReasonText(t, e.payload.reason),
      });
    default:
      return t('rebellion.match:log.unknown', { type: event.type });
  }
}

/**
 * Text of a response announcement (`announcementsFor` → aria-live / snackbar), built from the FE-0 contract
 * `announcementI18n` (`rebellion.match:announce.<kind>`): ids in the values are translated here (side → faction
 * name with the side as i18next context, systemId → system name, winner/reason → outcome texts).
 */
export function announcementText(a: Announcement, t: TFunction, view?: ViewNames): string {
  const { key, values } = announcementI18n(a);
  switch (a.kind) {
    case 'autoPass':
    case 'autoFinish':
    case 'opponentPassed':
      return t(key, { side: coreFactionName(t, a.side), context: a.side });
    case 'baseRevealed':
      return t(key, { systemId: coreSystemName(t, a.systemId, view) });
    case 'gameOver':
      return t(key, {
        winner: outcomeWinnerText(t, a.winner),
        reason: outcomeReasonText(t, a.reason),
      });
    default:
      return t(key, values);
  }
}
