/**
 * SWR-010 FE-A static guarantees (TC-HAND-06, plan-frontend §5.4): the Card Hand / Card Detail sources have no hex
 * colours (theme tokens only), no card images, use the SWR-009 UI Kit, and never read `rebelBase` (the UI shows only
 * what `view.cards` carries).
 */
import { describe, expect, it } from 'vitest';

const SOURCES = import.meta.glob<string>(['./**/*.{ts,tsx}', '!./**/*.test.{ts,tsx}'], {
  query: '?raw',
  import: 'default',
  eager: true,
});

describe('core-v1/cards static checks', () => {
  it('sources are found', () => {
    expect(Object.keys(SOURCES).length).toBeGreaterThanOrEqual(8);
  });

  it.each(Object.entries(SOURCES))('%s: no hex colours, no <img>, no rebelBase', (_, src) => {
    expect(src).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    expect(src).not.toMatch(/<img\b/);
    expect(src).not.toMatch(/rebelBase/);
  });

  it('the components use the UI Kit (TerminalModule, StatusBadge, KeyButton, Readout)', () => {
    const all = Object.values(SOURCES).join('\n');
    for (const name of ['TerminalModule', 'StatusBadge', 'KeyButton', 'Readout', 'StatusCard'])
      expect(all, name).toContain(name);
  });
});
