import {
  type GameMode,
  GameModeSchema,
  isSupportedGameMode,
  isSupportedGameModeFor,
  type OpponentType,
} from '@bga/game-rebellion/schema';
import { AvailabilityPicker, type UnavailableReason } from './AvailabilityPicker';

export interface GameModePickerProps {
  value: GameMode;
  onChange: (mode: GameMode) => void;
  /** Availability depends on the opponent: `physical_companion` only against AI (SWR-010 §7, AC-22). */
  opponentType: OpponentType;
  disabled?: boolean;
}

const AI_ONLY: UnavailableReason = {
  badgeKey: 'rebellion.setup:newGame.aiOnly',
  hintKey: 'rebellion.setup:newGame.modeAiOnlyHint',
};

/**
 * «5. Режим»: Digital ● / With physical components (AI only; `· только против AI` + hint for a human opponent),
 * a mode the game does not support at all stays «скоро». `setup-mode-<m>`.
 */
export function GameModePicker({ opponentType, ...props }: GameModePickerProps) {
  return (
    <AvailabilityPicker
      {...props}
      testId="setup-mode"
      stepKey="rebellion.setup:newGame.modeStep"
      labelPrefix="rebellion.common:mode"
      soonHintKey="rebellion.setup:newGame.modeSoonHint"
      values={GameModeSchema.options}
      isAvailable={(m) => isSupportedGameModeFor(m, opponentType)}
      // Supported in general but not for this opponent → «only against AI»; otherwise the default «скоро».
      unavailableReason={(m) => (isSupportedGameMode(m) ? AI_ONLY : null)}
      availableHintKey={(m) =>
        m === 'physical_companion' ? 'rebellion.setup:newGame.modePhysicalHint' : null
      }
    />
  );
}
