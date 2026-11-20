import { screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '@/shared/test';
import { AutomationNotice } from './AutomationNotice';
import { automationNoticeSx } from './noticeLayout';
import type { SessionAutomationState } from './SessionAutomationContext';

function state(patch: Partial<SessionAutomationState> = {}): SessionAutomationState {
  return {
    strategy: 'bot',
    pending: true,
    phase: 'stalled',
    error: null,
    lastRun: null,
    retry: vi.fn(),
    ...patch,
  };
}

/** All CSS text emotion injected into the document. */
function injectedCss(): string {
  return Array.from(document.querySelectorAll('style'))
    .map((s) => s.textContent ?? '')
    .join('\n');
}

describe('AutomationNotice placement (SWR-006 QA defect D-1)', () => {
  it('layout: in flow full-width on xs–sm; fixed bottom-left with a bounded width on md+; never the 50%/translate centring', () => {
    const sx = automationNoticeSx(false) as Record<string, unknown>;
    expect(sx.position).toEqual({ xs: 'static', md: 'fixed' });
    expect(sx.m).toEqual({ xs: 2, md: 0 });
    expect(sx.maxWidth).toEqual({ xs: 'none', md: 'min(560px, calc(50% - 32px))' });
    expect(sx.left).toEqual({ md: 16 });
    expect(sx.bottom).toEqual({ md: 16 });
    // The shrink-to-half-viewport bug came from `left: 50%` + `translateX(-50%)` on a fixed box.
    expect(sx).not.toHaveProperty('transform');
    expect(sx).not.toHaveProperty('right');
    expect((automationNoticeSx(true) as Record<string, unknown>).bottom).toEqual({ md: 72 });
  });

  it('renders with that layout: static below md, fixed bottom-left from md, no translateX', () => {
    renderWithProviders({ element: <AutomationNotice automation={state()} /> });
    const notice = screen.getByTestId('session-automation-notice');
    expect(notice).toHaveAttribute('data-reason', 'stalled');
    expect(screen.getByTestId('session-automation-retry')).toBeInTheDocument();
    const css = injectedCss();
    const cls = Array.from(notice.classList).find((c) => c.startsWith('css-'));
    expect(cls).toBeDefined();
    const rules = css.slice(css.indexOf(`.${cls ?? ''}`));
    expect(rules).toMatch(/@media \(min-width:\s*0px\)\s*\{[^}]*position:\s*static/);
    expect(rules).toMatch(/@media \(min-width:\s*900px\)\s*\{[^}]*position:\s*fixed/);
    expect(rules).toMatch(/@media \(min-width:\s*900px\)\s*\{[^}]*left:\s*16px/);
    expect(notice.ownerDocument.defaultView?.getComputedStyle(notice).transform ?? '').not.toMatch(
      /translate/,
    );
    expect(css).not.toMatch(/translateX\(-50%\)/);
  });

  it('nothing is rendered while the automation is idle', () => {
    renderWithProviders({ element: <AutomationNotice automation={state({ phase: 'idle' })} /> });
    expect(screen.queryByTestId('session-automation-notice')).not.toBeInTheDocument();
  });
});
