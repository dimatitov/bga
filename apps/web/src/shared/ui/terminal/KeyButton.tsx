import Button, { type ButtonProps } from '@mui/material/Button';
import { forwardRef } from 'react';
import { Led, type LedState } from './Led';

export type KeyTone = 'default' | 'primary' | 'warning' | 'danger';

export interface KeyButtonProps extends Omit<ButtonProps, 'variant' | 'color'> {
  /** Key colour (theme variants): default = outlined key, primary / warning / danger = contained keys. */
  tone?: KeyTone;
  /** LED shown before the label. */
  led?: LedState;
  /** Toggle key: `aria-pressed` (selected look = amber, from the theme). */
  selected?: boolean;
}

const TONE: Readonly<Record<KeyTone, Pick<ButtonProps, 'variant' | 'color'>>> = {
  default: { variant: 'outlined', color: 'inherit' },
  primary: { variant: 'contained', color: 'primary' },
  warning: { variant: 'contained', color: 'warning' },
  danger: { variant: 'contained', color: 'error' },
};

/**
 * Hardware key of the UI Kit (TC-TK-08): a thin `Button` wrapper — every look (default / primary / warning / danger /
 * selected / disabled / pressed / focus) comes from the theme, so plain MUI buttons look the same.
 */
export const KeyButton = forwardRef<HTMLButtonElement, KeyButtonProps>(function KeyButton(
  { tone = 'default', led, selected, startIcon, ...rest },
  ref,
) {
  return (
    <Button
      ref={ref}
      {...TONE[tone]}
      data-tone={tone}
      aria-pressed={selected === undefined ? undefined : selected}
      startIcon={led ? <Led state={led} /> : startIcon}
      {...rest}
    />
  );
});
