import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import { factions } from '@bga/game-rebellion/assets';
import { type FactionId } from '@bga/game-rebellion/schema';
import { useId } from 'react';
import { useTranslation } from 'react-i18next';
import { ChoiceGroup } from '@/shared/ui';
import { FactionEmblem } from '../../ui/FactionEmblem';
import { StepHeading } from './StepHeading';

/** Card order: the default (Rebels) first (D-SW4-3). */
const FACTION_ORDER: readonly FactionId[] = ['rebels', 'empire'];

export interface FactionCardsProps {
  value: FactionId;
  onChange: (faction: FactionId) => void;
  disabled?: boolean;
}

/**
 * «1. Ваша сторона»: two radio cards from the `factions` registry — emblem, name, tagline, faction-colour
 * stripe; the selected one has the primary border + background + ✓ «Выбрано» (D-SW4-3/4, ux §13.3).
 * Display only: no game logic here.
 */
export function FactionCards({ value, onChange, disabled }: FactionCardsProps) {
  const { t } = useTranslation();
  const labelId = useId();
  return (
    <section>
      <StepHeading id={labelId}>{t('rebellion.setup:newGame.factionStep')}</StepHeading>
      <ChoiceGroup
        variant="card"
        labelledBy={labelId}
        value={value}
        onChange={onChange}
        disabled={disabled}
        data-testid="setup-faction-group"
        options={FACTION_ORDER.map((id) => {
          const visual = factions[id];
          return {
            value: id,
            testId: `setup-faction-${id}`,
            icon: <FactionEmblem faction={id} size={{ xs: 40, sm: 56 }} />,
            label: t(visual.nameKey),
            description: t(visual.taglineKey),
            accentColor: visual.color,
            // The state is carried by aria-checked; the visible mark is decorative.
            badge:
              id === value ? (
                <span
                  aria-hidden="true"
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}
                >
                  <CheckCircleIcon fontSize="small" />
                  {t('rebellion.setup:newGame.selected')}
                </span>
              ) : null,
          };
        })}
      />
    </section>
  );
}
