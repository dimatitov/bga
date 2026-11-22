import { ThemeProvider } from '@mui/material/styles';
import { render } from '@testing-library/react';
import type { ReactElement } from 'react';
import { createAppTheme } from '@/app/theme/createAppTheme';

/** Test-only: renders a UI Kit element inside the app theme. */
export function renderKit(ui: ReactElement, { reduceMotion = false } = {}) {
  return render(<ThemeProvider theme={createAppTheme({ reduceMotion })}>{ui}</ThemeProvider>);
}

/** '#AABBCC' → 'rgb(170, 187, 204)' (jsdom colour serialisation). */
export function rgb(hex: string): string {
  const n = Number.parseInt(hex.slice(1), 16);
  return `rgb(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255})`;
}
