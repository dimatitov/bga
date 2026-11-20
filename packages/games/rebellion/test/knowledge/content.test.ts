/**
 * SWR-005C W2 — content of the Rebellion knowledge base (AC-3, AC-4; TC-R-01..05, TC-K-01..05, TC-M-03).
 */
import { describe, expect, it } from 'vitest';
import type { KbEntry } from '@bga/platform/rules-kb';
import { loadKnowledgeBase } from './load-kb';

const kb = loadKnowledgeBase();
const byId = new Map(kb.entries.map((e) => [e.id, e]));
const sourceKind = new Map(kb.manifest.sources.map((s) => [s.id, s.kind]));

function entry(id: string): KbEntry {
  const found = byId.get(id);
  if (!found) throw new Error(`entry ${id} missing`);
  return found;
}

describe('Rebellion knowledge base — size and shape (AC-3)', () => {
  it('has at least 80 entries, each with id, category, kind, status and a source page', () => {
    expect(kb.entries.length).toBeGreaterThanOrEqual(80);
    for (const e of kb.entries) {
      expect(e.id.startsWith('rebellion:'), e.id).toBe(true);
      expect(e.category.length, e.id).toBeGreaterThan(0);
      expect(e.sources.length, e.id).toBeGreaterThan(0);
      for (const ref of e.sources) expect(ref.page, e.id).toBeGreaterThan(0);
    }
  });

  it('lists every RR glossary topic, RR setup, the LTP round/command/refresh/base pages and the first game setup', () => {
    const sections = kb.manifest.sourceSections;
    const has = (sourceId: string, page: number, title: string) =>
      sections.some((s) => s.sourceId === sourceId && s.page === page && s.title.includes(title));
    // A sample of glossary topics across the whole index (all 86 lines of the RR p.16 index were copied).
    for (const [page, title] of [
      [2, 'Activating Systems'],
      [6, 'Command Phase'],
      [9, 'Moving Units'],
      [10, 'Rebel Base'],
      [11, 'Revealing the Rebel Base'],
      [12, 'Refresh Phase'],
      [14, 'Transport Capacity'],
      [14, 'Winning the Game'],
      [15, 'Setup'],
    ] as const) {
      expect(has('RR', page, title), `RR p.${page} ${title}`).toBe(true);
    }
    // 86 index topics + "The Golden Rules" (p.2) + the setup appendix (p.15).
    expect(sections.filter((s) => s.sourceId === 'RR').length).toBeGreaterThanOrEqual(88);
    expect(has('LTP', 6, 'Playing the Game')).toBe(true);
    expect(has('LTP', 7, 'Command Phase')).toBe(true);
    expect(has('LTP', 10, 'Refresh Phase')).toBe(true);
    expect(has('LTP', 12, 'Rebel Base')).toBe(true);
    expect(has('LTP', 16, 'First Game Setup')).toBe(true);
  });

  it('skips the Team Game with a reason and never covers it', () => {
    const teamGame = kb.manifest.sourceSections.filter((s) => s.title === 'Team Game');
    expect(teamGame.map((s) => s.sourceId).sort()).toEqual(['LTP', 'RR']);
    for (const s of teamGame) {
      expect(s.coveredBy).toBe('skip');
      expect(s.reason).toMatch(/3-4 players/);
    }
    for (const e of kb.entries) expect(e.title.toLowerCase()).not.toContain('team game');
  });

  it('records exceptions that point to existing entries (TC-R-05)', () => {
    const lock = entry('rebellion:command.move.own-leader-locks');
    expect(lock.exceptions?.flatMap((x) => x.ruleIds ?? [])).toContain(
      'rebellion:base.leader-in-space-locks',
    );
    const reveal = entry('rebellion:base.reveal-condition');
    expect(reveal.exceptions?.flatMap((x) => x.ruleIds ?? [])).toContain(
      'rebellion:base.ships-do-not-reveal',
    );
    for (const e of kb.entries) {
      for (const id of e.exceptions?.flatMap((x) => x.ruleIds ?? []) ?? []) {
        expect(byId.has(id), `${e.id} → ${id}`).toBe(true);
      }
    }
  });

  it('never cites Rise of the Empire (TC-M-03)', () => {
    for (const e of kb.entries) {
      expect(e.product).toBe('base');
      expect(`${e.title} ${e.text}`.toLowerCase()).not.toContain('rise of the empire');
      for (const ref of e.sources) {
        if (ref.sourceId === 'FAQ') expect(ref.page, e.id).toBeLessThanOrEqual(5);
      }
    }
  });
});

describe('Rebellion knowledge base — kinds (AC-4)', () => {
  it('uses all four kinds', () => {
    expect(new Set(kb.entries.map((e) => e.kind))).toEqual(
      new Set(['rule', 'clarification', 'interpretation', 'implementation-note']),
    );
  });

  it('records the three base game errata as clarifications citing the FAQ and amending an RR rule (TC-K-02)', () => {
    const errata = [
      ['rebellion:base.voluntary-reveal-timing', 'rebellion:base.voluntary-reveal'],
      ['rebellion:loyalty.neutral-errata', 'rebellion:loyalty.system-types'],
      ['rebellion:setup.rebel-units-errata', 'rebellion:setup.standard-rebel-units'],
    ] as const;
    for (const [id, amended] of errata) {
      const e = entry(id);
      expect(e.kind, id).toBe('clarification');
      expect(e.sources.some((r) => r.sourceId === 'FAQ' && r.page === 1)).toBe(true);
      expect(e.amends).toContain(amended);
      const target = entry(amended);
      expect(target.kind).toBe('rule');
      expect(target.sources.some((r) => r.sourceId === 'RR')).toBe(true);
    }
  });

  it('every clarification cites the FAQ and amends an existing entry', () => {
    for (const e of kb.entries.filter((x) => x.kind === 'clarification')) {
      expect(
        e.sources.some((r) => sourceKind.get(r.sourceId) === 'faq'),
        e.id,
      ).toBe(true);
      expect(e.amends?.length ?? 0, e.id).toBeGreaterThan(0);
    }
  });

  it('every interpretation has a rationale and a source; disputed ones are needs-review (TC-K-03)', () => {
    for (const e of kb.entries.filter((x) => x.kind === 'interpretation')) {
      expect(e.rationale?.trim().length ?? 0, e.id).toBeGreaterThan(20);
      expect(e.sources.length, e.id).toBeGreaterThan(0);
    }
    for (const id of [
      'rebellion:command.pass-not-mid-activation',
      'rebellion:command.activate.own-leader-system',
      'rebellion:command.move.no-enemy-pinning',
      'rebellion:base.units-on-space',
    ]) {
      expect(entry(id).kind, id).toBe('interpretation');
      expect(entry(id).status, id).toBe('needs-review');
    }
  });

  it('every implementation-note references a discrepancy and an official page (TC-K-04)', () => {
    const discIds = new Set(kb.discrepancies.map((d) => d.id));
    const notes = kb.entries.filter((x) => x.kind === 'implementation-note');
    expect(notes.length).toBeGreaterThanOrEqual(10);
    for (const e of notes) {
      expect(e.discrepancyIds?.length ?? 0, e.id).toBeGreaterThan(0);
      for (const id of e.discrepancyIds ?? [])
        expect(discIds.has(id), `${e.id} → ${id}`).toBe(true);
      expect(
        e.sources.some((r) => sourceKind.get(r.sourceId) !== 'other'),
        e.id,
      ).toBe(true);
    }
  });

  it('marks fan-sourced data as needs-review (TC-K-05)', () => {
    for (const id of [
      'rebellion:leaders.mon-mothma-no-tactics',
      'rebellion:units.faction-sheet-values',
      'rebellion:map.mustafar-utapau',
      'rebellion:map.region-names',
      'rebellion:refresh.time-track-icons',
    ]) {
      expect(entry(id).status, id).toBe('needs-review');
      expect(entry(id).discrepancyIds?.length ?? 0, id).toBeGreaterThan(0);
    }
  });

  it('marks the rules every AI decision needs as ai: core', () => {
    const core = new Set(kb.entries.filter((e) => e.ai === 'core').map((e) => e.id));
    for (const id of [
      'rebellion:round.structure',
      'rebellion:command.turn-order',
      'rebellion:command.pass',
      'rebellion:command.activate.place-leader',
      'rebellion:command.move.into-activated-from-adjacent',
      'rebellion:command.move.own-leader-locks',
      'rebellion:command.transport.capacity',
      'rebellion:base.reveal-condition',
      'rebellion:victory.empire',
      'rebellion:victory.rebels',
    ]) {
      expect(core.has(id), id).toBe(true);
    }
  });
});
