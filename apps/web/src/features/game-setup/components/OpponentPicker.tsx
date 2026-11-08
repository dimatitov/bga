import Typography from '@mui/material/Typography';
import { type PlayerKind } from '@swr/contracts';
import { useId } from 'react';
import { useTranslation } from 'react-i18next';
import { ChoiceGroup } from '@/shared/ui';

const KINDS: PlayerKind[] = ['ai', 'human'];

export interface OpponentPickerProps {
  value: PlayerKind;
  onChange: (kind: PlayerKind) => void;
  disabled?: boolean;
}

export function OpponentPicker({ value, onChange, disabled }: OpponentPickerProps) {
  const { t } = useTranslation();
  const labelId = useId();
  return (
    <section>
      <Typography id={labelId} variant="overline" component="h2" color="text.secondary">
        {t('setup:newGame.opponentStep')}
      </Typography>
      <ChoiceGroup
        labelledBy={labelId}
        value={value}
        onChange={onChange}
        disabled={disabled}
        data-testid="setup-opponent"
        options={KINDS.map((kind) => ({
          value: kind,
          testId: `setup-opponent-${kind}`,
          label: t(kind === 'ai' ? 'setup:newGame.opponentAi' : 'setup:newGame.opponentHuman'),
        }))}
      />
      {value === 'human' ? (
        <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
          {t('setup:newGame.humanHint')}
        </Typography>
      ) : null}
    </section>
  );
}
