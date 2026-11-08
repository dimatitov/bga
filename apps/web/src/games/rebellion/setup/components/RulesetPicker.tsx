import {
  type GameRuleset,
  GameRulesetSchema,
  isSupportedRuleset,
} from '@bga/game-rebellion/schema';
import { AvailabilityPicker } from './AvailabilityPicker';

export interface RulesetPickerProps {
  value: GameRuleset;
  onChange: (ruleset: GameRuleset) => void;
  disabled?: boolean;
}

/** «4. Набор правил»: Base ● / Rise of the Empire · скоро (disabled), `setup-ruleset-<r>`. */
export function RulesetPicker(props: RulesetPickerProps) {
  return (
    <AvailabilityPicker
      {...props}
      testId="setup-ruleset"
      stepKey="rebellion.setup:newGame.rulesetStep"
      labelPrefix="rebellion.common:ruleset"
      soonHintKey="rebellion.setup:newGame.rulesetSoonHint"
      values={GameRulesetSchema.options}
      isAvailable={isSupportedRuleset}
    />
  );
}
