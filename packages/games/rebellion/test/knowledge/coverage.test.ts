/**
 * SWR-005C W2 — coverage matrix of the core-v1 engine (AC-5, AC-6; TC-C-02..05).
 * File, symbol and test-name existence is checked by validateKnowledgeBase(kb, nodeIo) in validate.test.ts.
 */
import { describe, expect, it } from 'vitest';
import type { KbCoverageItem } from '@bga/platform/rules-kb';
import { loadKnowledgeBase } from './load-kb';

const kb = loadKnowledgeBase();
const coverage = kb.coverage;
if (!coverage) throw new Error('coverage.json missing');
const items = new Map(coverage.items.map((i) => [i.ruleId, i]));

function item(ruleId: string): KbCoverageItem {
  const found = items.get(ruleId);
  if (!found) throw new Error(`coverage item ${ruleId} missing`);
  return found;
}

/** Root categories of the core-v1 slice (AC-5, C-4 Q-8); their sub-categories belong to the slice too. */
const SLICE_ROOTS = new Set([
  'round',
  'command',
  'activation',
  'movement',
  'transport',
  'rebel-base',
  'victory',
  'refresh',
  'setup',
  'map',
  'units',
  'leaders',
]);
const parents = new Map(kb.manifest.categories.map((c) => [c.id, c.parent]));
function inSlice(category: string): boolean {
  for (let c: string | undefined = category; c !== undefined; c = parents.get(c)) {
    if (SLICE_ROOTS.has(c)) return true;
  }
  return false;
}

describe('core-v1 coverage (AC-5)', () => {
  it('is for the core-v1 engine, covers every rule entry and never an implementation-note', () => {
    expect(coverage.engine).toBe('core-v1');
    for (const e of kb.entries.filter((x) => x.kind === 'rule')) {
      expect(items.has(e.id), e.id).toBe(true);
    }
    const kinds = new Map(kb.entries.map((e) => [e.id, e.kind]));
    for (const id of items.keys()) expect(kinds.get(id), id).not.toBe('implementation-note');
  });

  it('covers every rule, clarification and interpretation of the slice categories (TC-C-02, Q-8)', () => {
    const slice = kb.entries.filter((e) => e.kind !== 'implementation-note' && inSlice(e.category));
    expect(slice.length).toBeGreaterThanOrEqual(100);
    for (const e of slice) expect(items.has(e.id), e.id).toBe(true);
  });

  it('records the engine decisions on slice interpretations and clarifications (review F-1)', () => {
    for (const id of [
      'rebellion:command.pass-not-mid-activation',
      'rebellion:command.move.no-enemy-pinning',
      'rebellion:command.activate.own-leader-system',
      'rebellion:command.activate.zero-units',
      'rebellion:base.death-star-does-not-reveal',
    ]) {
      expect(item(id).status, id).toBe('implemented');
    }
    expect(item('rebellion:command.pass-not-mid-activation').discrepancyIds).toContain('DISC-012');
    for (const id of [
      'rebellion:base.voluntary-reveal-timing',
      'rebellion:setup.rebel-units-errata',
    ]) {
      expect(item(id).status, id).toBe('not-implemented');
      expect(item(id).discrepancyIds?.length ?? 0, id).toBeGreaterThan(0);
    }
  });

  it('does not overstate partially modelled rules (review F-2)', () => {
    expect(item('rebellion:units.ships').status).toBe('partial');
    expect(item('rebellion:units.ships').discrepancyIds).toContain('DISC-001');
    expect(item('rebellion:command.turn-order').status).toBe('partial');
    expect(item('rebellion:command.turn-order').discrepancyIds).toContain('DISC-002');
  });

  it('marks combat and missions as not-implemented with a discrepancy (TC-C-03)', () => {
    for (const id of ['rebellion:combat.trigger', 'rebellion:missions.reveal-steps']) {
      expect(item(id).status, id).toBe('not-implemented');
      expect(item(id).discrepancyIds?.length ?? 0, id).toBeGreaterThan(0);
    }
  });

  it('links activation to activation.ts and activate.test.ts (TC-C-04, scenario 1)', () => {
    const activation = item('rebellion:command.activate.place-leader');
    expect(activation.status).toBe('implemented');
    expect(activation.implementation?.map((i) => i.path)).toContain(
      'packages/games/rebellion/src/rules/core/activation.ts',
    );
    expect(activation.tests?.map((t) => t.path)).toContain(
      'packages/games/rebellion/test/rules/core/activate.test.ts',
    );
  });

  it('cites only tests that SWR-006 does not edit', () => {
    for (const i of coverage.items) {
      for (const t of i.tests ?? []) {
        expect(t.path, i.ruleId).toMatch(
          /^packages\/games\/rebellion\/test\/(rules\/core\/(activate|move|legal|reveal|base|create|turn-flow|victory)|scenario\/core-data)\.test\.ts$/,
        );
      }
    }
  });
});

describe('core-v1 audit mapping (AC-6, TC-C-05)', () => {
  /** Engine rule label → [an entry, the coverage status the audit table expects]. */
  const verdicts: Array<[string, string, KbCoverageItem['status']]> = [
    ['R-3', 'rebellion:command.turn-order', 'partial'],
    ['R-4', 'rebellion:command.activate.place-leader', 'implemented'],
    ['R-5', 'rebellion:command.move.into-activated-from-adjacent', 'implemented'],
    ['R-6', 'rebellion:command.pass', 'implemented'],
    ['R-7', 'rebellion:refresh.steps', 'partial'],
    ['R-8', 'rebellion:base.reveal-timing', 'implemented'],
    ['R-9', 'rebellion:victory.empire', 'implemented'],
    ['R-10', 'rebellion:setup.base-choice', 'deviation'],
    ['D-6', 'rebellion:base.space-not-system', 'deviation'],
  ];

  it.each(verdicts)('%s → %s is %s', (label, ruleId, status) => {
    expect(item(ruleId).status).toBe(status);
    expect(item(ruleId).note ?? '').toContain(label);
  });

  it('every label R-3..R-10 and D-1..D-7 appears in a coverage note or a discrepancy title/engine behaviour', () => {
    const notes = coverage.items.map((i) => i.note ?? '');
    const disc = kb.discrepancies.map((d) => `${d.title} ${d.engineBehaviour}`);
    const haystack = [...notes, ...disc];
    const labels = [
      ...['R-3', 'R-4', 'R-5', 'R-6', 'R-7', 'R-8', 'R-9', 'R-10'],
      ...['D-1', 'D-2', 'D-3', 'D-4', 'D-5', 'D-6', 'D-7'],
    ];
    for (const label of labels) {
      const pattern = new RegExp(`(^|[^\\w-])${label}(?![\\d])`);
      expect(
        haystack.some((text) => pattern.test(text)),
        label,
      ).toBe(true);
    }
  });
});
