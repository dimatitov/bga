/** Localized names of game objects (keys from game-data: `systems.<id>`, `regions.<id>`, `pieces.<typeKey>`). */
import {
  type Piece,
  type PlayerViewMock,
  type System,
  UNKNOWN_TYPE_KEY,
} from '@bga/game-rebellion/schema';
import type { TFunction } from 'i18next';

export function systemName(t: TFunction, system: Pick<System, 'nameKey'> | undefined): string {
  if (!system) return t('rebellion.board:system.unknown');
  return t(system.nameKey, { ns: 'rebellion.gameData' });
}

export function systemNameById(
  t: TFunction,
  view: Pick<PlayerViewMock, 'systems'>,
  id: string,
): string {
  return systemName(
    t,
    view.systems.find((s) => s.id === id),
  );
}

export function regionName(t: TFunction, regionId: string): string {
  return t(`regions.${regionId}`, { ns: 'rebellion.gameData' });
}

export function isUnknownPiece(piece: Pick<Piece, 'typeKey'>): boolean {
  return piece.typeKey === UNKNOWN_TYPE_KEY;
}

export function pieceName(t: TFunction, piece: Pick<Piece, 'typeKey'> | undefined): string {
  if (!piece || isUnknownPiece(piece)) return t('rebellion.board:piece.unknown');
  return t(`pieces.${piece.typeKey}`, { ns: 'rebellion.gameData' });
}

export function factionName(t: TFunction, faction: string): string {
  return t(`rebellion.common:faction.${faction}`);
}

export function kindName(t: TFunction, kind: string): string {
  return t(`rebellion.common:pieceKind.${kind}`);
}

export function phaseName(t: TFunction, phase: string): string {
  return t(`rebellion.common:phase.${phase}`);
}
