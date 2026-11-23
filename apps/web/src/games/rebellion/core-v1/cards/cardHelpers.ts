/** SWR-010 FE-A: shared helpers of the Card Hand / Card Detail components (no components here: fast refresh). */
import { useTranslation } from 'react-i18next';
import type { StatusTone } from '@/shared/ui/terminal';
import { useCoreBoard } from '../model/coreContext';
import { CARD_DATA_NS, systemOfCard } from './model/catalog';
import type { ZoneModel } from './model/handModel';

export const CARD_DETAIL_ID = 'card-detail';

export type CardAvailability = 'inHand' | 'secret' | 'physical' | 'reference' | 'revealed';

/** Availability of a card in a zone, from the zone's own fields (never from hidden data). */
export function availabilityOf(zone: Pick<ZoneModel, 'kind' | 'authority' | 'owner'>): {
  key: CardAvailability;
  tone: StatusTone;
} {
  if (zone.authority === 'physical') return { key: 'physical', tone: 'amber' };
  if (zone.kind === 'removed') return { key: 'reference', tone: 'neutral' };
  if (zone.kind === 'revealed') return { key: 'revealed', tone: 'red' };
  if (zone.kind === 'special') return { key: 'secret', tone: 'amber' };
  return { key: 'inHand', tone: 'green' };
}

/** «Система: Хот · Внешнее кольцо» for a probe card (region from the map of the view, if the system is on it). */
export function useCardParamText(definitionId: string): string | null {
  const { t } = useTranslation();
  const { view } = useCoreBoard();
  const systemId = systemOfCard(definitionId);
  if (systemId === null) return null;
  const regionId = view.map.systems.find((s) => s.id === systemId)?.regionId;
  const system = t(`systems.${systemId}`, { ns: CARD_DATA_NS, defaultValue: systemId });
  if (regionId === undefined) return system;
  const region = t(`regions.${regionId}`, { ns: CARD_DATA_NS, defaultValue: regionId });
  return t('rebellion.cards:hand.paramSystem', { system, region });
}
