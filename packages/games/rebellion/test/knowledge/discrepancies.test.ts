/**
 * SWR-005C W2 — the discrepancy list covers the minimal list of the specification audit (AC-7; TC-C-07, TC-C-08).
 */
import { describe, expect, it } from 'vitest';
import type { KbDiscrepancy } from '@bga/platform/rules-kb';
import { loadKnowledgeBase } from './load-kb';

const kb = loadKnowledgeBase();
const entryIds = new Set(kb.entries.map((e) => e.id));

function find(predicate: (d: KbDiscrepancy) => boolean): KbDiscrepancy[] {
  return kb.discrepancies.filter(predicate);
}

describe('discrepancies (AC-7)', () => {
  it('have sequential DISC-NNN ids and every field filled (TC-C-08)', () => {
    kb.discrepancies.forEach((d, i) => {
      expect(d.id).toBe(`DISC-${String(i + 1).padStart(3, '0')}`);
      for (const text of [d.title, d.engineBehaviour, d.officialBehaviour, d.followUp]) {
        expect(text.trim().length, d.id).toBeGreaterThan(5);
      }
      expect(d.ruleIds.length, d.id).toBeGreaterThan(0);
      for (const id of d.ruleIds) expect(entryIds.has(id), `${d.id} → ${id}`).toBe(true);
      expect(d.officialBehaviour, d.id).toMatch(/(RR|LTP|FAQ) p\.\d+/);
    });
  });

  /** Minimal list of the specification (audit section), each matched by a key rule id and a kind. */
  const minimal: Array<[string, string, KbDiscrepancy['kind']]> = [
    ['combat (D-1)', 'rebellion:combat.trigger', 'missing-mechanic'],
    ['missions and Assignment Phase (D-2)', 'rebellion:assignment.order', 'missing-mechanic'],
    ['incomplete Refresh (D-3)', 'rebellion:refresh.steps', 'missing-mechanic'],
    ['objectives and reputation', 'rebellion:cards.objectives', 'missing-mechanic'],
    ['loyalty and subjugation (D-5, step 5)', 'rebellion:loyalty.subjugation', 'missing-mechanic'],
    ['voluntary base reveal', 'rebellion:base.voluntary-reveal', 'missing-mechanic'],
    ['engine chooses the base (D-4/R-10)', 'rebellion:setup.base-choice', 'intentional-deviation'],
    ['Rebel Base space (D-6)', 'rebellion:base.space-not-system', 'intentional-deviation'],
    ['permanent reveal condition', 'rebellion:base.reveal-condition', 'latent-gap'],
    ['fixed first game setup (D-5)', 'rebellion:setup.standard-loyalty', 'intentional-deviation'],
    ['starting leaders only (D-7)', 'rebellion:leaders.starting', 'intentional-deviation'],
    ['PASS during an activation', 'rebellion:command.pass', 'intentional-deviation'],
    [
      'transport within one command',
      'rebellion:command.transport.capacity',
      'intentional-deviation',
    ],
    ['Rebel data / adjacency / leaders', 'rebellion:command.move.adjacency', 'data-uncertainty'],
    ['component limitations', 'rebellion:general.component-limits', 'missing-mechanic'],
  ];

  it.each(minimal)('%s', (_label, ruleId, kind) => {
    expect(find((d) => d.kind === kind && d.ruleIds.includes(ruleId)).length).toBeGreaterThan(0);
  });

  it('lists the data uncertainties for the box check', () => {
    const verify = find((d) => d.kind === 'data-uncertainty');
    expect(verify.every((d) => d.decision === 'verify-with-box')).toBe(true);
    const ruleIds = verify.flatMap((d) => d.ruleIds);
    for (const id of [
      'rebellion:command.transport.capacity',
      'rebellion:command.move.adjacency',
      'rebellion:command.activate.tactic-values-required',
      'rebellion:refresh.advance-time',
    ]) {
      expect(ruleIds, id).toContain(id);
    }
  });

  it('records no implementation bug in the slice (audit verdict)', () => {
    expect(find((d) => d.kind === 'bug')).toEqual([]);
  });
});
