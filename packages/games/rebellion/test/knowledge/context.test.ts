/**
 * SWR-005C W2 → SWR-008 W3 — the rules context of the AI Commander in the core-v1 Command Phase, now built by the
 * Rebellion rules provider (`rebellionRules`, plan-backend C-6, §3) from the PUBLIC decision sets (QD-7):
 * idle (`ACTIVATE_SYSTEM`, `PASS`) / own activation (`FINISH_ACTIVATION`, `MOVE_PIECES`) × side × public tags.
 * needs-review entries never enter (A-1, QD-4), the engine scope is always the first line (F-7).
 */
import { describe, expect, it } from 'vitest';
import type { RulesContextResult } from '@bga/platform';
import { buildRulesContext } from '@bga/platform/rules-kb';
import { REBELLION_ENGINE_SCOPE_RULE_ID, rebellionRules } from '../../src/server';
import { loadKnowledgeBase, loadRawKnowledgeBase } from './load-kb';

const kb = loadKnowledgeBase();
const provider = rebellionRules.createRulesContextProvider(loadRawKnowledgeBase());
const MAX_CHARS = 6000;
const NEEDS_REVIEW = kb.entries.filter((e) => e.status === 'needs-review').map((e) => e.id);

/** Entries every Command Phase decision needs (activation, movement, transport, pass, base reveal, both victories). */
const REQUIRED = [
  'rebellion:command.turn-order',
  'rebellion:command.activate.place-leader',
  'rebellion:command.move.into-activated-from-adjacent',
  'rebellion:command.move.own-leader-locks',
  'rebellion:command.transport.capacity',
  'rebellion:command.pass',
  'rebellion:base.reveal-condition',
  'rebellion:victory.empire',
  'rebellion:victory.rebels',
];

const STATES = [
  ['idle', ['ACTIVATE_SYSTEM', 'PASS']],
  ['own activation', ['FINISH_ACTIVATION', 'MOVE_PIECES']],
] as const;
const TAG_SETS = [
  ['base-hidden'],
  ['base-hidden', 'opponent-passed'],
  ['base-revealed'],
  ['base-revealed', 'opponent-passed'],
] as const;

function select(side: string, commandTypes: readonly string[], tags: readonly string[]) {
  return provider.selectRules({
    actor: side,
    phase: 'command',
    commandTypes: [...commandTypes],
    tags: [...tags],
    maxChars: MAX_CHARS,
  });
}

const CASES = (['rebels', 'empire'] as const).flatMap((side) =>
  STATES.flatMap(([state, types]) =>
    TAG_SETS.map((tags) => [`${side}, ${state}, ${tags.join('+')}`, side, types, tags] as const),
  ),
);

describe.each(CASES)('Command Phase context: %s', (_label, side, types, tags) => {
  const context: RulesContextResult = select(side, types, tags);

  it(`fits in ${MAX_CHARS} characters without truncation and contains the required rules`, () => {
    expect(context.text.length).toBeLessThanOrEqual(MAX_CHARS);
    expect(context.truncated).toBe(false);
    for (const id of REQUIRED) expect(context.ruleIds, id).toContain(id);
  });

  it('starts with the engine scope; no needs-review entry, no "(unverified)", no missions or combat', () => {
    expect(context.ruleIds[0]).toBe(REBELLION_ENGINE_SCOPE_RULE_ID);
    expect(context.text).not.toContain('(unverified)');
    for (const id of NEEDS_REVIEW) expect(context.ruleIds, id).not.toContain(id);
    expect(context.ruleIds).not.toContain('rebellion:command.pass-not-mid-activation');
    const categories = new Map(kb.entries.map((e) => [e.id, e.category]));
    for (const id of context.ruleIds) {
      expect(['missions', 'combat'], id).not.toContain(categories.get(id));
    }
  });

  it('formats one line per entry with id and page citations; only short text', () => {
    const lines = context.text.split('\n');
    expect(lines.length).toBe(context.ruleIds.length);
    lines.forEach((line, i) => {
      expect(line.startsWith(`[${context.ruleIds[i]}] `)).toBe(true);
      expect(line).toMatch(/\((RR|LTP|FAQ) p\.\d+(; (RR|LTP|FAQ) p\.\d+)*\)$/);
      expect(line.length).toBeLessThan(900);
    });
  });

  it('is deterministic and carries the rules version', () => {
    expect(select(side, types, tags)).toEqual(context);
    expect(context.rulesVersion).toBe(provider.rulesVersion);
  });
});

describe('side filtering', () => {
  it('keeps side-specific entries out of the other side context', () => {
    const move = ['FINISH_ACTIVATION', 'MOVE_PIECES'];
    const empire = select('empire', move, ['base-hidden']);
    expect(empire.ruleIds).toContain('rebellion:base.ships-do-not-reveal');
    const rebels = select('rebels', move, ['base-hidden']);
    expect(rebels.ruleIds).not.toContain('rebellion:base.ships-do-not-reveal');
  });
});

describe('tags (public decision tags, plan-backend §3.4)', () => {
  it('base-hidden / base-revealed / opponent-passed add their rules', () => {
    const idle = ['ACTIVATE_SYSTEM', 'PASS'];
    expect(select('empire', idle, ['base-hidden']).ruleIds).toContain(
      'rebellion:base.death-star-does-not-reveal',
    );
    expect(select('empire', idle, ['base-revealed']).ruleIds).toContain(
      'rebellion:base.reveal-procedure',
    );
    expect(select('rebels', idle, ['base-hidden', 'opponent-passed']).ruleIds).toContain(
      'rebellion:command.pass-is-not-action',
    );
    expect(select('rebels', idle, ['base-hidden']).ruleIds).not.toContain(
      'rebellion:command.pass-is-not-action',
    );
  });
});

describe('buildRulesContext defaults are unchanged (C-5 backward compatibility, real KB)', () => {
  it('without excludeStatuses needs-review entries are still only marked "(unverified)"', () => {
    const full = buildRulesContext(kb, {
      phase: 'command',
      commandTypes: ['ACTIVATE_SYSTEM', 'MOVE_PIECES', 'FINISH_ACTIVATION', 'PASS'],
      side: 'empire',
      maxChars: 100_000,
    });
    const line = full.text
      .split('\n')
      .find((l) => l.startsWith('[rebellion:command.pass-not-mid-activation] '));
    expect(line?.endsWith('(unverified)')).toBe(true);
  });
});
