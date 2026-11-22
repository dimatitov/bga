import Button from '@mui/material/Button';
import ButtonBase, { type ButtonBaseActions } from '@mui/material/ButtonBase';
import { ThemeProvider } from '@mui/material/styles';
import { act, render, screen } from '@testing-library/react';
import { createRef } from 'react';
import { describe, expect, it } from 'vitest';
import { createAppTheme, FOCUS_RING } from './createAppTheme';
import { terminalTokens } from '@/shared/theme';
import { tokens } from './tokens';

/** '#FFD166' → 'rgb(255, 209, 102)' (CSSOM colour serialisation). */
function hexToRgb(hex: string): string {
  const n = Number.parseInt(hex.slice(1), 16);
  return `rgb(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255})`;
}

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
  it('the ring is amber (SWR-009) and contrasts ≥ 3:1 with the surfaces it sits on (outline-offset)', () => {
    expect(FOCUS_RING).toEqual({ outline: `2px solid ${tokens.focus}`, outlineOffset: 2 });
    expect(tokens.focus).toBe(terminalTokens.color.amber);
    const c = terminalTokens.color;
    for (const bg of [
      tokens.background.default,
      tokens.background.paper,
      c.page,
      c.module,
      c.case,
      c.crt,
    ]) {
      expect(contrast(tokens.focus, bg), bg).toBeGreaterThanOrEqual(3);
    }
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
        // jsdom keeps the `outline` shorthand (no longhand expansion); since jsdom 31 (SWR-007) its colour is
        // serialised as rgb(), so the #RRGGBB token is compared in that form.
        const style = getComputedStyle(el);
        expect(style.outline).toBe(`2px solid ${hexToRgb(tokens.focus)}`);
        expect(style.outlineOffset).toBe('2px');
      }
    },
  );
});

describe('createAppTheme — Galactic Vector Terminal (SWR-009 TC-TK-03, AC-3)', () => {
  const theme = createAppTheme({ reduceMotion: false });
  const c = terminalTokens.color;

  it('palette comes from the tokens', () => {
    expect(theme.palette.mode).toBe('dark');
    expect(theme.palette.background.default).toBe(c.page);
    expect(theme.palette.background.paper).toBe(c.module);
    expect(theme.palette.text.primary).toBe(c.paper);
    expect(theme.palette.text.secondary).toBe(c.warm);
    expect(theme.palette.text.disabled).toBe(c.disabledText);
    expect(theme.palette.primary.main).toBe(c.phosphor);
    expect(theme.palette.warning.main).toBe(c.amber);
    expect(theme.palette.error.main).toBe(c.red);
    expect(theme.palette.error.light).toBe(c.redText);
    expect(theme.palette.divider).toBe(c.bezel);
    expect(theme.palette.focus).toBe(c.amber);
    expect(theme.palette.mock.main).toBe(c.amber);
    expect(theme.palette.terminal).toEqual(c);
  });

  it('PT Mono first, type scale h1/h2/body1/metric/meta = 28/19/14/22/11, radius 1', () => {
    expect(theme.typography.fontFamily?.startsWith('"PT Mono"')).toBe(true);
    expect(theme.typography.fontFamily).toContain('ui-monospace, monospace');
    const size = (v: { fontSize?: unknown }) => v.fontSize;
    expect(
      [
        theme.typography.h1,
        theme.typography.h2,
        theme.typography.body1,
        theme.typography.metric,
        theme.typography.meta,
      ].map(size),
    ).toEqual(['28px', '19px', '14px', '22px', '11px']);
    expect(theme.typography.meta.textTransform).toBe('uppercase');
    expect(theme.typography.metric.color).toBe(c.phosphor);
    expect(theme.shape.borderRadius).toBe(1);
  });

  it('overrides every control the UI Kit restyles', () => {
    const components = theme.components ?? {};
    for (const name of [
      'MuiButton',
      'MuiIconButton',
      'MuiTextField',
      'MuiOutlinedInput',
      'MuiSelect',
      'MuiSwitch',
      'MuiTabs',
      'MuiTab',
      'MuiDialog',
      'MuiAlert',
      'MuiChip',
      'MuiTooltip',
      'MuiCheckbox',
    ] as const) {
      expect(components[name], name).toBeDefined();
    }
  });

  it('reduced motion: CSS animations are off for prefers-reduced-motion, and always with the setting', () => {
    const base = theme.components?.MuiCssBaseline?.styleOverrides as Record<string, unknown>;
    expect(JSON.stringify(base['@media (prefers-reduced-motion: reduce)'])).toContain(
      'none !important',
    );
    expect(base['*, *::before, *::after']).toBeUndefined();
    const reduced = createAppTheme({ reduceMotion: true }).components?.MuiCssBaseline
      ?.styleOverrides as Record<string, unknown>;
    expect(JSON.stringify(reduced['*, *::before, *::after'])).toContain('none !important');
  });
});

describe('createAppTheme — key variants, computed (SWR-009 TC-TK-08)', () => {
  const k = terminalTokens.key;
  function renderKeys() {
    render(
      <ThemeProvider theme={createAppTheme({ reduceMotion: true })}>
        <Button variant="outlined">default</Button>
        <Button variant="contained" color="primary">
          primary
        </Button>
        <Button variant="contained" color="warning">
          warning
        </Button>
        <Button variant="contained" color="error">
          danger
        </Button>
        <Button variant="outlined" aria-pressed="true">
          selected
        </Button>
        <Button variant="outlined" disabled>
          disabled
        </Button>
      </ThemeProvider>,
    );
  }
  const style = (name: string) => getComputedStyle(screen.getByRole('button', { name }));

  it.each([
    ['default', k.default.bg, k.default.border, k.default.text],
    ['primary', k.primary.bg, k.primary.border, k.primary.text],
    ['warning', k.warning.bg, k.warning.border, k.warning.text],
    ['danger', k.danger.bg, k.danger.border, k.danger.text],
    ['selected', k.selected.bg, k.selected.border, k.selected.text],
  ] as const)('%s key: background / border / text from the tokens', (name, bg, border, text) => {
    renderKeys();
    const s = style(name);
    expect(s.backgroundColor).toBe(hexToRgb(bg));
    expect(s.borderTopColor).toBe(hexToRgb(border));
    expect(s.color).toBe(hexToRgb(text));
    expect(s.textTransform).toBe('uppercase');
    expect(s.minHeight).toBe(`${k.minHeight}px`);
  });

  it('selected key has a 2px amber border; disabled key is disabled with lowered opacity', () => {
    renderKeys();
    expect(style('selected').borderTopWidth).toBe('2px');
    const disabled = screen.getByRole('button', { name: 'disabled' });
    expect(disabled).toBeDisabled();
    const s = getComputedStyle(disabled);
    expect(s.opacity).toBe(String(k.disabled.opacity));
    expect(s.color).toBe(hexToRgb(k.disabled.text));
  });
});
