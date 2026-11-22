import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { renderKit } from './renderKit';
import { UnitGlyph } from './UnitGlyph';

describe('UnitGlyph (SWR-009 TC-TK-10)', () => {
  it.each(['triangle', 'square', 'diamond', 'circle'] as const)(
    '%s: aria-hidden svg with data-shape; filled vs outlined',
    (shape) => {
      renderKit(
        <div>
          <span data-testid="filled">
            <UnitGlyph shape={shape} filled color="#DD6B59" />
          </span>
          <span data-testid="outlined">
            <UnitGlyph shape={shape} filled={false} color="#91DFA1" dashed />
          </span>
        </div>,
      );
      const filled = screen.getByTestId('filled').querySelector('svg')!;
      const outlined = screen.getByTestId('outlined').querySelector('svg')!;
      for (const svg of [filled, outlined]) {
        expect(svg).toHaveAttribute('aria-hidden', 'true');
        expect(svg).toHaveAttribute('data-shape', shape);
      }
      expect(filled).toHaveAttribute('data-filled', 'true');
      expect(outlined).toHaveAttribute('data-filled', 'false');
      expect(outlined).toHaveAttribute('data-dashed', 'true');
      expect(filled.firstElementChild).toHaveAttribute('fill', '#DD6B59');
      expect(outlined.firstElementChild).toHaveAttribute('fill', 'none');
      expect(outlined.firstElementChild).toHaveAttribute('stroke', '#91DFA1');
    },
  );

  it('a separate stroke colour outlines the glyph (leader contour)', () => {
    const { container } = renderKit(
      <UnitGlyph shape="diamond" filled color="#DD6B59" stroke="#E3AD5C" size={20} />,
    );
    const svg = container.querySelector('svg')!;
    expect(svg).toHaveAttribute('width', '20');
    expect(svg.firstElementChild).toHaveAttribute('stroke', '#E3AD5C');
  });
});
