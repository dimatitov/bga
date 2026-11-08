import Typography from '@mui/material/Typography';
import { type Faction } from '@swr/contracts';
import { useId } from 'react';
import { useTranslation } from 'react-i18next';
import { ChoiceGroup, PieceGlyph } from '@/shared/ui';

const FACTIONS: Faction[] = ['empire', 'rebellion'];

export interface FactionPickerProps {
  value: Faction | null;
  onChange: (faction: Faction) => void;
  disabled?: boolean;
}

/** Two large radio cards (D-N-3); nothing selected by default (D-N-2). */
export function FactionPicker({ value, onChange, disabled }: FactionPickerProps) {
  const { t } = useTranslation();
  const labelId = useId();
  return (
    <section>
      <Typography id={labelId} variant="overline" component="h2" color="text.secondary">
        {t('setup:newGame.factionStep')}
      </Typography>
      <ChoiceGroup
        variant="card"
        labelledBy={labelId}
        value={value}
        onChange={onChange}
        disabled={disabled}
        data-testid="setup-faction"
        options={FACTIONS.map((faction) => ({
          value: faction,
          testId: `setup-faction-${faction}`,
          icon: <PieceGlyph kind="unit" owner={faction} size={28} />,
          label: t(`common:faction.${faction}`),
          description: t(`setup:newGame.factionDescription.${faction}`),
        }))}
      />
    </section>
  );
}
