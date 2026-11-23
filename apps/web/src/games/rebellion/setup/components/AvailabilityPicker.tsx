import { useId } from 'react';
import { useTranslation } from 'react-i18next';
import { ChoiceGroup, VisuallyHidden } from '@/shared/ui';
import { StepHeading } from './StepHeading';

/** Why a value cannot be chosen: a short badge after the label and a hint (`aria-describedby`). */
export interface UnavailableReason {
  /** i18n key of the badge text (rendered as `· <text>`). */
  badgeKey: string;
  /** i18n key of the hint read by assistive technology. */
  hintKey: string;
}

export interface AvailabilityPickerProps<V extends string> {
  /** Group testid; options get `<testId>-<value>`. */
  testId: string;
  stepKey: string;
  /** i18n key prefix of option labels (`<labelPrefix>.<value>`). */
  labelPrefix: string;
  /** Default hint of an unavailable option («not supported yet», `aria-describedby`). */
  soonHintKey: string;
  values: readonly V[];
  isAvailable: (value: V) => boolean;
  /**
   * Per-value reason of unavailability (SWR-010 §7, e.g. «only against AI»); `null`/absent → «скоро» +
   * `soonHintKey`.
   */
  unavailableReason?: (value: V) => UnavailableReason | null;
  /** i18n key of a visible one-line explanation under an available option (`null` → none). */
  availableHintKey?: (value: V) => string | null;
  value: V;
  onChange: (value: V) => void;
  disabled?: boolean;
}

/**
 * Choice where some values are shown but not available (ruleset / game mode, D-SW4-8, AC-05 client, AC-22):
 * unavailable options carry a badge («скоро» or a per-value reason), `aria-disabled`, a hint, and are skipped by
 * click and arrows.
 */
export function AvailabilityPicker<V extends string>({
  testId,
  stepKey,
  labelPrefix,
  soonHintKey,
  values,
  isAvailable,
  unavailableReason,
  availableHintKey,
  value,
  onChange,
  disabled,
}: AvailabilityPickerProps<V>) {
  const { t } = useTranslation();
  const labelId = useId();
  const hintBaseId = useId();
  const options = values.map((v) => {
    const available = isAvailable(v);
    const reason: UnavailableReason | null = available
      ? null
      : (unavailableReason?.(v) ?? {
          badgeKey: 'rebellion.setup:newGame.soon',
          hintKey: soonHintKey,
        });
    const hintKey = available ? (availableHintKey?.(v) ?? null) : null;
    return { v, reason, hintKey, hintId: `${hintBaseId}-${v}` };
  });
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
        options={options.map(({ v, reason, hintKey, hintId }) => ({
          value: v,
          testId: `${testId}-${v}`,
          label: t(`${labelPrefix}.${v}`),
          description: hintKey ? t(hintKey) : undefined,
          disabled: reason !== null,
          badge: reason ? `· ${t(reason.badgeKey)}` : null,
          describedBy: reason ? hintId : undefined,
        }))}
      />
      {options.map(({ v, reason, hintId }) =>
        reason ? (
          <VisuallyHidden key={v} id={hintId}>
            {t(reason.hintKey)}
          </VisuallyHidden>
        ) : null,
      )}
    </section>
  );
}
