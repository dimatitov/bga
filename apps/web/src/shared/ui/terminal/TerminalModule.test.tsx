import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { terminalTokens } from '@/shared/theme';
import { renderKit, rgb } from './renderKit';
import { TerminalModule } from './TerminalModule';

describe('TerminalModule (SWR-009 TC-TK-06)', () => {
  it('a region named by its uppercase meta header; heading level; bezel border; testid passed through', () => {
    renderKit(
      <TerminalModule
        label="Your task"
        data-testid="mod"
        actions={<button type="button">Close</button>}
      >
        Body text
      </TerminalModule>,
    );
    const region = screen.getByRole('region', { name: 'Your task' });
    expect(region).toBe(screen.getByTestId('mod'));
    expect(region.tagName).toBe('SECTION');
    const heading = screen.getByRole('heading', { level: 2, name: 'Your task' });
    expect(getComputedStyle(heading).textTransform).toBe('uppercase');
    expect(getComputedStyle(heading).fontSize).toBe('11px');
    expect(region).toHaveTextContent('Body text');
    expect(screen.getByRole('button', { name: 'Close' })).toBeInTheDocument();
    const s = getComputedStyle(region);
    expect(s.borderTopWidth).toBe(`${terminalTokens.bezel.module}px`);
    expect(s.borderTopStyle).toBe('solid');
    expect(s.borderTopColor).toBe(rgb(terminalTokens.color.bezel));
  });

  it('h3 level, explicit label id, restricted tone → dashed bezel', () => {
    renderKit(
      <TerminalModule label="Restricted" labelId="lbl" headingLevel="h3" tone="restricted">
        x
      </TerminalModule>,
    );
    const heading = screen.getByRole('heading', { level: 3, name: 'Restricted' });
    expect(heading).toHaveAttribute('id', 'lbl');
    const region = screen.getByRole('region', { name: 'Restricted' });
    expect(region).toHaveAttribute('data-tone', 'restricted');
    expect(getComputedStyle(region).borderTopStyle).toBe('dashed');
  });
});
