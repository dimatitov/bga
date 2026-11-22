import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { terminalTokens } from '@/shared/theme';
import { CounterMarker } from './CounterMarker';
import { renderKit, rgb } from './renderKit';

const RED = terminalTokens.color.red;

describe('CounterMarker (SWR-009 TC-TK-10/11)', () => {
  it('glyph + count; named button; border in the glyph colour; click and aria-pressed', async () => {
    const onClick = vi.fn();
    renderKit(
      <CounterMarker
        glyph={{ shape: 'triangle', filled: true, color: RED }}
        count={3}
        pressed={false}
        onClick={onClick}
        aria-label="Empire fleet: 3"
        data-testid="m"
      />,
    );
    const marker = screen.getByRole('button', { name: 'Empire fleet: 3' });
    expect(marker).toBe(screen.getByTestId('m'));
    expect(marker).toHaveTextContent('3');
    expect(marker).toHaveAttribute('data-count', '3');
    expect(marker).toHaveAttribute('aria-pressed', 'false');
    expect(marker.querySelector('svg')).toHaveAttribute('data-shape', 'triangle');
    expect(getComputedStyle(marker).borderTopColor).toBe(rgb(RED));
    await userEvent.click(marker);
    expect(onClick).toHaveBeenCalledOnce();
  });

  it('pressed → aria-pressed="true" with the amber selected border', () => {
    renderKit(
      <CounterMarker
        glyph={{ shape: 'square', filled: false, color: terminalTokens.color.phosphor }}
        count={1}
        pressed
        aria-label="Rebel ground: 1"
      />,
    );
    const marker = screen.getByRole('button', { name: 'Rebel ground: 1' });
    expect(marker).toHaveAttribute('aria-pressed', 'true');
    expect(getComputedStyle(marker).borderTopColor).toBe(rgb(terminalTokens.color.amber));
  });

  it('count 0 renders nothing (an empty group is not shown)', () => {
    const { container } = renderKit(
      <CounterMarker
        glyph={{ shape: 'square', filled: true, color: RED }}
        count={0}
        aria-label="x"
      />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it.each([-1, 1.5, Number.NaN])(
    'count %s is a programming error (throws, never shown)',
    (count) => {
      const err = vi.spyOn(console, 'error').mockImplementation(() => {});
      expect(() =>
        renderKit(
          <CounterMarker
            glyph={{ shape: 'square', filled: true, color: RED }}
            count={count}
            aria-label="x"
          />,
        ),
      ).toThrow(RangeError);
      err.mockRestore();
    },
  );
});
