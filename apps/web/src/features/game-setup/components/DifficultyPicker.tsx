import Typography from '@mui/material/Typography';
import { type Difficulty } from '@swr/contracts';
import { useId } from 'react';
import { useTranslation } from 'react-i18next';
import { ChoiceGroup } from '@/shared/ui';

const DIFFICULTIES: Difficulty[] = ['easy', 'normal', 'hard'];

export interface DifficultyPickerProps {
  value: Difficulty;
  onChange: (difficulty: Difficulty) => void;
  disabled?: boolean;
}

/** `setup-difficulty` group with `setup-difficulty-<d>` options (R-10). */
export function DifficultyPicker({ value, onChange, disabled }: DifficultyPickerProps) {
  const { t } = useTranslation();
  const labelId = useId();
  return (
    <section>
      <Typography id={labelId} variant="overline" component="h2" color="text.secondary">
        {t('setup:newGame.difficultyStep')}
      </Typography>
      <ChoiceGroup
        labelledBy={labelId}
        value={value}
        onChange={onChange}
        disabled={disabled}
        data-testid="setup-difficulty"
        options={DIFFICULTIES.map((difficulty) => ({
          value: difficulty,
          testId: `setup-difficulty-${difficulty}`,
          label: t(`common:difficulty.${difficulty}`),
        }))}
      />
    </section>
  );
}
