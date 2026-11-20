// SWR-008 C-1 / C-2: game-agnostic Rules Context contract of `@bga/platform` (TC-CT-01, TC-CT-08, TC-SEL-05,
// TC-SEL-11, R-1 / QD-7: the selection input is built only from public fields of the decision point).
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { ZodError } from 'zod';
import {
  AUTOMATION_LIMITS,
  AutomationDecisionPointSchema,
  RULES_CONTEXT_LIMITS,
  RULES_TAG_PATTERN,
  RULES_VERSION_PATTERN,
  RulesContextResultSchema,
  RulesSelectionInputSchema,
  defineServerGameModule,
  rulesSelectionInputOf,
  type AutomationDecisionPoint,
  type GameRulesSupport,
  type KnowledgeBaseSource,
  type RulesContextProvider,
  type RulesContextResult,
  type RulesSelectionInput,
  type ServerGameModule,
} from '../src';
import {
  createKnowledgeBaseRulesProvider,
  type KnowledgeBaseInput,
  type RulesContextProvider as KbRulesContextProvider,
} from '../src/rules-kb';
import { fixtureInput } from './rules-kb/fixture';

const SRC = fileURLToPath(new URL('../src/', import.meta.url));
const read = (rel: string) => readFileSync(join(SRC, rel), 'utf8');

const POINT: AutomationDecisionPoint = {
  actor: 'builders',
  phase: 'action',
  objective: 'Build five forges.',
  situation: 'Round 1.\nYou hold sector-3.',
  candidates: [
    { id: 'c1', type: 'BUILD_FORGE', target: 'sector-3', summary: 'Build a forge in sector 3.' },
    { id: 'c2', type: 'PASS', summary: 'Pass.' },
  ],
  fallbackCandidateId: 'c1',
  policyId: 'forge-bot-v1:normal',
  rulesQuery: { commandTypes: ['PASS', 'BUILD_FORGE'], tags: ['opponent-passed', 'early-game'] },
};

const INPUT: RulesSelectionInput = {
  actor: 'builders',
  phase: 'action',
  commandTypes: ['BUILD_FORGE', 'PASS'],
  tags: ['early-game', 'opponent-passed'],
  maxChars: 6000,
};

const RESULT: RulesContextResult = {
  text: '[g:a.b] A: text. (R p.1)\n[g:c.d] C: more. (R p.2)',
  ruleIds: ['g:a.b', 'g:c.d'],
  truncated: false,
  rulesVersion: 'star-forge@1:0123456789ab',
};

describe('exports of @bga/platform (TC-CT-01)', () => {
  it('values: schemas, limits, patterns, rulesSelectionInputOf', () => {
    expect(typeof RulesSelectionInputSchema.safeParse).toBe('function');
    expect(typeof RulesContextResultSchema.safeParse).toBe('function');
    expect(typeof rulesSelectionInputOf).toBe('function');
    expect(RULES_CONTEXT_LIMITS).toEqual({
      maxCharsMin: 1000,
      maxCharsMax: 12_000,
      maxCharsDefault: 6000,
      ruleIdMax: 128,
      maxRuleIds: 64,
      commandTypesMax: 16,
      tagsMax: 8,
    });
    expect(RULES_TAG_PATTERN.source).toBe('^[a-z0-9][a-z0-9-]{0,31}$');
    expect(RULES_VERSION_PATTERN.source).toBe('^[a-z0-9]+(?:-[a-z0-9]+)*@\\d+:[0-9a-f]{12}$');
  });

  it('types: the rules-kb provider IS a platform RulesContextProvider; sources are interchangeable', () => {
    const fromKb: KbRulesContextProvider = createKnowledgeBaseRulesProvider(fixtureInput(), {
      pinnedRuleIds: [],
    });
    const asPlatform: RulesContextProvider = fromKb;
    const source: KnowledgeBaseSource = fixtureInput();
    const asInput: KnowledgeBaseInput = source;
    const back: KnowledgeBaseSource = asInput;
    expect(asPlatform.rulesVersion).toMatch(RULES_VERSION_PATTERN);
    expect(back).toBe(source);
  });

  it('ServerGameModule.rules is optional (C-2) and typed as GameRulesSupport', () => {
    type Optional = undefined extends ServerGameModule['rules'] ? true : false;
    type Typed = NonNullable<ServerGameModule['rules']> extends GameRulesSupport ? true : false;
    const optional: Optional = true;
    const typed: Typed = true;
    expect([optional, typed]).toEqual([true, true]);
  });
});

describe('game-agnostic, no network / RAG (TC-CT-01, TC-CT-08)', () => {
  const kbFiles = readdirSync(join(SRC, 'rules-kb'))
    .filter((f) => f.endsWith('.ts'))
    .map((f) => `rules-kb/${f}`);
  const files = ['rules-context.ts', 'ai-diagnostics.ts', ...kbFiles];

  it.each(files)('%s: no game words', (f) => {
    expect(read(f)).not.toMatch(/rebellion|rebelBase|empire|rebels/i);
  });

  it.each(['rules-context.ts', ...kbFiles])('%s: no fetch / openai / vector / embedding', (f) => {
    expect(read(f)).not.toMatch(/fetch|openai|vector|embedding/i);
  });

  it('rules-context.ts imports only zod-free type/relative modules, no node:*', () => {
    const text = read('rules-context.ts');
    expect(text).not.toMatch(/node:/);
    const specifiers = [...text.matchAll(/\bfrom\s+'([^']+)'/g)].map((m) => m[1]);
    expect(specifiers.every((s) => s === './automation' || s === './rules-kb/context')).toBe(true);
  });
});

describe('RulesSelectionInputSchema (C-1)', () => {
  const ok = (patch: Record<string, unknown>) =>
    RulesSelectionInputSchema.safeParse({ ...INPUT, ...patch }).success;

  it('accepts a valid input; lists may be empty', () => {
    expect(RulesSelectionInputSchema.parse(INPUT)).toEqual(INPUT);
    expect(ok({ commandTypes: [], tags: [] })).toBe(true);
  });

  it('lists must be sorted ascending and unique', () => {
    expect(ok({ commandTypes: ['PASS', 'BUILD_FORGE'] })).toBe(false);
    expect(ok({ commandTypes: ['PASS', 'PASS'] })).toBe(false);
    expect(ok({ tags: ['opponent-passed', 'early-game'] })).toBe(false);
    expect(ok({ tags: ['a', 'a'] })).toBe(false);
    // locale-independent: upper-case letters sort before lower-case ones
    expect(ok({ commandTypes: ['Z', 'a'] })).toBe(true);
    expect(ok({ commandTypes: ['a', 'Z'] })).toBe(false);
  });

  it('limits: actor / phase / type ≤ 64 (as AUTOMATION_LIMITS), ≤ 16 types, ≤ 8 tags, maxChars 1..12000', () => {
    expect([
      AUTOMATION_LIMITS.actorMax,
      AUTOMATION_LIMITS.phaseMax,
      AUTOMATION_LIMITS.typeMax,
    ]).toEqual([64, 64, 64]);
    expect(ok({ actor: 'a'.repeat(64), phase: 'p'.repeat(64) })).toBe(true);
    expect(ok({ actor: 'a'.repeat(65) })).toBe(false);
    expect(ok({ phase: 'p'.repeat(65) })).toBe(false);
    expect(ok({ commandTypes: ['T'.repeat(64)] })).toBe(true);
    expect(ok({ commandTypes: ['T'.repeat(65)] })).toBe(false);
    const types = (n: number) =>
      Array.from({ length: n }, (_, i) => `T${String(i).padStart(2, '0')}`);
    const tags = (n: number) => Array.from({ length: n }, (_, i) => `t${i}`);
    expect(ok({ commandTypes: types(16) })).toBe(true);
    expect(ok({ commandTypes: types(17) })).toBe(false);
    expect(ok({ tags: tags(8) })).toBe(true);
    expect(ok({ tags: tags(9) })).toBe(false);
    for (const maxChars of [1, 6000, 12_000]) expect(ok({ maxChars })).toBe(true);
    for (const maxChars of [0, -1, 1.5, Number.NaN, 12_001, '6000'])
      expect(ok({ maxChars })).toBe(false);
  });

  it('texts non-empty, no control characters; tags match the pattern', () => {
    expect(ok({ actor: '' })).toBe(false);
    expect(ok({ phase: 'a\tb' })).toBe(false);
    expect(ok({ commandTypes: ['A\u0000'] })).toBe(false);
    expect(ok({ tags: ['Upper'] })).toBe(false);
    expect(ok({ tags: ['-lead'] })).toBe(false);
  });

  it('strict: nothing else may enter the selection (R-1)', () => {
    for (const leak of [
      'state',
      'candidates',
      'situation',
      'objective',
      'sessionId',
      'budgetKey',
    ]) {
      expect(ok({ [leak]: 'x' })).toBe(false);
    }
  });
});

describe('RulesContextResultSchema (C-1)', () => {
  const ok = (patch: Record<string, unknown>) =>
    RulesContextResultSchema.safeParse({ ...RESULT, ...patch }).success;

  it('accepts a consistent result and the empty result', () => {
    expect(RulesContextResultSchema.parse(RESULT)).toEqual(RESULT);
    expect(ok({ text: '', ruleIds: [], truncated: true })).toBe(true);
  });

  it('rejects text / ruleIds out of sync', () => {
    expect(ok({ ruleIds: ['g:a.b'] })).toBe(false); // 2 lines, 1 id
    expect(ok({ ruleIds: ['g:c.d', 'g:a.b'] })).toBe(false); // wrong order
    expect(ok({ ruleIds: ['g:a.b', 'g:x.y'] })).toBe(false); // line 2 has another id
    expect(ok({ text: '', ruleIds: ['g:a.b'] })).toBe(false);
    expect(ok({ text: '[g:a.b] A.', ruleIds: [] })).toBe(false);
    expect(ok({ text: '[g:a.b]A: no space', ruleIds: ['g:a.b'] })).toBe(false);
    expect(ok({ text: '[g:a.b] A.\n[g:a.b] A.', ruleIds: ['g:a.b', 'g:a.b'] })).toBe(false);
  });

  it('limits: text ≤ 12000, ≤ 64 ids of ≤ 128 chars, no control characters except \\n', () => {
    const ids = (n: number) => Array.from({ length: n }, (_, i) => `g:r.n${i}`);
    const textOf = (list: string[]) => list.map((id) => `[${id}] x`).join('\n');
    expect(ok({ ruleIds: ids(64), text: textOf(ids(64)) })).toBe(true);
    expect(ok({ ruleIds: ids(65), text: textOf(ids(65)) })).toBe(false);
    const longId = `g:${'a'.repeat(126)}`;
    expect(ok({ ruleIds: [longId], text: `[${longId}] x` })).toBe(true);
    expect(ok({ ruleIds: [`${longId}b`], text: `[${longId}b] x` })).toBe(false);
    const big = `[g:a.b] ${'x'.repeat(12_000 - 8)}`;
    expect(big.length).toBe(12_000);
    expect(ok({ ruleIds: ['g:a.b'], text: big })).toBe(true);
    expect(ok({ ruleIds: ['g:a.b'], text: `${big}x` })).toBe(false);
    expect(ok({ ruleIds: ['g:a.b'], text: '[g:a.b] tab\there' })).toBe(false);
  });

  it('rulesVersion: <gameId>@<formatVersion>:<12 hex> (QD-5)', () => {
    for (const v of ['star-forge@1:0123456789ab', 'g@12:abcdefabcdef']) {
      expect(ok({ rulesVersion: v })).toBe(true);
    }
    for (const v of [
      '',
      'star-forge@1:0123456789AB',
      'star-forge@1:0123456789a',
      'Star@1:0123456789ab',
      'g:0123456789ab',
      'g@x:0123456789ab',
    ]) {
      expect(ok({ rulesVersion: v })).toBe(false);
    }
  });

  it('strict', () => {
    expect(ok({ prompt: 'x' })).toBe(false);
  });
});

describe('rulesSelectionInputOf (R-1, QD-7)', () => {
  it('builds the input from actor, phase and rulesQuery (sorted)', () => {
    expect(rulesSelectionInputOf(POINT, 6000)).toEqual(INPUT);
    expect(RulesSelectionInputSchema.parse(rulesSelectionInputOf(POINT, 6000))).toEqual(INPUT);
  });

  it('reads ONLY actor, phase and rulesQuery of the point', () => {
    const read = new Set<string>();
    const spy = new Proxy(POINT, {
      get(target, key, receiver) {
        if (typeof key === 'string') read.add(key);
        return Reflect.get(target, key, receiver) as unknown;
      },
    });
    rulesSelectionInputOf(spy, 6000);
    expect([...read].sort()).toEqual(['actor', 'phase', 'rulesQuery']);
  });

  it('different candidates / situation / objective / fallback / policy → the same input', () => {
    const other: AutomationDecisionPoint = {
      ...POINT,
      objective: 'Something else.',
      situation: 'Secret: my station is in sector-9.',
      candidates: [{ id: 'z9', type: 'ATTACK', target: 'sector-9', summary: 'Attack sector 9.' }],
      fallbackCandidateId: 'z9',
      policyId: 'other-bot-v2:hard',
    };
    expect(AutomationDecisionPointSchema.safeParse(other).success).toBe(true);
    expect(rulesSelectionInputOf(other, 6000)).toEqual(rulesSelectionInputOf(POINT, 6000));
  });

  it('absent rulesQuery → no types, no tags (phase + side only)', () => {
    const { rulesQuery: _q, ...legacy } = POINT;
    expect(rulesSelectionInputOf(legacy, 4000)).toEqual({
      actor: 'builders',
      phase: 'action',
      commandTypes: [],
      tags: [],
      maxChars: 4000,
    });
  });

  it('order and repeats of the query do not matter (TC-SEL-05)', () => {
    const shuffled = {
      ...POINT,
      rulesQuery: {
        commandTypes: ['PASS', 'BUILD_FORGE', 'PASS'],
        tags: ['opponent-passed', 'early-game', 'early-game'],
      },
    };
    expect(rulesSelectionInputOf(shuffled, 6000)).toEqual(INPUT);
  });

  it('invalid maxChars → ZodError (program error)', () => {
    for (const maxChars of [0, 1.5, 12_001]) {
      expect(() => rulesSelectionInputOf(POINT, maxChars)).toThrow(ZodError);
    }
  });

  it('end to end with a game rules support built from the fixture knowledge base', () => {
    const support: GameRulesSupport = {
      knowledgeBaseDir: 'packages/games/star-forge/knowledge',
      createRulesContextProvider: (source) =>
        createKnowledgeBaseRulesProvider(source, { pinnedRuleIds: ['star-forge:victory.score'] }),
    };
    const provider = support.createRulesContextProvider(fixtureInput());
    const point = { ...POINT, rulesQuery: { commandTypes: ['BUILD_FORGE'], tags: [] } };
    const result = provider.selectRules(rulesSelectionInputOf(point, 6000));
    expect(result.ruleIds).toEqual([
      'star-forge:victory.score',
      'star-forge:turn.order',
      'star-forge:build.place-forge',
      'star-forge:build.place-forge-errata',
    ]);
    expect(RulesContextResultSchema.parse(result)).toEqual(result);
  });
});

describe('the selection never accepts a state (TC-SEL-11, type level)', () => {
  const provider = createKnowledgeBaseRulesProvider(fixtureInput(), { pinnedRuleIds: [] });
  const fullState = { id: 's-1', version: 3, secretStation: 'sector-9', board: {} };

  it('does not compile (and throws at run time) with a state instead of the input', () => {
    // @ts-expect-error a game state is not a RulesSelectionInput
    expect(() => provider.selectRules(fullState)).toThrow(ZodError);
    // @ts-expect-error no extra field (e.g. a state) next to the input
    expect(() => provider.selectRules({ ...INPUT, state: fullState })).toThrow(ZodError);
    expect(() =>
      provider.selectRules({
        ...INPUT,
        // @ts-expect-error no hidden data field
        secretStation: 'sector-9',
      }),
    ).toThrow(ZodError);
    // @ts-expect-error rulesSelectionInputOf takes a decision point, not a state
    expect(() => rulesSelectionInputOf(fullState, 6000)).toThrow(ZodError);
  });

  it('the module with rules is assignable to the registry type', () => {
    const support: GameRulesSupport = {
      knowledgeBaseDir: '/abs/kb',
      createRulesContextProvider: () => provider,
    };
    const base = {
      definition: {
        id: 'toy',
        name: 'Toy',
        descriptionKey: 'toy.meta:description',
        status: 'available' as const,
        supportedPlayers: [1],
        supportsAI: true,
      },
      parseSetup: () => ({ ok: true as const, value: {} }),
      parseStoredSetup: () => ({}),
      initialStatus: () => 'active' as const,
      statusOf: () => 'active' as const,
      publicSettings: () => ({}),
      createInitialState: () => ({ state: {}, events: [] }),
      setupOf: () => ({}),
      parseState: (raw: unknown) => raw as object,
      version: () => 1,
      applyCommand: (state: object) => ({ ok: true as const, state, events: [] }),
      toPlayerView: () => ({}),
      toPlayerEvents: () => [],
      summarize: () => ({}),
    };
    const withRules: ServerGameModule = defineServerGameModule({ ...base, rules: support });
    const without: ServerGameModule = defineServerGameModule(base);
    expect(withRules.rules?.knowledgeBaseDir).toBe('/abs/kb');
    expect(without.rules).toBeUndefined();
  });
});
