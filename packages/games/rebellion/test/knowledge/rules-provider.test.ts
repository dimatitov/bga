/**
 * SWR-008 W3 — the Rebellion rules context provider on the REAL knowledge base (plan-backend C-6, §3, §7.6;
 * TC-SEL-01..10/12, TC-ST-01/02/03/05, TC-FB-06, TC-CT-03/04, TC-D-36).
 * Golden (TC-SEL-04): `test/knowledge/fixtures/rules-selection.golden.json`; regenerate with
 * UPDATE_RULES_SELECTION_GOLDEN=1 pnpm --filter @bga/game-rebellion exec vitest run test/knowledge/rules-provider.test.ts
 * (then `npx prettier --write` the golden file).
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  RULES_VERSION_PATTERN,
  rulesSelectionInputOf,
  type AutomationDecisionPoint,
  type RulesContextResult,
  type RulesSelectionInput,
} from '@bga/platform';
import { formatContextLine, type KbEntry } from '@bga/platform/rules-kb';
import { CORE_COMMAND_TYPES, CORE_SYSTEM_IDS } from '../../src/schema';
import {
  REBELLION_ENGINE_SCOPE_RULE_ID,
  REBELLION_KNOWLEDGE_BASE_DIR,
  REBELLION_TAG_RULES,
  rebellionRules,
  rebellionServerModule,
} from '../../src/server';
import { REBELLION_RULE_TAGS } from '../../src/ai';
import { KB_DIR, loadKnowledgeBase, loadRawKnowledgeBase, repoPath } from './load-kb';

const MAX_CHARS = 6000;
/**
 * Command types the AI can be offered (SWR-010 W2: the physical-table commands CONFIRM_TABLE_TASK / REGISTER_CARD
 * belong to the human only and are never AI candidates, plan-backend §8.2) — keeps the 2^5 combinations.
 */
const AI_COMMAND_TYPES = CORE_COMMAND_TYPES.filter(
  (t) => t !== 'CONFIRM_TABLE_TASK' && t !== 'REGISTER_CARD',
);
const GOLDEN_PATH = 'packages/games/rebellion/test/knowledge/fixtures/rules-selection.golden.json';
const UPDATE_GOLDEN = process.env.UPDATE_RULES_SELECTION_GOLDEN === '1';

const kb = loadKnowledgeBase();
const byId = new Map(kb.entries.map((e) => [e.id, e] as const));
const provider = rebellionRules.createRulesContextProvider(loadRawKnowledgeBase());
const NEEDS_REVIEW = kb.entries.filter((e) => e.status === 'needs-review').map((e) => e.id);
const SIDES = ['empire', 'rebels'] as const;
const IDLE = ['ACTIVATE_SYSTEM', 'PASS'];
const ACTIVE = ['FINISH_ACTIVATION', 'MOVE_PIECES'];
/** Every public tag set `rulesQueryFor` can produce (sorted). */
const TAG_SETS: string[][] = [
  ['base-hidden'],
  ['base-hidden', 'opponent-passed'],
  ['base-revealed'],
  ['base-revealed', 'opponent-passed'],
];

function entry(id: string): KbEntry {
  const found = byId.get(id);
  if (!found) throw new Error(`entry ${id} missing`);
  return found;
}

function sel(
  actor: string,
  commandTypes: readonly string[],
  tags: readonly string[] = [],
  phase = 'command',
  maxChars = MAX_CHARS,
): RulesContextResult {
  return provider.selectRules({
    actor,
    phase,
    commandTypes: [...commandTypes].sort(),
    tags: [...tags].sort(),
    maxChars,
  });
}

function subsets<T>(items: readonly T[]): T[][] {
  return Array.from({ length: 2 ** items.length }, (_, mask) =>
    items.filter((_item, i) => (mask & (1 << i)) !== 0),
  );
}

const ENGINE_SCOPE_LINE = formatContextLine(entry(REBELLION_ENGINE_SCOPE_RULE_ID));

describe('rebellionRules (C-6): configuration on the real knowledge base', () => {
  it('the server module registers it; the knowledge base dir exists', () => {
    expect(rebellionServerModule.rules).toBe(rebellionRules);
    expect(rebellionRules.knowledgeBaseDir).toBe(REBELLION_KNOWLEDGE_BASE_DIR);
    expect(REBELLION_KNOWLEDGE_BASE_DIR).toBe(KB_DIR);
    expect(existsSync(repoPath(`${KB_DIR}/manifest.json`))).toBe(true);
  });

  it('pinned engine scope and every tag rule exist, are verified and may reach the AI', () => {
    const scope = entry(REBELLION_ENGINE_SCOPE_RULE_ID);
    expect(scope.kind).toBe('implementation-note');
    expect(scope.status).toBe('verified');
    expect(scope.ai).toBe('core');
    expect(Object.keys(REBELLION_TAG_RULES).sort()).toEqual([...REBELLION_RULE_TAGS].sort());
    for (const [tag, ids] of Object.entries(REBELLION_TAG_RULES)) {
      for (const id of ids) {
        const e = entry(id);
        expect(e.status, `${tag} → ${id}`).toBe('verified');
        expect(e.ai, `${tag} → ${id}`).not.toBe('none');
        expect(e.appliesTo?.sides ?? [], `${tag} → ${id}: no side filter`).toEqual([]);
      }
    }
    expect(REBELLION_TAG_RULES['base-hidden']).not.toContain('rebellion:base.secret-location');
  });

  it('rulesVersion is the content hash; requiredChars is the engine-scope line', () => {
    expect(provider.rulesVersion).toMatch(RULES_VERSION_PATTERN);
    expect(provider.rulesVersion.startsWith('rebellion@1:')).toBe(true);
    expect(provider.requiredChars).toBe(ENGINE_SCOPE_LINE.length);
  });

  it('TC-CT-03: the version does not depend on the order of entries / files', () => {
    const raw = loadRawKnowledgeBase();
    const reversed = rebellionRules.createRulesContextProvider({
      ...raw,
      entries: [...raw.entries].reverse(),
    });
    expect(reversed.rulesVersion).toBe(provider.rulesVersion);
    expect(rebellionRules.createRulesContextProvider(raw).rulesVersion).toBe(provider.rulesVersion);
  });

  it('TC-CT-04: changing one field of one entry changes the version', () => {
    const raw = loadRawKnowledgeBase();
    const entries = raw.entries.map((e) =>
      (e as KbEntry).id === 'rebellion:victory.rebels'
        ? { ...(e as KbEntry), title: `${(e as KbEntry).title}.` }
        : e,
    );
    const changed = rebellionRules.createRulesContextProvider({ ...raw, entries });
    expect(changed.rulesVersion).toMatch(RULES_VERSION_PATTERN);
    expect(changed.rulesVersion).not.toBe(provider.rulesVersion);
  });
});

describe('public decision sets (idle / own activation × side × tags) — sizes vs 6000', () => {
  const rows: string[] = [];
  for (const side of SIDES) {
    for (const [state, types] of [
      ['idle', IDLE],
      ['active', ACTIVE],
    ] as const) {
      for (const tags of TAG_SETS) {
        const result = sel(side, types, tags);
        rows.push(
          `${side}/${state}/${tags.join('+')}: rules=${result.ruleIds.length} chars=${result.text.length} truncated=${result.truncated}`,
        );
      }
    }
  }

  it('every set fits without truncation, engine scope first (log line with the measured sizes)', () => {
    console.log(`[swr008-rules-selection] maxChars=${MAX_CHARS}\n  ${rows.join('\n  ')}`);
    for (const side of SIDES) {
      for (const types of [IDLE, ACTIVE]) {
        for (const tags of TAG_SETS) {
          const result = sel(side, types, tags);
          const label = `${side} ${types.join(',')} ${tags.join(',')}`;
          expect(result.truncated, label).toBe(false);
          expect(result.text.length, label).toBeLessThanOrEqual(MAX_CHARS);
          expect(result.ruleIds[0], label).toBe(REBELLION_ENGINE_SCOPE_RULE_ID);
        }
      }
    }
  });
});

describe('selection on the real knowledge base (TC-SEL-01..03, 05, 07..10, 12; TC-FB-06)', () => {
  it('TC-SEL-01: {PASS}, {ACTIVATE_SYSTEM,PASS}, {FINISH_ACTIVATION,MOVE_PIECES} for the Empire differ; MOVE rules only with MOVE_PIECES', () => {
    const pass = sel('empire', ['PASS']);
    const idle = sel('empire', IDLE);
    const active = sel('empire', ACTIVE);
    for (const r of [pass, idle, active]) expect(r.truncated).toBe(false);
    expect(pass.ruleIds).not.toEqual(idle.ruleIds);
    expect(pass.ruleIds).not.toEqual(active.ruleIds);
    expect(idle.ruleIds).not.toEqual(active.ruleIds);

    const moveRule = (id: string) =>
      entry(id).appliesTo?.commands?.includes('MOVE_PIECES') ?? false;
    const nonCoreMove = (r: RulesContextResult) =>
      r.ruleIds.filter((id) => moveRule(id) && entry(id).ai !== 'core');
    expect(nonCoreMove(active).length).toBeGreaterThan(0);
    expect(nonCoreMove(pass)).toEqual([]);
    expect(nonCoreMove(idle)).toEqual([]);
    expect(active.ruleIds).toContain('rebellion:command.move.into-activated-from-adjacent');
    expect(active.ruleIds).toContain('rebellion:command.transport.capacity');
  });

  it('TC-SEL-02: same types, Empire vs Rebels differ by appliesTo.sides', () => {
    const empire = sel('empire', ACTIVE);
    const rebels = sel('rebels', ACTIVE);
    expect(empire.ruleIds).not.toEqual(rebels.ruleIds);
    expect(empire.ruleIds).toContain('rebellion:base.ships-do-not-reveal');
    expect(rebels.ruleIds).not.toContain('rebellion:base.ships-do-not-reveal');
    for (const [side, r] of [
      ['empire', empire],
      ['rebels', rebels],
    ] as const) {
      for (const id of r.ruleIds.slice(1)) {
        const sides = entry(id).appliesTo?.sides ?? [];
        expect(sides.length === 0 || sides.includes(side), `${side}: ${id}`).toBe(true);
      }
    }
  });

  it('TC-SEL-03: phase command vs refresh vs setup (no types) differ by appliesTo.phases', () => {
    const results = (['command', 'refresh', 'setup'] as const).map(
      (phase) => [phase, sel('empire', [], [], phase)] as const,
    );
    const keys = results.map(([, r]) => r.ruleIds.join('|'));
    expect(new Set(keys).size).toBe(3);
    for (const [phase, r] of results) {
      for (const id of r.ruleIds.slice(1)) {
        const e = entry(id);
        if (e.ai === 'core') continue;
        expect(e.appliesTo?.phases ?? [], `${phase}: ${id}`).toContain(phase);
      }
    }
  });

  it('TC-SEL-05: order and repetitions of the query do not matter (rulesSelectionInputOf)', () => {
    const point = (commandTypes: string[], tags: string[]): AutomationDecisionPoint => ({
      actor: 'empire',
      phase: 'command',
      objective: 'Find and capture the Rebel base.',
      situation: 'Round 1.',
      candidates: [{ id: 'c1', type: 'PASS', summary: 'Pass.' }],
      fallbackCandidateId: 'c1',
      policyId: 'test-policy',
      rulesQuery: { commandTypes, tags },
    });
    const a = provider.selectRules(
      rulesSelectionInputOf(point(['PASS', 'MOVE_PIECES', 'PASS'], ['opponent-passed']), MAX_CHARS),
    );
    const b = provider.selectRules(
      rulesSelectionInputOf(point(['MOVE_PIECES', 'PASS'], ['opponent-passed']), MAX_CHARS),
    );
    expect(a).toEqual(b);
    expect(a).toEqual(sel('empire', ['MOVE_PIECES', 'PASS'], ['opponent-passed']));
  });

  it('TC-SEL-07: limit L = full length → all lines; L-1 drops exactly the whole last line; L+1 as L', () => {
    const full = sel('empire', ACTIVE, ['base-hidden', 'opponent-passed'], 'command', 12_000);
    expect(full.truncated).toBe(false);
    const L = full.text.length;
    expect(sel('empire', ACTIVE, ['base-hidden', 'opponent-passed'], 'command', L)).toEqual(full);
    expect(sel('empire', ACTIVE, ['base-hidden', 'opponent-passed'], 'command', L + 1)).toEqual(
      full,
    );
    const cut = sel('empire', ACTIVE, ['base-hidden', 'opponent-passed'], 'command', L - 1);
    expect(cut.truncated).toBe(true);
    expect(cut.ruleIds).toEqual(full.ruleIds.slice(0, -1));
    const fullLines = full.text.split('\n');
    expect(cut.text).toBe(fullLines.slice(0, -1).join('\n'));
  });

  it('TC-SEL-08: a small limit keeps a prefix in R-2 order: engine scope → core → commands → phase → tags (id asc inside)', () => {
    const input = ['rebels', ACTIVE, ['base-hidden', 'opponent-passed']] as const;
    const full = sel(...input, 'command', 12_000);
    const groupOf = (id: string): number => {
      if (id === REBELLION_ENGINE_SCOPE_RULE_ID) return 0;
      const e = entry(id);
      if (e.ai === 'core') return 1;
      if (e.appliesTo?.commands?.some((c) => ACTIVE.includes(c))) return 2;
      if (e.appliesTo?.phases?.includes('command')) return 3;
      return 4;
    };
    const groups = full.ruleIds.map(groupOf);
    expect(groups).toEqual([...groups].sort((a, b) => a - b));
    // The phase group is empty here (every command-phase entry already came through core / commands).
    for (const g of [0, 1, 2, 4]) expect(groups, `group ${g}`).toContain(g);
    for (let i = 1; i < full.ruleIds.length; i += 1) {
      if (groups[i] === groups[i - 1] && groups[i] !== 0) {
        expect(full.ruleIds[i - 1]! < full.ruleIds[i]!, full.ruleIds[i]).toBe(true);
      }
    }
    const small = sel(...input, 'command', 1500);
    expect(small.truncated).toBe(true);
    expect(small.text.length).toBeLessThanOrEqual(1500);
    expect(small.ruleIds).toEqual(full.ruleIds.slice(0, small.ruleIds.length));
    expect(full.text.startsWith(small.text)).toBe(true);
  });

  it('TC-SEL-09: maxChars 0 / -1 / 1.5 / NaN / below the engine-scope line → an error, never a silent empty block', () => {
    for (const maxChars of [0, -1, 1.5, Number.NaN, provider.requiredChars - 1]) {
      expect(() => sel('empire', IDLE, [], 'command', maxChars), String(maxChars)).toThrow();
    }
    expect(() => sel('empire', IDLE, [], 'command', provider.requiredChars - 1)).toThrow(
      RangeError,
    );
  });

  it('TC-SEL-10: one line per rule, `[<id>] ` prefix, ruleIds in line order', () => {
    const r = sel('rebels', IDLE, ['base-hidden']);
    const lines = r.text.split('\n');
    expect(lines.length).toBe(r.ruleIds.length);
    lines.forEach((line, i) => {
      expect(line.startsWith(`[${r.ruleIds[i]}] `)).toBe(true);
      expect(line).toBe(formatContextLine(entry(r.ruleIds[i]!)));
    });
  });

  it('TC-SEL-12: a tag adds its rules only as the last group; without tags the set is phase/types/side', () => {
    for (const side of SIDES) {
      const none = sel(side, IDLE, []);
      for (const tags of TAG_SETS) {
        const tagged = sel(side, IDLE, tags);
        expect(tagged.ruleIds.slice(0, none.ruleIds.length), `${side} ${tags.join(',')}`).toEqual(
          none.ruleIds,
        );
        const added = tagged.ruleIds.slice(none.ruleIds.length);
        const allowed = new Set(tags.flatMap((t) => REBELLION_TAG_RULES[t] ?? []));
        for (const id of added)
          expect(allowed.has(id), `${side} ${tags.join(',')}: ${id}`).toBe(true);
      }
    }
    // An unknown tag adds nothing.
    expect(sel('empire', IDLE, ['zz-unknown'])).toEqual(sel('empire', IDLE, []));
  });

  it('TC-FB-06: nothing but mandatory rules fits (phase unknown, no types) → engine scope + ai:core only', () => {
    for (const side of SIDES) {
      const r = sel(side, [], [], 'unknown');
      expect(r.ruleIds[0]).toBe(REBELLION_ENGINE_SCOPE_RULE_ID);
      for (const id of r.ruleIds) expect(entry(id).ai, id).toBe('core');
      expect(r.truncated).toBe(false);
    }
  });
});

describe('every combination (TC-SEL-06, TC-ST-01, TC-ST-03, TC-ST-05)', () => {
  const PHASES = ['command', 'refresh', 'setup', 'assignment', 'unknown'];
  const typeSets = subsets(AI_COMMAND_TYPES);
  const tagSets: string[][] = [[], ...TAG_SETS];
  const NOT_IMPLEMENTED_CATEGORIES = new Set(['combat', 'missions', 'build-deploy', 'recruit']);
  const coreTypes = new Set<string>(CORE_COMMAND_TYPES);

  it('stays within 6000 characters, far below 181 rules, never ai:none / needs-review, engine scope first, only engine actions', () => {
    let combos = 0;
    let maxLength = 0;
    let maxRules = 0;
    let truncatedCount = 0;
    for (const phase of PHASES) {
      for (const types of typeSets) {
        for (const side of SIDES) {
          for (const tags of tagSets) {
            const r = sel(side, types, tags, phase);
            const label = `${phase} ${side} [${types.join(',')}] [${tags.join(',')}]`;
            combos += 1;
            maxLength = Math.max(maxLength, r.text.length);
            maxRules = Math.max(maxRules, r.ruleIds.length);
            if (r.truncated) truncatedCount += 1;
            expect(r.text.length, label).toBeLessThanOrEqual(MAX_CHARS);
            expect(r.ruleIds.length, label).toBeLessThan(kb.entries.length);
            // TC-ST-03: engine scope is the first line.
            expect(r.text.split('\n')[0], label).toBe(ENGINE_SCOPE_LINE);
            // TC-ST-01: no needs-review entry, no "(unverified)" marker.
            expect(r.text, label).not.toContain('(unverified)');
            for (const id of NEEDS_REVIEW) {
              expect(r.ruleIds, label).not.toContain(id);
              expect(r.text, label).not.toContain(`[${id}]`);
            }
            for (const id of r.ruleIds) {
              const e = entry(id);
              // TC-SEL-06: no ai:'none' (the engine scope itself is ai:'core').
              expect(e.ai, `${label}: ${id}`).not.toBe('none');
              // TC-ST-05: no rule instructs an action the engine does not have.
              for (const c of e.appliesTo?.commands ?? []) {
                expect(coreTypes.has(c), `${label}: ${id} → ${c}`).toBe(true);
              }
              // The core-v1 AI decides only in the Command Phase (TC-SEL-03 note): there no rule of a
              // not implemented mechanic is selected. Other phases only prove the mechanism (build rules appear in
              // 'refresh'; the engine-scope line says they do not apply).
              if (phase === 'command') {
                expect(NOT_IMPLEMENTED_CATEGORIES.has(e.category), `${label}: ${id}`).toBe(false);
              }
            }
          }
        }
      }
    }
    console.log(
      `[swr008-rules-selection] TC-SEL-06 combos=${combos} maxChars=${maxLength} maxRules=${maxRules} truncated=${truncatedCount} entries=${kb.entries.length}`,
    );
    expect(combos).toBe(PHASES.length * 32 * 2 * tagSets.length);
  });

  it('TC-ST-03: the engine scope names all five missing mechanics and survives the minimal limit', () => {
    const text = entry(REBELLION_ENGINE_SCOPE_RULE_ID).text.toLowerCase();
    for (const word of ['combat', 'missions', 'production', 'probe droids', 'loyalty']) {
      expect(text, word).toContain(word);
    }
    for (const side of SIDES) {
      const minimal = sel(
        side,
        ACTIVE,
        ['base-hidden', 'opponent-passed'],
        'command',
        provider.requiredChars,
      );
      expect(minimal.ruleIds).toEqual([REBELLION_ENGINE_SCOPE_RULE_ID]);
      expect(minimal.text).toBe(ENGINE_SCOPE_LINE);
      expect(minimal.truncated).toBe(true);
    }
  });

  it('TC-ST-02: a core rule moved to needs-review leaves the AI context (status beats priority)', () => {
    const raw = loadRawKnowledgeBase();
    const entries = raw.entries.map((e) =>
      (e as KbEntry).id === 'rebellion:victory.empire'
        ? { ...(e as KbEntry), status: 'needs-review' }
        : e,
    );
    const changed = rebellionRules.createRulesContextProvider({ ...raw, entries });
    expect(sel('empire', IDLE).ruleIds).toContain('rebellion:victory.empire');
    const r = changed.selectRules({
      actor: 'empire',
      phase: 'command',
      commandTypes: IDLE,
      tags: [],
      maxChars: MAX_CHARS,
    });
    expect(r.ruleIds).not.toContain('rebellion:victory.empire');
  });
});

describe('hidden information guard (plan-backend §9)', () => {
  const patterns = CORE_SYSTEM_IDS.map(
    (id) => [id, new RegExp(`(^|[^a-z])${id.replace(/-/g, '[- ]')}([^a-z]|$)`, 'i')] as const,
  );

  it('no entry that may reach the AI has a system id in its rule id (ids are shown in dev diagnostics)', () => {
    const selectable = kb.entries.filter((e) => e.ai !== 'none' && e.status !== 'needs-review');
    expect(selectable.length).toBeGreaterThan(20);
    for (const e of selectable) {
      for (const [systemId, pattern] of patterns) {
        expect(pattern.test(e.id), `${e.id} → ${systemId}`).toBe(false);
      }
    }
  });

  it('no rule selectable in the Command Phase names a system in its title or text', () => {
    const selected = new Set<string>();
    for (const side of SIDES) {
      for (const types of subsets(AI_COMMAND_TYPES)) {
        for (const tags of [[], ...TAG_SETS]) {
          for (const id of sel(side, types, tags, 'command', 12_000).ruleIds) selected.add(id);
        }
      }
    }
    expect(selected.size).toBeGreaterThan(15);
    for (const id of selected) {
      const e = entry(id);
      for (const [systemId, pattern] of patterns) {
        expect(pattern.test(`${e.title} ${e.text}`), `${id} → ${systemId}`).toBe(false);
      }
    }
  });
});

describe('DISC-009 in the knowledge base (TC-D-36, §7.6)', () => {
  it('DISC-009 is closed and describes the central check; the implementation note keeps its id', () => {
    const disc = kb.discrepancies.find((d) => d.id === 'DISC-009');
    expect(disc?.kind).toBe('latent-gap');
    expect(disc?.decision).toBe('fixed');
    expect(disc?.engineBehaviour).toContain('runStateChecks');
    expect(disc?.engineBehaviour).toContain('after every accepted core-v1 command');
    expect(disc?.followUp).toContain('baseRevealConditionMet');
    expect(disc?.refs).toContain('rebellion:impl.reveal-only-at-finish');
    const note = entry('rebellion:impl.reveal-only-at-finish');
    expect(note.title).toBe('core-v1 reveals the base by a central state check');
    expect(note.text).toContain('After every accepted command and at game creation');
    expect(note.discrepancyIds).toEqual(['DISC-009', 'DISC-005']);
    expect(note.ai).toBe('none');
  });

  it('coverage evidence points to the central check (no revealsBaseNow)', () => {
    const items = new Map((kb.coverage?.items ?? []).map((i) => [i.ruleId, i]));
    const symbols = (ruleId: string) =>
      (items.get(ruleId)?.implementation ?? []).map((i) => `${i.path}:${i.symbol}`);
    const sc = 'packages/games/rebellion/src/rules/core/state-checks.ts';
    expect(symbols('rebellion:base.reveal-condition')).toEqual(
      expect.arrayContaining([`${sc}:baseRevealConditionMet`, `${sc}:runStateChecks`]),
    );
    expect(items.get('rebellion:base.reveal-condition')?.discrepancyIds).toEqual(['DISC-005']);
    expect(symbols('rebellion:base.reveal-timing')).toEqual(
      expect.arrayContaining([`${sc}:revealTimingAllows`, `${sc}:runStateChecks`]),
    );
    expect(symbols('rebellion:victory.empire')).toContain(`${sc}:runStateChecks`);
    for (const item of kb.coverage?.items ?? []) {
      for (const impl of item.implementation ?? []) {
        expect(impl.symbol, item.ruleId).not.toBe('revealsBaseNow');
      }
    }
  });
});

describe('selection golden (TC-SEL-04)', () => {
  const GOLDEN_INPUTS: Array<[string, RulesSelectionInput]> = [
    ['empire idle, base hidden', input('empire', IDLE, ['base-hidden'])],
    [
      'empire active, base hidden, rebels passed',
      input('empire', ACTIVE, ['base-hidden', 'opponent-passed']),
    ],
    [
      'empire active, base revealed, rebels passed',
      input('empire', ACTIVE, ['base-revealed', 'opponent-passed']),
    ],
    ['rebels idle, base hidden', input('rebels', IDLE, ['base-hidden'])],
    [
      'rebels active, base hidden, empire passed',
      input('rebels', ACTIVE, ['base-hidden', 'opponent-passed']),
    ],
    [
      'rebels idle, base revealed, empire passed',
      input('rebels', IDLE, ['base-revealed', 'opponent-passed']),
    ],
  ];

  function input(actor: string, commandTypes: string[], tags: string[]): RulesSelectionInput {
    return { actor, phase: 'command', commandTypes, tags, maxChars: MAX_CHARS };
  }

  const actual = GOLDEN_INPUTS.map(([name, i]) => ({
    name,
    input: i,
    result: provider.selectRules(i),
  }));

  it('is deterministic within a process (twice, fresh provider)', () => {
    const again = rebellionRules.createRulesContextProvider(loadRawKnowledgeBase());
    for (const { input: i, result } of actual) {
      expect(provider.selectRules(i)).toEqual(result);
      expect(again.selectRules(i)).toEqual(result);
    }
  });

  it('equals the stored golden byte for byte (text, ruleIds, truncated, rulesVersion)', () => {
    const path = repoPath(GOLDEN_PATH);
    if (UPDATE_GOLDEN) writeFileSync(path, `${JSON.stringify(actual, null, 2)}\n`);
    expect(existsSync(path), `${GOLDEN_PATH} missing — UPDATE_RULES_SELECTION_GOLDEN=1`).toBe(true);
    const golden = JSON.parse(readFileSync(path, 'utf8')) as typeof actual;
    expect(golden.length).toBe(6);
    golden.forEach((g, i) => {
      expect(g.input).toEqual(actual[i]?.input);
      expect(g.result.text).toBe(actual[i]?.result.text);
      expect(g.result.ruleIds).toEqual(actual[i]?.result.ruleIds);
      expect(g.result.truncated).toBe(actual[i]?.result.truncated);
      expect(g.result.rulesVersion).toBe(actual[i]?.result.rulesVersion);
    });
  });
});
