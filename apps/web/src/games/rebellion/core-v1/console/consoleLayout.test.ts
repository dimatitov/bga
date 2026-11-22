import { describe, expect, it } from 'vitest';
import { CONSOLE_FULL, CONSOLE_SPLIT, CONSOLE_WIDE, MOBILE_SHEET, mq } from '@/shared/theme';
import { CONSOLE_LAYOUTS, consoleGridSx, consoleLayout, consoleMediaKey } from './consoleLayout';

/** The five acceptance viewports (AC-13) and the console mode each one gets (plan §4). */
const VIEWPORTS = [
  [1440, 'wide', 530, 18],
  [1280, 'full', 440, 18],
  [1024, 'split', 340, 10],
  [768, 'stack', null, 10],
  [375, 'mobile', null, 7],
] as const;

describe('consoleLayout (SWR-009 C1, plan §4, AC-9 / AC-13)', () => {
  it.each(VIEWPORTS)('%i px → %s (rail %s, padding %i)', (width, mode, rail, padding) => {
    const l = consoleLayout(width);
    expect(l.mode).toBe(mode);
    expect(l.railWidth).toBe(rail);
    expect(l.padding).toBe(padding);
    expect(l.gap).toBe(7);
  });

  it('≥ 900: two columns map | rail, one viewport high (no page scroll); the map row takes the rest', () => {
    for (const width of [1440, 1280, 1024, 900]) {
      const l = consoleLayout(width);
      expect(l.fitsViewport, `${width}`).toBe(true);
      expect(l.columns).toBe(`minmax(0, 1fr) ${l.railWidth}px`);
      expect(l.areas).toEqual(['header header', 'status status', 'board side', 'footer footer']);
      expect(l.rows).toBe('auto auto minmax(0, 1fr) auto');
    }
  });

  it('< 900: one column header · status · map · rail · footer, page scrolls vertically', () => {
    for (const width of [899, 768, 760, 759, 375, 320]) {
      const l = consoleLayout(width);
      expect(l.fitsViewport, `${width}`).toBe(false);
      expect(l.columns).toBe('minmax(0, 1fr)');
      expect(l.areas).toEqual(['header', 'status', 'board', 'side', 'footer']);
    }
  });

  it('boundaries follow the shared console breakpoints', () => {
    expect(consoleLayout(CONSOLE_WIDE).mode).toBe('wide');
    expect(consoleLayout(CONSOLE_WIDE - 1).mode).toBe('full');
    expect(consoleLayout(CONSOLE_FULL).mode).toBe('full');
    expect(consoleLayout(CONSOLE_FULL - 1).mode).toBe('split');
    expect(consoleLayout(CONSOLE_SPLIT).mode).toBe('split');
    expect(consoleLayout(CONSOLE_SPLIT - 1).mode).toBe('stack');
    expect(consoleLayout(MOBILE_SHEET).mode).toBe('stack');
    expect(consoleLayout(MOBILE_SHEET - 1).mode).toBe('mobile');
  });

  it('every layout keeps the DOM order of the areas (header → status → board → side → footer)', () => {
    const order = ['header', 'status', 'board', 'side', 'footer'];
    for (const l of CONSOLE_LAYOUTS) {
      const seen = l.areas
        .flatMap((row) => row.split(' '))
        .filter((a, i, all) => all.indexOf(a) === i);
      expect(seen, l.mode).toEqual(order);
    }
  });

  it('sx: mobile base + one DISJOINT width range per wider mode, keys in ascending order (fix round 2)', () => {
    const sx = consoleGridSx();
    expect(sx.display).toBe('grid');
    expect(sx.gridTemplateColumns).toBe('minmax(0, 1fr)');
    expect(sx.height).toBe('auto');
    expect(sx.overflow).toBe('visible');
    expect(sx[mq.between(MOBILE_SHEET, CONSOLE_SPLIT)]).toMatchObject({
      padding: '10px',
      height: 'auto',
    });
    expect(sx[mq.between(CONSOLE_SPLIT, CONSOLE_FULL)]).toMatchObject({
      gridTemplateColumns: 'minmax(0, 1fr) 340px',
      height: '100dvh',
      overflow: 'hidden',
    });
    expect(sx[mq.between(CONSOLE_FULL, CONSOLE_WIDE)]).toMatchObject({
      gridTemplateColumns: 'minmax(0, 1fr) 440px',
    });
    expect(sx[mq.up(CONSOLE_WIDE)]).toMatchObject({
      gridTemplateColumns: 'minmax(0, 1fr) 530px',
      padding: '18px',
    });
    const media = Object.keys(sx).filter((k) => k.startsWith('@media'));
    expect(media).toEqual(
      [...CONSOLE_LAYOUTS]
        .reverse()
        .slice(1)
        .map((l) => consoleMediaKey(l)),
    );
    const mins = media.map((k) => Number(/min-width:(\d+)px/.exec(k)![1]));
    expect(mins).toEqual([MOBILE_SHEET, CONSOLE_SPLIT, CONSOLE_FULL, CONSOLE_WIDE]);
    expect([...mins].sort((a, b) => a - b)).toEqual(mins);
  });

  it.each([1440, 1399, 1280, 1200, 1024, 900, 899, 768, 760, 759, 375])(
    '%i px: exactly one media range matches (or none = mobile base), whatever order MUI emits them in',
    (width) => {
      const media = Object.keys(consoleGridSx()).filter((k) => k.startsWith('@media'));
      const matches = media.filter((k) => {
        const min = Number(/min-width:([\d.]+)px/.exec(k)?.[1] ?? 0);
        const max = Number(/max-width:([\d.]+)px/.exec(k)?.[1] ?? Infinity);
        return width >= min && width <= max;
      });
      expect(matches).toHaveLength(width < MOBILE_SHEET ? 0 : 1);
      if (matches.length) {
        const l = CONSOLE_LAYOUTS.find((x) => consoleMediaKey(x) === matches[0])!;
        expect(l.mode).toBe(consoleLayout(width).mode);
      }
    },
  );
});
