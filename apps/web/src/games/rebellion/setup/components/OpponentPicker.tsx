import Typography from '@mui/material/Typography';
import { type FactionId, type OpponentType, opponentOf } from '@bga/game-rebellion/schema';
import { useId } from 'react';
import { useTranslation } from 'react-i18next';
import { ChoiceGroup } from '@/shared/ui';
import { StepHeading } from './StepHeading';

const KINDS: readonly OpponentType[] = ['ai', 'human'];

export interface OpponentPickerProps {
  value: OpponentType;
  onChange: (kind: OpponentType) => void;
  /** The player's side: the caption names the other one (`opponentOf`, display only — never sent). */
  playerFaction: FactionId;
  disabled?: boolean;
}

/**
 * «2. Противник»: AI / second player on this device + live caption «AI играет за …» /
 * «Второй игрок играет за …» (D-SW4-6, AC-03). Full phrases per side (Russian case is not interpolated).
 */
export function OpponentPicker({ value, onChange, playerFaction, disabled }: OpponentPickerProps) {
  const { t } = useTranslation();
  const labelId = useId();
  const opponentFaction = opponentOf(playerFaction);
  return (
    <section>
      <StepHeading id={labelId}>{t('rebellion.setup:newGame.opponentStep')}</StepHeading>
      <ChoiceGroup
        labelledBy={labelId}
        value={value}
        onChange={onChange}
        disabled={disabled}
        columns="stack-xs"
        data-testid="setup-opponent"
        options={KINDS.map((kind) => ({
          value: kind,
          testId: `setup-opponent-${kind}`,
          label: t(
            kind === 'ai'
              ? 'rebellion.setup:newGame.opponentAi'
              : 'rebellion.setup:newGame.opponentHuman',
          ),
        }))}
      />
      <Typography
        variant="body2"
        aria-live="polite"
        data-testid="setup-opponent-caption"
        data-opponent-faction={opponentFaction}
        sx={{ mt: 1, fontWeight: 600 }}
      >
        {t(`rebellion.setup:newGame.opponentCaption.${value}.${opponentFaction}`)}
      </Typography>
      {value === 'human' ? (
        <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
          {t('rebellion.setup:newGame.humanHint')}
        </Typography>
      ) : null}
    </section>
  );
}
