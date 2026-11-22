import Box, { type BoxProps } from '@mui/material/Box';
import { keyframes } from '@mui/material/styles';
import { useReduceMotion } from '@/shared/settings';
import { terminalTokens } from '@/shared/theme';
import { LED_COLORS, type LedState } from './ledColors';

export type { LedState } from './ledColors';

export interface LedProps extends Omit<BoxProps, 'children'> {
  state: LedState;
  /** Blinks (e.g. «AI thinking»); off with reduced motion (setting or `prefers-reduced-motion`). */
  blink?: boolean;
}

const L = terminalTokens.led;

const blinkFrames = keyframes`
  0%, 55% { opacity: 1; }
  56%, 100% { opacity: 0.25; }
`;

/**
 * 8 px status LED (SWR-009 UI Kit, TC-TK-07). Decorative: always `aria-hidden` — the state is said in text next to it.
 * `data-state` mirrors the state, `data-blink` whether it actually blinks.
 */
export function Led({ state, blink = false, sx, ...rest }: LedProps) {
  const reduceMotion = useReduceMotion();
  const blinking = blink && !reduceMotion;
  const { fill, border } = LED_COLORS[state];
  return (
    <Box
      component="span"
      aria-hidden="true"
      data-state={state}
      data-blink={blinking ? 'true' : 'false'}
      {...rest}
      sx={[
        {
          display: 'inline-block',
          flex: 'none',
          width: L.size,
          height: L.size,
          borderRadius: '50%',
          border: `1px solid ${border}`,
          backgroundColor: fill,
          verticalAlign: 'middle',
          ...(blinking && { animation: `${blinkFrames} 1.1s steps(1, end) infinite` }),
        },
        ...(Array.isArray(sx) ? sx : [sx]),
      ]}
    />
  );
}
