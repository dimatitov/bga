import ButtonBase from '@mui/material/ButtonBase';
import Box from '@mui/material/Box';
import { alpha } from '@mui/material/styles';
import { type KeyboardEvent, type ReactNode, useRef } from 'react';

export interface ChoiceOption<V extends string> {
  value: V;
  label: ReactNode;
  description?: ReactNode;
  icon?: ReactNode;
  testId?: string;
  /**
   * Option shown but not selectable (e.g. «скоро»): `aria-disabled="true"`, never a tab stop, ignored by click
   * and skipped by the arrow keys. Text stays readable (`text.secondary`, not the faded MUI disabled style).
   */
  disabled?: boolean;
  /** Extra content at the end of the option (e.g. «✓ Выбрано», «скоро»). The caller decides `aria-hidden`. */
  badge?: ReactNode;
  /** Colour of a 4px stripe along the top edge of a `card` option (e.g. the faction colour). */
  accentColor?: string;
  /** id of an element describing the option (`aria-describedby`), e.g. why it is unavailable. */
  describedBy?: string;
}

export interface ChoiceGroupProps<V extends string> {
  options: ChoiceOption<V>[];
  /** `null` = nothing selected yet. */
  value: V | null;
  onChange: (value: V) => void;
  /** id of the visible group label. */
  labelledBy: string;
  /** `card` = large cards (D-N-3), `segment` = compact segmented row. */
  variant?: 'card' | 'segment';
  /**
   * Segment layout: `auto` = one row (default); `stack-xs` = one option per row on `xs`, a row from `sm` up —
   * for long labels on narrow screens (SWR-004 plan-frontend §2.6). Cards always stack on `xs`.
   */
  columns?: 'auto' | 'stack-xs';
  /** The whole group is inactive (e.g. while a request is pending). */
  disabled?: boolean;
  'data-testid'?: string;
}

/**
 * Accessible single choice: `role="radiogroup"` with `role="radio"` + `aria-checked` items,
 * roving tabindex and arrow-key navigation (WAI-ARIA radio group pattern). The checked item carries
 * `data-selected="true"` (state is not shown by colour only).
 */
export function ChoiceGroup<V extends string>({
  options,
  value,
  onChange,
  labelledBy,
  variant = 'segment',
  columns = 'auto',
  disabled = false,
  'data-testid': testId,
}: ChoiceGroupProps<V>) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const selectedIndex = options.findIndex((o) => o.value === value && !o.disabled);
  // The roving tab stop is never on an unavailable option.
  const tabStop = selectedIndex >= 0 ? selectedIndex : options.findIndex((o) => !o.disabled);

  const handleKeyDown = (e: KeyboardEvent, index: number) => {
    const delta =
      e.key === 'ArrowRight' || e.key === 'ArrowDown'
        ? 1
        : e.key === 'ArrowLeft' || e.key === 'ArrowUp'
          ? -1
          : 0;
    if (!delta) return;
    e.preventDefault();
    // Next available option in the arrow direction (wrapping); unavailable ones are skipped.
    for (let step = 1; step <= options.length; step++) {
      const next = (index + delta * step + options.length * step) % options.length;
      const option = options[next];
      if (!option || option.disabled) continue;
      if (next !== index) onChange(option.value);
      refs.current[next]?.focus();
      return;
    }
  };

  const isCard = variant === 'card';
  const segmentColumns = `repeat(${options.length}, minmax(0, max-content))`;

  return (
    <Box
      role="radiogroup"
      aria-labelledby={labelledBy}
      aria-disabled={disabled || undefined}
      data-testid={testId}
      sx={{
        display: 'grid',
        gap: isCard ? 2 : 1,
        gridTemplateColumns: isCard
          ? { xs: '1fr', sm: `repeat(${options.length}, 1fr)` }
          : columns === 'stack-xs'
            ? { xs: '1fr', sm: segmentColumns }
            : segmentColumns,
      }}
    >
      {options.map((option, index) => {
        const checked = option.value === value;
        const unavailable = option.disabled === true;
        return (
          <ButtonBase
            key={option.value}
            ref={(el) => {
              refs.current[index] = el;
            }}
            role="radio"
            aria-checked={checked}
            aria-disabled={unavailable || undefined}
            aria-describedby={option.describedBy}
            tabIndex={index === tabStop && !unavailable ? 0 : -1}
            disabled={disabled}
            data-testid={option.testId}
            data-value={option.value}
            data-selected={checked ? 'true' : undefined}
            onClick={() => {
              if (!unavailable) onChange(option.value);
            }}
            onKeyDown={(e) => handleKeyDown(e, index)}
            sx={{
              position: 'relative',
              overflow: 'hidden',
              justifyContent: 'flex-start',
              alignItems: isCard ? 'flex-start' : 'center',
              textAlign: 'left',
              gap: 1.5,
              minHeight: isCard ? 40 : 44,
              px: isCard ? 2.5 : 2,
              py: isCard ? 2 : 1,
              pt: isCard && option.accentColor ? 2.5 : undefined,
              borderRadius: 1,
              border: 2,
              borderColor: checked ? 'primary.main' : 'divider',
              // Selected tint keeps text.secondary ≥ 4.5:1 (action.selected gave 4.24:1, SWR-004 TC-VA-11).
              bgcolor: (theme) =>
                checked ? alpha(theme.palette.primary.main, 0.08) : theme.palette.background.paper,
              color: unavailable ? 'text.secondary' : 'text.primary',
              cursor: unavailable ? 'not-allowed' : undefined,
              '&:hover': {
                borderColor: checked ? 'primary.main' : unavailable ? 'divider' : 'text.secondary',
              },
              ...(isCard && option.accentColor
                ? {
                    '&::before': {
                      content: '""',
                      position: 'absolute',
                      top: 0,
                      left: 0,
                      right: 0,
                      height: 4,
                      bgcolor: option.accentColor,
                    },
                  }
                : {}),
            }}
          >
            {option.icon}
            <Box
              component="span"
              sx={{ display: 'flex', flexDirection: 'column', gap: 0.5, minWidth: 0, flex: 1 }}
            >
              <Box component="span" sx={{ fontWeight: 600, fontSize: isCard ? 16 : 14 }}>
                {option.label}
              </Box>
              {option.description ? (
                <Box component="span" sx={{ color: 'text.secondary', fontSize: 13 }}>
                  {option.description}
                </Box>
              ) : null}
            </Box>
            {option.badge ? (
              <Box
                component="span"
                sx={{
                  ml: 'auto',
                  flexShrink: 0,
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 0.5,
                  fontSize: 13,
                  fontWeight: 600,
                  color: unavailable ? 'text.secondary' : 'primary.main',
                }}
              >
                {option.badge}
              </Box>
            ) : null}
          </ButtonBase>
        );
      })}
    </Box>
  );
}
