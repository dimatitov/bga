import { describe, expect, it } from 'vitest';
import { buildRulesContext, type RulesContextOptions } from '../../src/rules-kb';
import { fixtureKb } from './fixture';

const kb = fixtureKb();
const BASE: RulesContextOptions = {
  phase: 'action',
  commandTypes: ['BUILD_FORGE'],
  side: 'builders',
  maxChars: 10_000,
};

describe('buildRulesContext (AC-9, TC-F-03)', () => {
  it('selects core, then command matches, then phase matches; id asc inside a group', () => {
    const ctx = buildRulesContext(kb, BASE);
    expect(ctx.ruleIds).toEqual([
      'star-forge:turn.order',
      'star-forge:victory.score',
      'star-forge:build.place-forge',
      'star-forge:build.place-forge-errata',
      'star-forge:turn.pass-timing',
    ]);
    expect(ctx.truncated).toBe(false);
  });

  it('formats one line per entry with citations and marks needs-review (TC-A-06)', () => {
    const lines = buildRulesContext(kb, BASE).text.split('\n');
    expect(lines[0]).toBe(
      '[star-forge:turn.order] Turn order: Players take turns clockwise; the player with the fewest ' +
        'stations goes first each round. (SFR p.3)',
    );
    expect(lines[4]).toBe(
      '[star-forge:turn.pass-timing] Passing mid-turn: A player who has started building cannot pass ' +
        'until the build is finished. (SFR p.3) (unverified)',
    );
    expect(lines).toHaveLength(5);
  });

  it('never includes ai: none; include comes first (TC-A-07)', () => {
    const ctx = buildRulesContext(kb, {
      ...BASE,
      include: ['star-forge:setup.board', 'star-forge:combat.engine-gap', 'star-forge:no.such'],
    });
    expect(ctx.ruleIds[0]).toBe('star-forge:setup.board');
    expect(ctx.ruleIds).not.toContain('star-forge:combat.engine-gap');
    expect(buildRulesContext(kb, { maxChars: 10_000 }).ruleIds).toEqual([
      'star-forge:turn.order',
      'star-forge:victory.score',
    ]);
  });

  it('drops entries for another side unless included explicitly', () => {
    const attack = { commandTypes: ['ATTACK'], maxChars: 10_000 };
    const combat = 'star-forge:combat.resolve';
    expect(buildRulesContext(kb, { ...attack, side: 'builders' }).ruleIds).not.toContain(combat);
    expect(buildRulesContext(kb, { ...attack, side: 'raiders' }).ruleIds).toContain(combat);
    expect(buildRulesContext(kb, attack).ruleIds).toContain(combat);
    expect(
      buildRulesContext(kb, { ...attack, side: 'builders', include: [combat] }).ruleIds,
    ).toContain(combat);
  });

  it('is deterministic, independent of commandTypes order (TC-A-03)', () => {
    const a = buildRulesContext(kb, { ...BASE, commandTypes: ['BUILD_FORGE', 'ATTACK'] });
    const b = buildRulesContext(kb, { ...BASE, commandTypes: ['ATTACK', 'BUILD_FORGE'] });
    expect(a).toEqual(b);
    expect(buildRulesContext(kb, BASE)).toEqual(buildRulesContext(kb, BASE));
  });

  it('never exceeds maxChars and drops only whole lines (TC-A-04, TC-A-05)', () => {
    const full = buildRulesContext(kb, BASE);
    const lineOf = new Map(full.ruleIds.map((id, k) => [id, full.text.split('\n')[k]!]));
    for (const maxChars of [1, 50, 200, 300, full.text.length - 1]) {
      const ctx = buildRulesContext(kb, { ...BASE, maxChars });
      expect(ctx.text.length).toBeLessThanOrEqual(maxChars);
      expect(ctx.truncated).toBe(true);
      expect(ctx.text).toBe(ctx.ruleIds.map((id) => lineOf.get(id)).join('\n'));
      expect(full.ruleIds.slice(0, ctx.ruleIds.length)).toEqual(ctx.ruleIds);
    }
    expect(buildRulesContext(kb, { ...BASE, maxChars: full.text.length })).toEqual(full);
    expect(buildRulesContext(kb, { ...BASE, maxChars: 1 })).toEqual({
      text: '',
      ruleIds: [],
      truncated: true,
    });
  });

  it('keeps core entries when truncating', () => {
    const full = buildRulesContext(kb, BASE);
    const twoLines = full.text.split('\n').slice(0, 2).join('\n').length;
    expect(buildRulesContext(kb, { ...BASE, maxChars: twoLines }).ruleIds).toEqual([
      'star-forge:turn.order',
      'star-forge:victory.score',
    ]);
  });

  it.each([0, -1, 1.5, Number.NaN])('maxChars %s → RangeError', (maxChars) => {
    expect(() => buildRulesContext(kb, { maxChars })).toThrow(RangeError);
  });
});
