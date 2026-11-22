import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { LegendKey } from './LegendKey';
import { renderKit } from './renderKit';
import { UnitGlyph } from './UnitGlyph';

describe('LegendKey (SWR-009 TC-TK-12)', () => {
  it('caption in text, glyph hidden from assistive technology', () => {
    renderKit(
      <ul>
        <li>
          <LegendKey glyph={<UnitGlyph shape="triangle" filled color="#DD6B59" />} data-testid="k">
            Empire fleet
          </LegendKey>
        </li>
      </ul>,
    );
    const key = screen.getByTestId('k');
    expect(key).toHaveTextContent('Empire fleet');
    const glyphBox = key.firstElementChild!;
    expect(glyphBox).toHaveAttribute('aria-hidden', 'true');
    expect(glyphBox.querySelector('svg')).not.toBeNull();
    expect(screen.getByRole('listitem')).toHaveAccessibleName('');
    expect(screen.getByText('Empire fleet')).toBeVisible();
  });
});
