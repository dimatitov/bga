import { terminalTokens } from '@/shared/theme';

export type LedState = 'green' | 'amber' | 'red' | 'off';

const L = terminalTokens.led;

/** Fill / border per LED state (UI Kit `.led`). */
export const LED_COLORS: Readonly<Record<LedState, { fill: string; border: string }>> = {
  green: { fill: L.green, border: L.green },
  amber: { fill: L.amber, border: L.amber },
  red: { fill: L.red, border: L.red },
  off: { fill: L.offFill, border: L.offBorder },
};
