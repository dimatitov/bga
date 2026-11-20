// SWR-008 C-5 / R-2: `createKnowledgeBaseRulesProvider` on the tiny `star-forge` fixture (TC-SEL-04/05/07/08/09/11,
// TC-ST-02 mechanism, TC-CT-03/04 on the fixture, TC-FB-06 empty KB, QD-3, QD-4, QD-5).
import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { ZodError } from 'zod';
import {
  KnowledgeBaseConfigError,
  KnowledgeBaseParseError,
  KnowledgeBaseValidationError,
  RULES_CONTEXT_LIMITS,
  RULES_VERSION_PATTERN,
  RulesContextResultSchema,
  canonicalJson,
  createKnowledgeBaseRulesProvider,
  formatContextLine,
  knowledgeBaseRulesVersion,
  parseKnowledgeBase,
  type KbEntryInput,
  type KnowledgeBaseRulesOptions,
  type RulesSelectionInput,
} from '../../src/rules-kb';
import { fixtureInput, type FixtureInput } from './fixture';

const ENGINE = 'star-forge:impl.engine-scope';
const PHASE_ONLY = 'star-forge:turn.action-limit';

/** Adds a `rule` entry together with the coverage item the validator requires for it. */
function addRule(data: FixtureInput, entry: KbEntryInput): void {
  data.entries.push(entry);
  data.coverage.items.push({ ruleId: entry.id, status: 'not-applicable', note: 'Test data.' });
}

/** The fixture + a pinned engine-scope note (`ai: 'core'`, F-7) + a verified phase-only rule. */
function input(): FixtureInput {
  const base = fixtureInput();
  base.entries.push({
    id: ENGINE,
    kind: 'implementation-note',
    status: 'verified',
    product: 'core',
    category: 'combat',
    title: 'What the engine can do',
    text: 'The engine plays only building and turn order; combat is not implemented.',
    sources: [{ sourceId: 'SFR', page: 7, section: 'Combat' }],
    discrepancyIds: ['DISC-001'],
    ai: 'core',
  });
  addRule(base, {
    id: PHASE_ONLY,
    kind: 'rule',
    status: 'verified',
    product: 'core',
    category: 'turn',
    title: 'One action per turn',
    text: 'On a turn a player takes exactly one action.',
    sources: [{ sourceId: 'SFR', page: 3, section: 'Turn order' }],
    appliesTo: { phases: ['action'] },
  });
  return base;
}

const OPTIONS: KnowledgeBaseRulesOptions = {
  pinnedRuleIds: [ENGINE],
  tagRules: {
    'early-game': ['star-forge:setup.board'],
    review: ['star-forge:turn.pass-timing'],
    war: ['star-forge:combat.resolve'],
  },
};

const X: RulesSelectionInput = {
  actor: 'builders',
  phase: 'action',
  commandTypes: ['BUILD_FORGE'],
  tags: ['early-game'],
  maxChars: 6000,
};

const provider = createKnowledgeBaseRulesProvider(input(), OPTIONS);
const lineOf = (id: string) => {
  const entry = parseKnowledgeBase(input()).entries.find((e) => e.id === id);
  if (!entry) throw new Error(id);
  return formatContextLine(entry);
};

describe('selectRules: groups and filters (R-2)', () => {
  it('pinned → core → commands → phase → tags; id asc inside a group', () => {
    const r = provider.selectRules(X);
    expect(r.ruleIds).toEqual([
      ENGINE, // pinned
      'star-forge:turn.order', // core
      'star-forge:victory.score', // core
      'star-forge:build.place-forge', // commands
      'star-forge:build.place-forge-errata', // commands
      PHASE_ONLY, // phase (turn.order already taken; turn.pass-timing is needs-review)
      'star-forge:setup.board', // tags
    ]);
    expect(r.truncated).toBe(false);
    expect(r.text).toBe(r.ruleIds.map(lineOf).join('\n'));
    expect(r.rulesVersion).toBe(provider.rulesVersion);
    expect(RulesContextResultSchema.parse(r)).toEqual(r);
  });

  it('needs-review never enters, not via phase and not via a tag (QD-4); no "(unverified)" marker', () => {
    const r = provider.selectRules({ ...X, tags: ['early-game', 'review'] });
    expect(r.ruleIds).not.toContain('star-forge:turn.pass-timing');
    expect(r.text).not.toContain('(unverified)');
    expect(r).toEqual(provider.selectRules(X));
  });

  it('ai: none never enters, even when every selector matches it', () => {
    for (const commandTypes of [[], ['ATTACK'], ['ATTACK', 'BUILD_FORGE']]) {
      const r = provider.selectRules({ ...X, actor: 'raiders', commandTypes });
      expect(r.ruleIds).not.toContain('star-forge:combat.engine-gap');
    }
  });

  it('side filter applies to commands and tags, not to pinned', () => {
    const war = { ...X, commandTypes: ['ATTACK'], tags: ['war'] };
    expect(provider.selectRules({ ...war, actor: 'raiders' }).ruleIds).toContain(
      'star-forge:combat.resolve',
    );
    const builders = provider.selectRules({ ...war, actor: 'builders' });
    expect(builders.ruleIds).not.toContain('star-forge:combat.resolve');
    expect(builders.ruleIds[0]).toBe(ENGINE);
  });

  it('a tag adds entries only in the last group; unknown tags are ignored (TC-SEL-12)', () => {
    const without = provider.selectRules({ ...X, tags: [] });
    const withTag = provider.selectRules(X);
    expect(withTag.ruleIds.slice(0, -1)).toEqual(without.ruleIds);
    expect(withTag.ruleIds.at(-1)).toBe('star-forge:setup.board');
    expect(provider.selectRules({ ...X, tags: ['no-such-tag'] })).toEqual(without);
  });

  it('different phases / command types / sides give different selections', () => {
    const ids = (patch: Partial<RulesSelectionInput>) =>
      provider.selectRules({ ...X, tags: [], ...patch }).ruleIds.join(',');
    expect(ids({ phase: 'setup' })).not.toBe(ids({ phase: 'action' }));
    expect(ids({ commandTypes: [] })).not.toBe(ids({ commandTypes: ['BUILD_FORGE'] }));
    expect(ids({ actor: 'raiders', commandTypes: ['ATTACK'] })).not.toBe(
      ids({ actor: 'builders', commandTypes: ['ATTACK'] }),
    );
  });

  it('nothing but mandatory entries match (phase unknown, no types) → pinned + core only (TC-FB-06)', () => {
    const r = provider.selectRules({ ...X, phase: 'unknown', commandTypes: [], tags: [] });
    expect(r.ruleIds).toEqual([ENGINE, 'star-forge:turn.order', 'star-forge:victory.score']);
    const noCore = input();
    for (const e of noCore.entries) if (e.ai === 'core' && e.id !== ENGINE) e.ai = 'situational';
    const p = createKnowledgeBaseRulesProvider(noCore, OPTIONS);
    expect(p.selectRules({ ...X, phase: 'unknown', commandTypes: [], tags: [] }).ruleIds).toEqual([
      ENGINE,
    ]);
  });

  it('status beats the core priority: a core entry moved to needs-review disappears (TC-ST-02 mechanism)', () => {
    const data = input();
    const victory = data.entries.find((e) => e.id === 'star-forge:victory.score')!;
    victory.status = 'needs-review';
    const r = createKnowledgeBaseRulesProvider(data, OPTIONS).selectRules(X);
    expect(r.ruleIds).not.toContain('star-forge:victory.score');
    expect(provider.selectRules(X).ruleIds).toContain('star-forge:victory.score');
  });
});

describe('selectRules: size limit, whole lines (TC-SEL-07/08, QD-3)', () => {
  const full = provider.selectRules(X);
  const L = full.text.length;

  it('maxChars = L and L + 1 keep every line; L − 1 drops exactly the last whole line', () => {
    expect(provider.selectRules({ ...X, maxChars: L })).toEqual(full);
    expect(provider.selectRules({ ...X, maxChars: L + 1 })).toEqual(full);
    const cut = provider.selectRules({ ...X, maxChars: L - 1 });
    expect(cut.truncated).toBe(true);
    expect(cut.ruleIds).toEqual(full.ruleIds.slice(0, -1));
    expect(cut.text).toBe(full.text.split('\n').slice(0, -1).join('\n'));
  });

  it('every limit from requiredChars to L gives a prefix of the full list, never a partial line', () => {
    const fullLines = full.text.split('\n');
    for (let maxChars = provider.requiredChars; maxChars <= L; maxChars += 1) {
      const r = provider.selectRules({ ...X, maxChars });
      expect(r.text.length).toBeLessThanOrEqual(maxChars);
      expect(r.ruleIds).toEqual(full.ruleIds.slice(0, r.ruleIds.length));
      expect(r.text).toBe(fullLines.slice(0, r.ruleIds.length).join('\n'));
      expect(r.truncated).toBe(r.ruleIds.length < full.ruleIds.length);
      expect(r.ruleIds[0]).toBe(ENGINE);
    }
  });

  it('requiredChars = pinned lines joined by \\n; maxChars = requiredChars → pinned only', () => {
    expect(provider.requiredChars).toBe(lineOf(ENGINE).length);
    const two = createKnowledgeBaseRulesProvider(input(), {
      pinnedRuleIds: [ENGINE, 'star-forge:setup.board'],
    });
    expect(two.requiredChars).toBe(`${lineOf(ENGINE)}\n${lineOf('star-forge:setup.board')}`.length);
    expect(two.selectRules({ ...X, maxChars: two.requiredChars })).toMatchObject({
      ruleIds: [ENGINE, 'star-forge:setup.board'],
      truncated: true,
    });
    expect(createKnowledgeBaseRulesProvider(input(), { pinnedRuleIds: [] }).requiredChars).toBe(0);
    expect(provider.selectRules({ ...X, maxChars: provider.requiredChars })).toMatchObject({
      ruleIds: [ENGINE],
      truncated: true,
    });
  });

  it('maxChars < requiredChars → RangeError (QD-3), not an empty block', () => {
    expect(() => provider.selectRules({ ...X, maxChars: provider.requiredChars - 1 })).toThrow(
      RangeError,
    );
    expect(() => provider.selectRules({ ...X, maxChars: 1 })).toThrow(RangeError);
  });

  it.each([0, -1, 1.5, Number.NaN, RULES_CONTEXT_LIMITS.maxCharsMax + 1])(
    'maxChars %s → ZodError (TC-SEL-09)',
    (maxChars) => {
      expect(() => provider.selectRules({ ...X, maxChars })).toThrow(ZodError);
    },
  );

  it('never more than maxRuleIds lines (schema guard); truncated', () => {
    const data = input();
    for (let i = 0; i < 70; i += 1) {
      const n = String(i).padStart(2, '0');
      addRule(data, {
        id: `star-forge:victory.extra-${n}`,
        kind: 'rule',
        status: 'verified',
        product: 'core',
        category: 'victory',
        title: `Extra ${n}`,
        text: 'Short.',
        sources: [{ sourceId: 'SFR', page: 10, section: 'Victory' }],
        ai: 'core',
      });
    }
    const r = createKnowledgeBaseRulesProvider(data, OPTIONS).selectRules({
      ...X,
      maxChars: RULES_CONTEXT_LIMITS.maxCharsMax,
    });
    expect(r.ruleIds).toHaveLength(RULES_CONTEXT_LIMITS.maxRuleIds);
    expect(r.text.split('\n')).toHaveLength(RULES_CONTEXT_LIMITS.maxRuleIds);
    expect(r.truncated).toBe(true);
    expect(r.ruleIds[0]).toBe(ENGINE);
  });
});

describe('selectRules: input contract (ZodError = program error)', () => {
  it.each<[string, Partial<RulesSelectionInput> & Record<string, unknown>]>([
    ['unsorted commandTypes', { commandTypes: ['PASS', 'BUILD_FORGE'] }],
    ['duplicate commandTypes', { commandTypes: ['PASS', 'PASS'] }],
    ['duplicate tags', { tags: ['war', 'war'] }],
    ['bad tag', { tags: ['Bad_Tag'] }],
    ['empty actor', { actor: '' }],
    ['control char in phase', { phase: 'a\tb' }],
    ['state smuggled in', { state: { base: 'x' } }],
    ['candidates smuggled in', { candidates: [] }],
  ])('%s', (_name, patch) => {
    expect(() => provider.selectRules({ ...X, ...patch } as RulesSelectionInput)).toThrow(ZodError);
  });
});

describe('determinism (TC-SEL-04, TC-SEL-05)', () => {
  it('same input → same bytes; a second provider from the same data agrees', () => {
    const again = createKnowledgeBaseRulesProvider(input(), OPTIONS);
    expect(provider.selectRules(X)).toEqual(provider.selectRules(X));
    expect(again.selectRules(X)).toEqual(provider.selectRules(X));
    expect(again.rulesVersion).toBe(provider.rulesVersion);
  });

  it('order of entries in the source changes nothing', () => {
    const shuffled = input();
    shuffled.entries.reverse();
    const p = createKnowledgeBaseRulesProvider(shuffled, OPTIONS);
    expect(p.selectRules(X)).toEqual(provider.selectRules(X));
    expect(p.rulesVersion).toBe(provider.rulesVersion);
  });

  it('a selection result never aliases provider state (mutation-safe)', () => {
    const a = provider.selectRules(X);
    a.ruleIds.push('x');
    expect(provider.selectRules(X).ruleIds).not.toContain('x');
  });
});

describe('rulesVersion (QD-5, TC-CT-03/04 on the fixture)', () => {
  it('has the pattern <gameId>@<formatVersion>:<12 hex> and equals sha256 of the canonical sorted entries', () => {
    expect(provider.rulesVersion).toMatch(RULES_VERSION_PATTERN);
    const kb = parseKnowledgeBase(input());
    const sorted = [...kb.entries].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
    const hash = createHash('sha256')
      .update(`[${sorted.map((e) => canonicalJson(e)).join(',')}]`, 'utf8')
      .digest('hex');
    expect(provider.rulesVersion).toBe(`star-forge@1:${hash.slice(0, 12)}`);
    expect(knowledgeBaseRulesVersion(kb)).toBe(provider.rulesVersion);
  });

  it('changes with one character of one text and with the status of one entry', () => {
    const text = input();
    text.entries[0]!.text = `${text.entries[0]!.text.slice(0, -1)}!`;
    const status = input();
    status.entries.find((e) => e.id === 'star-forge:setup.board')!.status = 'needs-review';
    const v = (data: FixtureInput) => createKnowledgeBaseRulesProvider(data, OPTIONS).rulesVersion;
    expect(v(text)).not.toBe(provider.rulesVersion);
    expect(v(status)).not.toBe(provider.rulesVersion);
    expect(v(text)).not.toBe(v(status));
  });

  it('ignores key order, explicit defaults, coverage and discrepancies (they never reach an AI)', () => {
    const data = input();
    const reordered = data.entries.map((e) => {
      const keys = Object.keys(e).reverse();
      return Object.fromEntries(keys.map((k) => [k, e[k as keyof KbEntryInput]])) as KbEntryInput;
    });
    data.entries = reordered;
    const explicit = data.entries.find((e) => e.id === 'star-forge:setup.board')!;
    explicit.ai = 'situational'; // the default
    data.coverage.items[0]!.note = 'changed note';
    data.discrepancies[1]!.followUp = 'changed follow-up';
    expect(createKnowledgeBaseRulesProvider(data, OPTIONS).rulesVersion).toBe(
      provider.rulesVersion,
    );
  });
});

describe('fail fast at creation', () => {
  it('broken shape → KnowledgeBaseParseError', () => {
    expect(() =>
      createKnowledgeBaseRulesProvider({ ...input(), entries: 'nope' }, OPTIONS),
    ).toThrow(KnowledgeBaseParseError);
  });

  it('duplicate id / unknown source → KnowledgeBaseValidationError with issues', () => {
    const dup = input();
    dup.entries.push({ ...dup.entries[0]! });
    const err = (() => {
      try {
        createKnowledgeBaseRulesProvider(dup, OPTIONS);
      } catch (e) {
        return e;
      }
      return null;
    })();
    expect(err).toBeInstanceOf(KnowledgeBaseValidationError);
    expect((err as KnowledgeBaseValidationError).issues.length).toBeGreaterThan(0);
    expect((err as Error).name).toBe('KnowledgeBaseValidationError');

    const source = input();
    source.entries[0]!.sources = [{ sourceId: 'NOPE', page: 1, section: 'x' }];
    expect(() => createKnowledgeBaseRulesProvider(source, OPTIONS)).toThrow(
      KnowledgeBaseValidationError,
    );
  });

  it.each<[string, KnowledgeBaseRulesOptions, RegExp]>([
    [
      'pinned needs-review (QD-4)',
      { pinnedRuleIds: ['star-forge:turn.pass-timing'] },
      /not verified/,
    ],
    ['pinned missing', { pinnedRuleIds: ['star-forge:no.such'] }, /does not exist/],
    ['pinned ai none', { pinnedRuleIds: ['star-forge:combat.engine-gap'] }, /ai "none"/],
    ['pinned duplicate', { pinnedRuleIds: [ENGINE, ENGINE] }, /duplicates/],
    ['bad tag key', { pinnedRuleIds: [ENGINE], tagRules: { Bad_Tag: [ENGINE] } }, /tag pattern/],
    [
      'tag id missing',
      { pinnedRuleIds: [ENGINE], tagRules: { war: ['star-forge:no.such'] } },
      /does not exist/,
    ],
  ])('%s → KnowledgeBaseConfigError', (_name, options, message) => {
    let err: unknown = null;
    try {
      createKnowledgeBaseRulesProvider(input(), options);
    } catch (e) {
      err = e;
    }
    expect(err).toBeInstanceOf(KnowledgeBaseConfigError);
    expect((err as KnowledgeBaseConfigError).problems.join('; ')).toMatch(message);
  });

  it('reports all config problems at once', () => {
    let err: unknown = null;
    try {
      createKnowledgeBaseRulesProvider(input(), {
        pinnedRuleIds: ['star-forge:turn.pass-timing', 'star-forge:no.such'],
        tagRules: { war: ['star-forge:no.other'] },
      });
    } catch (e) {
      err = e;
    }
    expect((err as KnowledgeBaseConfigError).problems).toHaveLength(3);
  });

  it('selectable entries must satisfy the result contract (control chars, id length)', () => {
    const ctl = input();
    ctl.entries[0]!.text = 'Bell \u0007 here.';
    expect(() => createKnowledgeBaseRulesProvider(ctl, OPTIONS)).toThrow(/control characters/);
    const long = input();
    addRule(long, {
      ...long.entries[0]!,
      id: `star-forge:setup.${'a'.repeat(120)}`,
    });
    expect(() => createKnowledgeBaseRulesProvider(long, OPTIONS)).toThrow(/longer than 128/);
  });

  it('pinned lines longer than maxCharsMax → KnowledgeBaseConfigError', () => {
    const data = input();
    const pinned: string[] = [];
    for (let i = 0; i < 25; i += 1) {
      const id = `star-forge:victory.long-${String(i).padStart(2, '0')}`;
      pinned.push(id);
      addRule(data, {
        id,
        kind: 'rule',
        status: 'verified',
        product: 'core',
        category: 'victory',
        title: 'Long',
        text: 'word '.repeat(110).trim(),
        sources: [{ sourceId: 'SFR', page: 10, section: 'Victory' }],
      });
    }
    expect(() => createKnowledgeBaseRulesProvider(data, { pinnedRuleIds: pinned })).toThrow(
      KnowledgeBaseConfigError,
    );
  });
});

describe('empty knowledge base (TC-FB-06)', () => {
  it('no entries → empty text, no ids, not truncated; valid result', () => {
    const data = input();
    data.entries = [];
    data.manifest.sourceSections = [];
    data.coverage.items = [];
    data.discrepancies = [];
    const p = createKnowledgeBaseRulesProvider(data, { pinnedRuleIds: [] });
    const r = p.selectRules(X);
    expect(r).toEqual({ text: '', ruleIds: [], truncated: false, rulesVersion: p.rulesVersion });
    expect(p.requiredChars).toBe(0);
    expect(p.rulesVersion).toMatch(/^star-forge@1:[0-9a-f]{12}$/);
  });
});
