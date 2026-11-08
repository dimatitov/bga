import { useId } from 'react';
import { useTranslation } from 'react-i18next';
import { ChoiceGroup, VisuallyHidden } from '@/shared/ui';
import { StepHeading } from './StepHeading';

export interface AvailabilityPickerProps<V extends string> {
  /** Group testid; options get `<testId>-<value>`. */
  testId: string;
  stepKey: string;
  /** i18n key prefix of option labels (`<labelPrefix>.<value>`). */
  labelPrefix: string;
  /** Why an unavailable option cannot be chosen (`aria-describedby`). */
  soonHintKey: string;
  values: readonly V[];
  isAvailable: (value: V) => boolean;
  value: V;
  onChange: (value: V) => void;
  disabled?: boolean;
}

/**
 * Choice where some values are shown but not available yet (ruleset / game mode, D-SW4-8, AC-05 client):
 * unavailable options carry «скоро», `aria-disabled`, a hint, and are skipped by click and arrows.
 */
export function AvailabilityPicker<V extends string>({
  testId,
  stepKey,
  labelPrefix,
  soonHintKey,
  values,
  isAvailable,
  value,
  onChange,
  disabled,
}: AvailabilityPickerProps<V>) {
  const { t } = useTranslation();
  const labelId = useId();
  const hintId = useId();
  return (
    <section>
      <StepHeading id={labelId}>{t(stepKey)}</StepHeading>
      <ChoiceGroup
        labelledBy={labelId}
        value={value}
        onChange={onChange}
        disabled={disabled}
        columns="stack-xs"
        data-testid={testId}
        options={values.map((v) => {
          const available = isAvailable(v);
          return {
            value: v,
            testId: `${testId}-${v}`,
            label: t(`${labelPrefix}.${v}`),
            disabled: !available,
            badge: available ? null : `· ${t('rebellion.setup:newGame.soon')}`,
            describedBy: available ? undefined : hintId,
          };
        })}
      />
      <VisuallyHidden id={hintId}>{t(soonHintKey)}</VisuallyHidden>
    </section>
  );
}
