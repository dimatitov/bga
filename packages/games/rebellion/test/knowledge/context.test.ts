/**
 * SWR-005C W2 — compact rules context for the AI Commander in the core-v1 Command Phase (AC-9; TC-A-01..06).
 */
import { describe, expect, it } from 'vitest';
import { buildRulesContext } from '@bga/platform/rules-kb';
import { loadKnowledgeBase } from './load-kb';

const kb = loadKnowledgeBase();
const COMMAND_TYPES = ['ACTIVATE_SYSTEM', 'MOVE_PIECES', 'FINISH_ACTIVATION', 'PASS'];
const MAX_CHARS = 6000;

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

describe.each(['rebels', 'empire'])('Command Phase context for the %s', (side) => {
  const options = { phase: 'command', commandTypes: COMMAND_TYPES, side, maxChars: MAX_CHARS };
  const context = buildRulesContext(kb, options);

  it(`fits in ${MAX_CHARS} characters and contains the required rules`, () => {
    expect(context.text.length).toBeLessThanOrEqual(MAX_CHARS);
    for (const id of REQUIRED) expect(context.ruleIds, id).toContain(id);
  });

  it('includes the PASS interpretation and the reveal/victory rules without truncation; no missions', () => {
    expect(context.truncated).toBe(false);
    for (const id of [
      'rebellion:command.pass-not-mid-activation',
      'rebellion:base.reveal-condition',
      'rebellion:base.reveal-timing',
      'rebellion:victory.empire',
      'rebellion:victory.rebels',
    ]) {
      expect(context.ruleIds, id).toContain(id);
    }
    const categories = new Map(kb.entries.map((e) => [e.id, e.category]));
    for (const id of context.ruleIds) expect(categories.get(id), id).not.toBe('missions');
  });

  it('formats one line per entry with id and page citations; only short text', () => {
    const lines = context.text.split('\n');
    expect(lines.length).toBe(context.ruleIds.length);
    lines.forEach((line, i) => {
      expect(line.startsWith(`[${context.ruleIds[i]}] `)).toBe(true);
      expect(line).toMatch(/\((RR|LTP|FAQ) p\.\d+(; (RR|LTP|FAQ) p\.\d+)*\)( \(unverified\))?$/);
      expect(line.length).toBeLessThan(900);
    });
  });

  it('is deterministic and independent of the command order', () => {
    expect(buildRulesContext(kb, options)).toEqual(context);
    expect(
      buildRulesContext(kb, { ...options, commandTypes: [...COMMAND_TYPES].reverse() }),
    ).toEqual(context);
  });

  it('never exceeds maxChars and drops only whole lines', () => {
    const full = buildRulesContext(kb, { ...options, maxChars: 100_000 });
    expect(full.truncated).toBe(false);
    for (const maxChars of [1, 50, 200, 1000, full.text.length - 1]) {
      const cut = buildRulesContext(kb, { ...options, maxChars });
      expect(cut.text.length).toBeLessThanOrEqual(maxChars);
      expect(cut.truncated).toBe(true);
      expect(full.text.startsWith(cut.text)).toBe(true);
      expect(cut.ruleIds).toEqual(full.ruleIds.slice(0, cut.ruleIds.length));
    }
  });

  it('marks needs-review entries as unverified', () => {
    const full = buildRulesContext(kb, { ...options, maxChars: 100_000 });
    const line = full.text
      .split('\n')
      .find((l) => l.startsWith('[rebellion:command.pass-not-mid-activation] '));
    expect(line?.endsWith('(unverified)')).toBe(true);
  });
});

describe('side filtering', () => {
  it('keeps side-specific entries out of the other side context', () => {
    const empire = buildRulesContext(kb, {
      phase: 'command',
      commandTypes: COMMAND_TYPES,
      side: 'empire',
      maxChars: 100_000,
    });
    expect(empire.ruleIds).not.toContain('rebellion:leaders.mon-mothma-no-tactics');
    expect(empire.ruleIds).toContain('rebellion:base.ships-do-not-reveal');
    const rebels = buildRulesContext(kb, {
      phase: 'command',
      commandTypes: COMMAND_TYPES,
      side: 'rebels',
      maxChars: 100_000,
    });
    expect(rebels.ruleIds).toContain('rebellion:leaders.mon-mothma-no-tactics');
    expect(rebels.ruleIds).not.toContain('rebellion:base.ships-do-not-reveal');
  });
});
