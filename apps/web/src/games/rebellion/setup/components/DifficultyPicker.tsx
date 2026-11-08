import Typography from '@mui/material/Typography';
import { type AIDifficulty } from '@bga/game-rebellion/schema';
import { useId } from 'react';
import { useTranslation } from 'react-i18next';
import { ChoiceGroup } from '@/shared/ui';
import { StepHeading } from './StepHeading';

const DIFFICULTIES: readonly AIDifficulty[] = ['easy', 'normal', 'hard'];

export interface DifficultyPickerProps {
  value: AIDifficulty;
  onChange: (difficulty: AIDifficulty) => void;
  disabled?: boolean;
}

/** «3. Сложность AI»: `setup-difficulty` group with `setup-difficulty-<d>` options (AI opponent only, AC-04). */
export function DifficultyPicker({ value, onChange, disabled }: DifficultyPickerProps) {
  const { t } = useTranslation();
  const labelId = useId();
  return (
    <section>
      <StepHeading id={labelId}>{t('rebellion.setup:newGame.difficultyStep')}</StepHeading>
      <ChoiceGroup
        labelledBy={labelId}
        value={value}
        onChange={onChange}
        disabled={disabled}
        data-testid="setup-difficulty"
        options={DIFFICULTIES.map((difficulty) => ({
          value: difficulty,
          testId: `setup-difficulty-${difficulty}`,
          label: t(`rebellion.common:difficulty.${difficulty}`),
        }))}
      />
      <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
        {t('rebellion.setup:newGame.difficultyHint')}
      </Typography>
    </section>
  );
}
