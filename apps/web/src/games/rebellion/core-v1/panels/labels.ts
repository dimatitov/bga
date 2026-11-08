/**
 * Display names for the `core-v1` DOM panels (SWR-005 plan-frontend §8.1). Names of data come from the
 * `rebellion.data` namespace (Worker M): `systems.<id>`, `regions.<id>`, `leaders.<id>.name`, `pieceTypes.<typeKey>`.
 * Faction / system / leader names delegate to P2's helpers in `sidebar/coreLogMessage.ts` (one naming source for
 * the log and the panels); region and unit-type names fall back to the id. No rules here.
 */
import type { CoreLeaderView, FactionId, PlayerViewCore } from '@bga/game-rebellion/schema';
import type { TFunction } from 'i18next';
import { coreFactionName, coreLeaderName, coreSystemName } from '../sidebar/coreLogMessage';
import { unitById } from '../model/viewModel';

const DATA_NS = 'rebellion.data';

export function factionLabel(t: TFunction, side: FactionId | string): string {
  return coreFactionName(t, side);
}

export function systemLabel(t: TFunction, view: PlayerViewCore, systemId: string): string {
  return coreSystemName(t, systemId, view);
}

export function regionLabel(t: TFunction, view: PlayerViewCore, regionId: string): string {
  const region = view.map.regions.find((r) => r.id === regionId);
  const key = region?.nameKey ?? `regions.${regionId}`;
  return t(`${DATA_NS}:${key}`, { defaultValue: regionId });
}

export function leaderLabel(t: TFunction, leaderId: string): string {
  return coreLeaderName(t, leaderId);
}

/** `unit.rebels.x-wing` → `rebellion.data:pieceTypes.unit.rebels.x-wing`, fallback: the last segment. */
export function unitTypeLabel(t: TFunction, typeKey: string): string {
  const fallback = typeKey.split('.').pop() ?? typeKey;
  return t(`${DATA_NS}:pieceTypes.${typeKey}`, { defaultValue: fallback });
}

export function unitLabel(t: TFunction, view: PlayerViewCore, unitId: string): string {
  const unit = unitById(view, unitId);
  return unit ? unitTypeLabel(t, unit.typeKey) : unitId;
}

/** Where a leader is, as text (pool / system / hidden zone). */
export function leaderPlace(t: TFunction, view: PlayerViewCore, leader: CoreLeaderView): string {
  switch (leader.location.kind) {
    case 'pool':
      return t('rebellion.turn:context.inPool');
    case 'rebelBase':
      return t('rebellion.turn:context.inZone');
    case 'system':
      return t('rebellion.turn:context.inSystem', {
        system: systemLabel(t, view, leader.location.systemId),
      });
  }
}
