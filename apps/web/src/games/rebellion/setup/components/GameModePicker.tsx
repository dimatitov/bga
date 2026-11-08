import { type GameMode, GameModeSchema, isSupportedGameMode } from '@bga/game-rebellion/schema';
import { AvailabilityPicker } from './AvailabilityPicker';

export interface GameModePickerProps {
  value: GameMode;
  onChange: (mode: GameMode) => void;
  disabled?: boolean;
}

/** «5. Режим»: Digital ● / With physical components · скоро (disabled), `setup-mode-<m>`. */
export function GameModePicker(props: GameModePickerProps) {
  return (
    <AvailabilityPicker
      {...props}
      testId="setup-mode"
      stepKey="rebellion.setup:newGame.modeStep"
      labelPrefix="rebellion.common:mode"
      soonHintKey="rebellion.setup:newGame.modeSoonHint"
      values={GameModeSchema.options}
      isAvailable={isSupportedGameMode}
    />
  );
}
