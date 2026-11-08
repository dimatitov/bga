import Chip from '@mui/material/Chip';
import { type FactionId } from '@bga/game-rebellion/schema';
import { useTranslation } from 'react-i18next';
import { rebellionPalette } from '../theme/palette';
import { FactionEmblem } from './FactionEmblem';

export interface FactionChipProps {
  faction: FactionId;
  size?: 'small' | 'medium';
}

/** Faction name + the faction emblem (outlined = Rebels, filled = Empire — not colour-only coding, D-SW4-5). */
export function FactionChip({ faction, size = 'small' }: FactionChipProps) {
  const { t } = useTranslation();
  return (
    <Chip
      size={size}
      variant="outlined"
      data-faction={faction}
      icon={<FactionEmblem faction={faction} size={size === 'small' ? 16 : 20} />}
      label={t(`rebellion.common:faction.${faction}`)}
      sx={{ borderColor: rebellionPalette.faction[faction], '& .MuiChip-icon': { ml: 0.75 } }}
    />
  );
}
