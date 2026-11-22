import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { terminalTokens } from '@/shared/theme';
import { renderKit, rgb } from './renderKit';
import { StatusBadge } from './StatusBadge';

describe('StatusBadge (SWR-009 TC-TK-09)', () => {
  it.each(['green', 'amber', 'red', 'neutral'] as const)(
    '%s: border and text from the tokens',
    (tone) => {
      renderKit(
        <StatusBadge tone={tone} data-testid="badge">
          Saved
        </StatusBadge>,
      );
      const badge = screen.getByTestId('badge');
      expect(badge).toHaveTextContent('Saved');
      expect(badge).toHaveAttribute('data-tone', tone);
      const s = getComputedStyle(badge);
      expect(s.color).toBe(rgb(terminalTokens.badge[tone].text));
      expect(s.borderTopColor).toBe(rgb(terminalTokens.badge[tone].border));
    },
  );

  it('an empty badge renders nothing', () => {
    const { container } = renderKit(<StatusBadge tone="red">{''}</StatusBadge>);
    expect(container).toBeEmptyDOMElement();
  });
});
