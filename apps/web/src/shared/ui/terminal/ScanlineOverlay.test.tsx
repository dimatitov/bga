import { describe, expect, it } from 'vitest';
import { renderKit } from './renderKit';
import { ScanlineOverlay } from './ScanlineOverlay';

describe('ScanlineOverlay (SWR-009 R-4)', () => {
  it('decorative layer: aria-hidden, no pointer events, no animation', () => {
    const { container } = renderKit(
      <div style={{ position: 'relative' }}>
        <ScanlineOverlay />
      </div>,
    );
    const layer = container.querySelector('[data-decorative="scanlines"]')!;
    expect(layer).toHaveAttribute('aria-hidden', 'true');
    const s = getComputedStyle(layer);
    expect(s.pointerEvents).toBe('none');
    expect(s.position).toBe('absolute');
    expect(s.animationName === '' || s.animationName === 'none').toBe(true);
  });
});
