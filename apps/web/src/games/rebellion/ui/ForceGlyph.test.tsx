import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { terminalTokens } from '@/shared/theme';
import { rebellionPalette } from '../theme/palette';
import { ForceGlyph } from './ForceGlyph';

describe('ForceGlyph (SWR-009 R-3)', () => {
  it.each([
    ['empire', 'space', 'triangle', 'true'],
    ['rebels', 'space', 'triangle', 'false'],
    ['empire', 'ground', 'square', 'true'],
    ['rebels', 'ground', 'square', 'false'],
    ['rebels', 'leader', 'diamond', 'false'],
  ] as const)('%s %s → %s, filled=%s, aria-hidden', (owner, kind, shape, filled) => {
    const { container } = render(<ForceGlyph owner={owner} kind={kind} size={16} />);
    const wrap = container.firstElementChild!;
    expect(wrap).toHaveAttribute('data-owner', owner);
    expect(wrap).toHaveAttribute('data-kind', kind);
    const svg = wrap.querySelector('svg')!;
    expect(svg).toHaveAttribute('aria-hidden', 'true');
    expect(svg).toHaveAttribute('data-shape', shape);
    expect(svg).toHaveAttribute('data-filled', filled);
    expect(svg).toHaveAttribute('width', '16');
    const stroke = kind === 'leader' ? terminalTokens.color.amber : rebellionPalette.faction[owner];
    expect(svg.firstElementChild).toHaveAttribute('stroke', stroke);
  });
});
