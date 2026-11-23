/**
 * SWR-010 FE-B static guarantees (plan-frontend §5.4, FR-4): the Physical Execution sources have no hex colours (theme
 * tokens only) and never read `rebelBase` — task texts come from `task.steps[].params` / `task.affected` only.
 */
import { describe, expect, it } from 'vitest';

const SOURCES = import.meta.glob<string>(['./**/*.{ts,tsx}', '!./**/*.test.{ts,tsx}'], {
  query: '?raw',
  import: 'default',
  eager: true,
});

describe('core-v1/table static checks', () => {
  it('sources are found', () => {
    expect(Object.keys(SOURCES).length).toBeGreaterThanOrEqual(9);
  });

  it.each(Object.entries(SOURCES))('%s: no hex colours, no <img>, no rebelBase', (_, src) => {
    expect(src).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    expect(src).not.toMatch(/<img\b/);
    expect(src).not.toMatch(/rebelBase/);
  });
});
