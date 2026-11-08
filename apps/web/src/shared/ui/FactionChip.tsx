import Chip from '@mui/material/Chip';
import { type Faction } from '@swr/contracts';
import { useTranslation } from 'react-i18next';
import { PieceGlyph } from './PieceGlyph';

export interface FactionChipProps {
  faction: Faction;
  size?: 'small' | 'medium';
}

/** Faction name + filled/outlined square (not colour-only coding). */
export function FactionChip({ faction, size = 'small' }: FactionChipProps) {
  const { t } = useTranslation();
  return (
    <Chip
      size={size}
      variant="outlined"
      data-faction={faction}
      icon={<PieceGlyph kind="unit" owner={faction} size={size === 'small' ? 14 : 18} />}
      label={t(`common:faction.${faction}`)}
      sx={{ borderColor: `faction.${faction}`, '& .MuiChip-icon': { ml: 0.75 } }}
    />
  );
}
