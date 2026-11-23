import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { terminalTokens } from '@/shared/theme';
import { CardItem } from './CardItem';
import { cardZoneName } from './model/catalog';
import type { ZoneModel } from './model/handModel';
import { useCardUiStore } from './model/cardUiStore';

const C = terminalTokens.color;

export interface CardZoneSectionProps {
  zone: ZoneModel;
  headingLevel?: 'h3' | 'h4';
  /** Text instead of «Карт нет» for an empty visible zone (e.g. «Карта базы не зарегистрирована»). */
  emptyText?: string;
  /** Extra content under the zone (e.g. the registration hint). */
  children?: ReactNode;
}

/**
 * A card zone (plan-frontend §3.1): heading `rebellion.data:cards.zones.<id>`, then the visible cards as `CardItem`s,
 * or only the count when the server did not send the cards (`cards: null`).
 */
export function CardZoneSection({
  zone,
  headingLevel = 'h4',
  emptyText,
  children,
}: CardZoneSectionProps) {
  const { t } = useTranslation();
  const selected = useCardUiStore((s) => s.selected);
  const select = useCardUiStore((s) => s.select);
  const clear = useCardUiStore((s) => s.clear);
  const visible = zone.cards !== null;
  return (
    <Box
      data-testid={`card-zone-${zone.id}`}
      data-count={zone.count}
      data-visible={visible ? 'true' : 'false'}
      sx={{ '& + &': { mt: 1.25 } }}
    >
      <Typography
        component={headingLevel}
        variant="meta"
        sx={{ m: 0, mb: 0.5, color: C.muted, display: 'block' }}
      >
        {cardZoneName(t, zone.id)}
      </Typography>
      {zone.cards === null ? (
        <Typography variant="body2" sx={{ color: C.paper }}>
          {t('rebellion.cards:hand.hiddenCount', { count: zone.count })}
        </Typography>
      ) : zone.cards.length === 0 ? (
        <Typography variant="body2" sx={{ color: C.muted }}>
          {emptyText ?? t('rebellion.cards:hand.empty')}
        </Typography>
      ) : (
        <Box component="ul" sx={{ listStyle: 'none', m: 0, p: 0, display: 'grid', gap: '6px' }}>
          {zone.cards.map((card) => {
            const isSelected =
              selected?.definitionId === card.definitionId && selected.zoneId === zone.id;
            return (
              <li key={card.instanceId}>
                <CardItem
                  definitionId={card.definitionId}
                  zone={zone}
                  selected={isSelected}
                  onSelect={() => (isSelected ? clear() : select(card.definitionId, zone.id))}
                />
              </li>
            );
          })}
        </Box>
      )}
      {children}
    </Box>
  );
}
