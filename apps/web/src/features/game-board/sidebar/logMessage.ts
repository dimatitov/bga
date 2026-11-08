import type { GameEvent, PlayerView } from '@swr/contracts';
import type { TFunction } from 'i18next';
import { factionName, phaseName, pieceName, systemNameById } from '../model/labels';

/** Minimal event shape so unknown future types still render (`board:log.unknown`). */
export type LogEvent = Pick<GameEvent, 'seq' | 'at'> & {
  type: string;
  actor: string;
  payload?: unknown;
};

/** Localized one-line text of a log event (TC-WEB-13). Piece/system names are looked up in the current view. */
export function logMessage(
  event: LogEvent,
  t: TFunction,
  view?: Pick<PlayerView, 'systems' | 'pieces'>,
): string {
  const e = event as GameEvent;
  switch (e.type) {
    case 'GAME_CREATED':
      return t('board:log.GAME_CREATED');
    case 'PIECES_MOVED': {
      const { pieceIds, fromSystemId, toSystemId } = e.payload;
      const sys = (id: string) => (view ? systemNameById(t, view, id) : id);
      const pieces = pieceIds
        .map((id) =>
          pieceName(
            t,
            view?.pieces.find((p) => p.id === id),
          ),
        )
        .join(', ');
      return t('board:log.PIECES_MOVED', {
        actor: factionName(t, e.actor),
        pieces,
        count: pieceIds.length,
        from: sys(fromSystemId),
        to: sys(toSystemId),
      });
    }
    case 'PHASE_ADVANCED':
      return t('board:log.PHASE_ADVANCED', {
        actor: factionName(t, e.actor),
        round: e.payload.toRound,
        phase: phaseName(t, e.payload.toPhase),
        fromPhase: phaseName(t, e.payload.fromPhase),
      });
    default:
      return t('board:log.unknown', { type: event.type });
  }
}
