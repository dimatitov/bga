import { describe, expect, it } from 'vitest';
import { contrastRatio, failingPairs, luminance } from './contrast';
import { CONSOLE_FULL, CONSOLE_SPLIT, CONSOLE_WIDE, MOBILE_SHEET, mq } from './breakpoints';
import { FOCUS_RING_SURFACES, NON_TEXT_COLORS, terminalTokens, textPairs } from './tokens';

const c = terminalTokens.color;
const HEX = /^#[0-9A-F]{6}$/;

describe('terminalTokens — palette, type, radius (SWR-009 TC-TK-01, AC-3)', () => {
  it('12 palette roles with the UI Kit values (design-analysis §1)', () => {
    expect({
      crt: c.crt,
      display: c.display,
      route: c.route,
      region: c.region,
      signal: c.signal,
      phosphor: c.phosphor,
      amber: c.amber,
      red: c.red,
      case: c.case,
      bezel: c.bezel,
      warm: c.warm,
      paper: c.paper,
    }).toEqual({
      crt: '#050906',
      display: '#080F09',
      route: '#456B4D',
      region: '#66846A',
      signal: '#5E8D68',
      phosphor: '#91DFA1',
      amber: '#E3AD5C',
      red: '#DD6B59',
      case: '#252923',
      bezel: '#41493E',
      warm: '#B9C2B4',
      paper: '#D8DDD2',
    });
    expect(c.muted).toBe('#9AA696');
    expect(c.map).toBe('#030704');
    expect(c.page).toBe('#111510');
    expect(c.grid).toBe('#2D5535');
    for (const [role, value] of Object.entries(c)) expect(value, role).toMatch(HEX);
  });

  it('font is PT Mono with the ui-monospace, monospace fallback', () => {
    expect(terminalTokens.font.family).toBe('"PT Mono", ui-monospace, monospace');
    expect(terminalTokens.font.family.startsWith('"PT Mono"')).toBe(true);
  });

  it('type scale 28/19/14/22/11 with line heights 36/26/22/28/16', () => {
    const { display, title, body, metric, meta } = terminalTokens.type;
    expect([display, title, body, metric, meta].map((s) => s.size)).toEqual([28, 19, 14, 22, 11]);
    expect([display, title, body, metric, meta].map((s) => s.lineHeight)).toEqual([
      36, 26, 22, 28, 16,
    ]);
    expect([display.weight, title.weight, metric.weight]).toEqual([700, 700, 700]);
    expect([body.weight, meta.weight]).toEqual([400, 400]);
  });

  it('radius 1, bezels 2/4, focus amber 2px offset 2, console spacing', () => {
    expect(terminalTokens.radius).toBe(1);
    expect(terminalTokens.bezel).toEqual({ module: 2, housing: 4 });
    expect(terminalTokens.focus).toEqual({ color: c.amber, width: 2, offset: 2 });
    expect(terminalTokens.space).toEqual({ console: 18, gap: 7, module: 12 });
  });

  it('key variants carry the UI Kit values (design-analysis §2)', () => {
    const k = terminalTokens.key;
    expect(k.default).toMatchObject({ bg: '#30362D', border: '#6B7465' });
    expect(k.hover).toEqual({ bg: '#3A4236', border: '#A0AF99' });
    expect(k.pressed.bg).toBe('#151A14');
    expect(k.primary).toMatchObject({ bg: '#24452D', border: '#77BB84', text: '#C4F2CC' });
    expect(k.selected).toEqual({ bg: '#3B301E', border: c.amber, text: '#FFDA99' });
    expect(k.warning).toMatchObject({ bg: '#44351F', border: '#B18341', text: '#FFDA9B' });
    expect(k.danger).toMatchObject({ bg: '#492A26', border: '#A45245', text: '#FFB5A9' });
    expect(k.disabled).toMatchObject({ text: '#879185', opacity: 0.62 });
  });

  it('console breakpoints 1400 / 1200 / 900 / 760 and media helpers', () => {
    expect([CONSOLE_WIDE, CONSOLE_FULL, CONSOLE_SPLIT, MOBILE_SHEET]).toEqual([
      1400, 1200, 900, 760,
    ]);
    expect(mq.up(900)).toBe('@media (min-width:900px)');
    expect(mq.down(760)).toBe('@media (max-width:759.95px)');
  });
});

describe('terminalTokens — contrast (SWR-009 TC-TK-04/05, QD-8)', () => {
  it('the contrast helper matches known WCAG values', () => {
    expect(contrastRatio('#FFFFFF', '#000000')).toBeCloseTo(21, 5);
    expect(contrastRatio('#777777', '#777777')).toBeCloseTo(1, 5);
    expect(luminance('#FFFFFF')).toBeCloseTo(1, 5);
    // Pre-computed by QA (test-cases TC-TK-04): red on case 4.45, signal on case 3.86.
    expect(contrastRatio(c.red, c.case)).toBeCloseTo(4.45, 2);
    expect(contrastRatio(c.signal, c.case)).toBeCloseTo(3.86, 2);
    expect(() => luminance('red')).toThrow(RangeError);
  });

  it('every text pair used by the theme and the UI Kit is ≥ 4.5:1', () => {
    expect(textPairs.length).toBeGreaterThan(100);
    const failing = failingPairs(textPairs).map((p) => `${p.name}: ${p.ratio.toFixed(2)}`);
    expect(failing).toEqual([]);
  });

  it('red / signal / region / route / grid are never a text foreground', () => {
    expect(NON_TEXT_COLORS).toEqual([c.red, c.signal, c.region, c.route, c.grid]);
    const fgs = new Set(textPairs.map((p) => p.fg.toUpperCase()));
    for (const banned of NON_TEXT_COLORS) expect(fgs.has(banned), banned).toBe(false);
  });

  it('a «false» dark text token makes the check fail (the test is not trivial)', () => {
    const broken = [...textPairs, { name: 'fake dark text on module', fg: c.case, bg: c.module }];
    expect(failingPairs(broken).map((p) => p.name)).toEqual(['fake dark text on module']);
    // And the borderline pairs QA flagged would fail if they were ever used as text.
    expect(failingPairs([{ name: 'red on case', fg: c.red, bg: c.case }])).toHaveLength(1);
    expect(failingPairs([{ name: 'signal on module', fg: c.signal, bg: c.module }])).toHaveLength(
      1,
    );
  });

  it('the focus ring (amber) is ≥ 3:1 against page / module / case / crt and the other ring surfaces', () => {
    for (const surface of [c.page, c.module, c.case, c.crt]) {
      expect(FOCUS_RING_SURFACES).toContain(surface);
    }
    for (const surface of FOCUS_RING_SURFACES) {
      expect(contrastRatio(terminalTokens.focus.color, surface), surface).toBeGreaterThanOrEqual(3);
    }
  });

  it('non-text roles stay ≥ 3:1 on the map / display (WCAG 1.4.11): red, signal, phosphor, amber', () => {
    for (const fg of [c.red, c.signal, c.phosphor, c.amber]) {
      for (const bg of [c.map, c.crt, c.display]) {
        expect(contrastRatio(fg, bg), `${fg} on ${bg}`).toBeGreaterThanOrEqual(3);
      }
    }
  });
});
