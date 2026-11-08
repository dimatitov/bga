import ButtonBase from '@mui/material/ButtonBase';
import Box from '@mui/material/Box';
import { type KeyboardEvent, type ReactNode, useRef } from 'react';

export interface ChoiceOption<V extends string> {
  value: V;
  label: ReactNode;
  description?: ReactNode;
  icon?: ReactNode;
  testId?: string;
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
  disabled?: boolean;
  'data-testid'?: string;
}

/**
 * Accessible single choice: `role="radiogroup"` with `role="radio"` + `aria-checked` items,
 * roving tabindex and arrow-key navigation (WAI-ARIA radio group pattern).
 */
export function ChoiceGroup<V extends string>({
  options,
  value,
  onChange,
  labelledBy,
  variant = 'segment',
  disabled = false,
  'data-testid': testId,
}: ChoiceGroupProps<V>) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const selectedIndex = options.findIndex((o) => o.value === value);
  const tabStop = selectedIndex >= 0 ? selectedIndex : 0;

  const handleKeyDown = (e: KeyboardEvent, index: number) => {
    const delta =
      e.key === 'ArrowRight' || e.key === 'ArrowDown'
        ? 1
        : e.key === 'ArrowLeft' || e.key === 'ArrowUp'
          ? -1
          : 0;
    if (!delta) return;
    e.preventDefault();
    const next = (index + delta + options.length) % options.length;
    const option = options[next];
    if (!option) return;
    onChange(option.value);
    refs.current[next]?.focus();
  };

  const isCard = variant === 'card';

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
          : `repeat(${options.length}, minmax(0, max-content))`,
      }}
    >
      {options.map((option, index) => {
        const checked = option.value === value;
        return (
          <ButtonBase
            key={option.value}
            ref={(el) => {
              refs.current[index] = el;
            }}
            role="radio"
            aria-checked={checked}
            tabIndex={index === tabStop ? 0 : -1}
            disabled={disabled}
            data-testid={option.testId}
            data-value={option.value}
            onClick={() => onChange(option.value)}
            onKeyDown={(e) => handleKeyDown(e, index)}
            sx={{
              justifyContent: 'flex-start',
              alignItems: isCard ? 'flex-start' : 'center',
              textAlign: 'left',
              gap: 1.5,
              minHeight: 40,
              px: isCard ? 2.5 : 2,
              py: isCard ? 2 : 1,
              borderRadius: 1,
              border: 2,
              borderColor: checked ? 'primary.main' : 'divider',
              bgcolor: checked ? 'action.selected' : 'background.paper',
              color: 'text.primary',
              '&:hover': { borderColor: checked ? 'primary.main' : 'text.secondary' },
            }}
          >
            {option.icon}
            <Box component="span" sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
              <Box component="span" sx={{ fontWeight: 600, fontSize: isCard ? 16 : 14 }}>
                {option.label}
              </Box>
              {option.description ? (
                <Box component="span" sx={{ color: 'text.secondary', fontSize: 13 }}>
                  {option.description}
                </Box>
              ) : null}
            </Box>
          </ButtonBase>
        );
      })}
    </Box>
  );
}
