import Box from '@mui/material/Box';
import ButtonBase from '@mui/material/ButtonBase';
import Typography from '@mui/material/Typography';
import { useTranslation } from 'react-i18next';
import { terminalTokens } from '@/shared/theme';
import { StatusBadge } from '@/shared/ui/terminal';
import { CARD_DETAIL_ID, availabilityOf, useCardParamText } from './cardHelpers';
import { CARD_DATA_NS, cardDefinition, cardName, cardType, cardTypeName } from './model/catalog';
import { usageForZone } from './model/cardUsage';
import type { ZoneModel } from './model/handModel';

const T = terminalTokens;
const C = T.color;

export interface CardItemProps {
  definitionId: string;
  zone: ZoneModel;
  selected: boolean;
  onSelect(): void;
}

/**
 * One card of the hand (plan-frontend §3.1): a toggle button row — name, type, key parameter, availability and a
 * short own description: the usage of the card's role in its current zone (`usageForZone`), else the type info.
 * `aria-pressed` + `aria-controls` the Card Detail region.
 */
export function CardItem({ definitionId, zone, selected, onSelect }: CardItemProps) {
  const { t } = useTranslation();
  const def = cardDefinition(definitionId);
  const param = useCardParamText(definitionId);
  const availability = availabilityOf(zone);
  const usageKey = def
    ? (usageForZone(def, zone.kind).current ?? cardType(def.typeId)?.descriptionKey)
    : undefined;
  const isProbeInHand = def?.typeId === 'probe' && zone.kind === 'hand';
  return (
    <ButtonBase
      data-testid={`card-hand-item-${definitionId}`}
      data-zone={zone.id}
      aria-pressed={selected}
      aria-controls={selected ? CARD_DETAIL_ID : undefined}
      id={`card-hand-item-${definitionId}`}
      onClick={onSelect}
      sx={{
        width: '100%',
        display: 'block',
        textAlign: 'left',
        p: '6px 8px',
        border: `1px solid ${selected ? C.amber : C.line}`,
        backgroundColor: selected ? T.selection.bg : 'transparent',
        color: C.paper,
        '&.Mui-focusVisible, &:focus-visible': {
          outline: `${T.focus.width}px solid ${T.focus.color}`,
          outlineOffset: T.focus.offset,
        },
      }}
    >
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap', minWidth: 0 }}>
        <Typography component="span" variant="body2" sx={{ fontWeight: 700, color: C.paper }}>
          {cardName(t, definitionId)}
        </Typography>
        {def && <StatusBadge tone="neutral">{cardTypeName(t, def.typeId)}</StatusBadge>}
        <StatusBadge tone={availability.tone}>
          {t(`rebellion.cards:availability.${availability.key}`)}
        </StatusBadge>
      </Box>
      {param && (
        <Typography component="span" variant="caption" sx={{ display: 'block', color: C.muted }}>
          {param}
          {isProbeInHand && ` · ${t('rebellion.cards:hand.noBaseHere')}`}
        </Typography>
      )}
      {usageKey && (
        <Typography
          component="span"
          variant="caption"
          data-testid="card-hand-item-usage"
          sx={{ display: 'block', color: C.paper }}
        >
          {t(usageKey, { ns: CARD_DATA_NS })}
        </Typography>
      )}
    </ButtonBase>
  );
}
