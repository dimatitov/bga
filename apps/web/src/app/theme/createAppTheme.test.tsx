import Button from '@mui/material/Button';
import ButtonBase, { type ButtonBaseActions } from '@mui/material/ButtonBase';
import { ThemeProvider } from '@mui/material/styles';
import { act, render, screen } from '@testing-library/react';
import { createRef } from 'react';
import { describe, expect, it } from 'vitest';
import { createAppTheme, FOCUS_RING } from './createAppTheme';
import { tokens } from './tokens';

/** WCAG 2.x relative luminance / contrast ratio of two `#RRGGBB` colours. */
function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}

describe('createAppTheme — D-A-5 focus ring (SWR-004 decision: contained buttons too)', () => {
  it('the ring colour contrasts ≥ 3:1 with the page backgrounds it sits on (outline-offset)', () => {
    expect(FOCUS_RING).toEqual({ outline: `2px solid ${tokens.focus}`, outlineOffset: 2 });
    expect(contrast(tokens.focus, tokens.background.default)).toBeGreaterThanOrEqual(3);
    expect(contrast(tokens.focus, tokens.background.paper)).toBeGreaterThanOrEqual(3);
  });

  it('every ButtonBase gets the ring on keyboard focus — no exclusion for contained buttons', () => {
    const theme = createAppTheme({ reduceMotion: false });
    const root = theme.components?.MuiButtonBase?.styleOverrides?.root as Record<string, unknown>;
    expect(root['&.Mui-focusVisible']).toEqual(FOCUS_RING);
    expect(root['&:focus-visible']).toEqual(FOCUS_RING);
    expect(JSON.stringify(root)).not.toContain(':not(');
  });

  it.each(['contained', 'outlined', 'text'] as const)(
    'keyboard-focused (Mui-focusVisible) %s Button and radio card → computed outline is the focus ring',
    async (variant) => {
      // jsdom has no `:focus-visible`, so MUI's keyboard heuristic is driven through the public `action` API.
      const button = createRef<ButtonBaseActions>();
      const card = createRef<ButtonBaseActions>();
      render(
        <ThemeProvider theme={createAppTheme({ reduceMotion: true })}>
          <Button variant={variant} action={button}>
            go
          </Button>
          <ButtonBase role="radio" aria-checked="true" action={card}>
            card
          </ButtonBase>
        </ThemeProvider>,
      );
      for (const [ref, el] of [
        [button, screen.getByRole('button', { name: 'go' })],
        [card, screen.getByRole('radio')],
      ] as const) {
        act(() => {
          el.focus();
          ref.current?.focusVisible();
        });
        expect(el).toHaveClass('Mui-focusVisible');
        // jsdom keeps the `outline` shorthand as written (no longhand expansion).
        const style = getComputedStyle(el);
        expect(style.outline.toLowerCase()).toBe(`2px solid ${tokens.focus.toLowerCase()}`);
        expect(style.outlineOffset).toBe('2px');
      }
    },
  );
});
