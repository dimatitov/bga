/** SWR-004 setup input (TC-U-03..TC-U-12): schema, defaults, availability, derived settings. */
import { describe, expect, it } from 'vitest';
import { parseRebellionSetup } from '../../src/rules';
import {
  REBELLION_SETUP_DEFAULTS,
  RebellionSetupInputSchema,
  SUPPORTED_GAME_MODES,
  SUPPORTED_RULESETS,
  isSupportedGameModeFor,
  opponentOf,
  settingsFromSetupInput,
  unsupportedSetupFields,
  type RebellionSetupInput,
} from '../../src/schema';
import { FactionV1Schema } from '../../src/server/legacy-v1';

/** The SWR-003 faction id (taken from the frozen v1 schema): never accepted as current input. */
const LEGACY_FACTION = FactionV1Schema.options.find((f) => f !== 'empire')!;

const BASE = { ruleset: 'base', gameMode: 'digital' } as const;

function issuePaths(input: unknown): unknown[] {
  const parsed = RebellionSetupInputSchema.safeParse(input);
  expect(parsed.success).toBe(false);
  return parsed.error?.issues.map((i) => i.path) ?? [];
}

describe('REBELLION_SETUP_DEFAULTS (TC-U-03, AC-02)', () => {
  it('is exactly the PO defaults, frozen, and a valid input', () => {
    expect(REBELLION_SETUP_DEFAULTS).toEqual({
      playerFaction: 'rebels',
      opponentType: 'ai',
      aiDifficulty: 'normal',
      ruleset: 'base',
      gameMode: 'digital',
    });
    expect(Object.isFrozen(REBELLION_SETUP_DEFAULTS)).toBe(true);
    expect(() => {
      (REBELLION_SETUP_DEFAULTS as { playerFaction: string }).playerFaction = 'empire';
    }).toThrow(TypeError);
    expect(RebellionSetupInputSchema.parse(REBELLION_SETUP_DEFAULTS)).toEqual(
      REBELLION_SETUP_DEFAULTS,
    );
    expect(parseRebellionSetup(REBELLION_SETUP_DEFAULTS).ok).toBe(true);
  });

  it('supported lists: only base; digital + physical_companion (SWR-010, frozen)', () => {
    expect(SUPPORTED_RULESETS).toEqual(['base']);
    expect(SUPPORTED_GAME_MODES).toEqual(['digital', 'physical_companion']);
    expect(Object.isFrozen(SUPPORTED_RULESETS)).toBe(true);
    expect(Object.isFrozen(SUPPORTED_GAME_MODES)).toBe(true);
  });
});

describe('parseRebellionSetup — valid input (TC-U-04..06)', () => {
  for (const playerFaction of ['rebels', 'empire'] as const) {
    for (const aiDifficulty of ['easy', 'normal', 'hard'] as const) {
      it(`TC-U-04: ${playerFaction} vs AI ${aiDifficulty}`, () => {
        expect(
          parseRebellionSetup({ playerFaction, opponentType: 'ai', aiDifficulty, ...BASE }),
        ).toEqual({
          ok: true,
          value: {
            playerFaction,
            opponentFaction: opponentOf(playerFaction),
            opponentType: 'ai',
            aiDifficulty,
            ...BASE,
          },
        });
      });
    }
  }

  it('TC-U-05: AI without aiDifficulty → normal', () => {
    expect(parseRebellionSetup({ playerFaction: 'rebels', opponentType: 'ai', ...BASE })).toEqual({
      ok: true,
      value: {
        playerFaction: 'rebels',
        opponentFaction: 'empire',
        opponentType: 'ai',
        aiDifficulty: 'normal',
        ...BASE,
      },
    });
  });

  it('TC-U-06: human without difficulty or with null → aiDifficulty null, opponent derived', () => {
    const inputs: RebellionSetupInput[] = [
      { playerFaction: 'empire', opponentType: 'human', ...BASE },
      { playerFaction: 'empire', opponentType: 'human', aiDifficulty: null, ...BASE },
    ];
    for (const input of inputs) {
      expect(parseRebellionSetup(input)).toEqual({
        ok: true,
        value: {
          playerFaction: 'empire',
          opponentFaction: 'rebels',
          opponentType: 'human',
          aiDifficulty: null,
          ...BASE,
        },
      });
      expect(settingsFromSetupInput(input).aiDifficulty).toBeNull();
    }
  });
});

describe('parseRebellionSetup — invalid input → kind invalid (400)', () => {
  it.each(['easy', 'normal'] as const)(
    'TC-U-07: human + aiDifficulty %s → issue at aiDifficulty',
    (aiDifficulty) => {
      const input = { playerFaction: 'empire', opponentType: 'human', aiDifficulty, ...BASE };
      expect(issuePaths(input)).toEqual([['aiDifficulty']]);
      const result = parseRebellionSetup(input);
      expect(result).toMatchObject({ ok: false, kind: 'invalid' });
      if (!result.ok && result.kind === 'invalid') {
        expect(result.issues.map((i) => i.path)).toEqual([['aiDifficulty']]);
      }
    },
  );

  it('TC-U-08 (Q-6): AI + aiDifficulty null → issue at aiDifficulty', () => {
    expect(
      issuePaths({ playerFaction: 'rebels', opponentType: 'ai', aiDifficulty: null, ...BASE }),
    ).toEqual([['aiDifficulty']]);
  });

  it.each([
    ['playerFaction', LEGACY_FACTION],
    ['opponentType', 'robot'],
    ['aiDifficulty', 'insane'],
    ['ruleset', 'expansion'],
    ['gameMode', 'vr'],
  ])('TC-U-09: unknown %s = %j → issue at that field', (field, value) => {
    const input = { ...REBELLION_SETUP_DEFAULTS, [field]: value };
    expect(issuePaths(input)).toContainEqual([field]);
    expect(parseRebellionSetup(input)).toMatchObject({ ok: false, kind: 'invalid' });
  });

  it.each([
    ['aiFaction', 'empire'],
    ['opponentFaction', 'empire'],
    ['opponentFaction', 'rebels'],
    ['humanFaction', 'rebels'],
    ['opponent', { kind: 'ai' }],
    ['schemaVersion', 2],
  ])('TC-U-10: extra field %s = %j → unrecognized_keys', (field, value) => {
    const parsed = RebellionSetupInputSchema.safeParse({
      ...REBELLION_SETUP_DEFAULTS,
      [field]: value,
    });
    expect(parsed.success).toBe(false);
    expect(parsed.error?.issues[0]).toMatchObject({ code: 'unrecognized_keys', keys: [field] });
  });

  it.each(['playerFaction', 'opponentType', 'ruleset', 'gameMode'] as const)(
    'TC-U-11 (Q-7): missing %s → issue at that field',
    (field) => {
      const { [field]: _omitted, ...input } = REBELLION_SETUP_DEFAULTS;
      expect(issuePaths(input)).toEqual([[field]]);
    },
  );

  it.each([undefined, null, 'rebels', [], 42])('non-object %j → invalid, never throws', (input) => {
    expect(parseRebellionSetup(input)).toMatchObject({ ok: false, kind: 'invalid' });
  });
});

describe('parseRebellionSetup — not available yet → kind unsupported (TC-U-12, Q-8, AM-BE-8; SWR-010 AC-22)', () => {
  it('the schema accepts the values; availability rejects them', () => {
    const rote = { ...REBELLION_SETUP_DEFAULTS, ruleset: 'rise-of-the-empire' } as const;
    const physicalHuman = {
      ...REBELLION_SETUP_DEFAULTS,
      opponentType: 'human',
      aiDifficulty: null,
      gameMode: 'physical_companion',
    } as const;
    const both = { ...physicalHuman, ruleset: 'rise-of-the-empire' } as const;
    for (const input of [rote, physicalHuman, both]) {
      expect(RebellionSetupInputSchema.safeParse(input).success).toBe(true);
    }
    expect(unsupportedSetupFields(REBELLION_SETUP_DEFAULTS)).toEqual([]);
    expect(parseRebellionSetup(rote)).toEqual({
      ok: false,
      kind: 'unsupported',
      messageKey: 'errors.rulesetUnavailable',
      details: { unsupported: ['ruleset'] },
    });
    expect(parseRebellionSetup(physicalHuman)).toEqual({
      ok: false,
      kind: 'unsupported',
      messageKey: 'errors.modeUnavailable',
      details: { unsupported: ['gameMode'] },
    });
    expect(parseRebellionSetup(both)).toEqual({
      ok: false,
      kind: 'unsupported',
      messageKey: 'errors.rulesetUnavailable',
      details: { unsupported: ['ruleset', 'gameMode'] },
    });
    // rise-of-the-empire stays unsupported in physical_companion vs AI too (D-8).
    expect(
      unsupportedSetupFields({ ...rote, gameMode: 'physical_companion', opponentType: 'ai' }),
    ).toEqual(['ruleset']);
  });

  it.each(['rebels', 'empire'] as const)(
    'physical_companion vs AI (%s) → supported settings (SWR-010 AC-22, TC-SET-04 unit part)',
    (playerFaction) => {
      const input = {
        ...REBELLION_SETUP_DEFAULTS,
        playerFaction,
        gameMode: 'physical_companion',
      } as const;
      expect(unsupportedSetupFields(input)).toEqual([]);
      expect(parseRebellionSetup(input)).toMatchObject({
        ok: true,
        value: { playerFaction, opponentType: 'ai', gameMode: 'physical_companion' },
      });
    },
  );

  it('isSupportedGameModeFor: physical_companion ⇒ AI opponent; digital for both', () => {
    expect(isSupportedGameModeFor('digital', 'ai')).toBe(true);
    expect(isSupportedGameModeFor('digital', 'human')).toBe(true);
    expect(isSupportedGameModeFor('physical_companion', 'ai')).toBe(true);
    expect(isSupportedGameModeFor('physical_companion', 'human')).toBe(false);
  });

  it('schema errors win over availability (400 before 422)', () => {
    expect(
      parseRebellionSetup({
        ...REBELLION_SETUP_DEFAULTS,
        ruleset: 'rise-of-the-empire',
        aiFaction: 'empire',
      }),
    ).toMatchObject({ ok: false, kind: 'invalid' });
    expect(
      parseRebellionSetup({
        ...REBELLION_SETUP_DEFAULTS,
        opponentType: 'human',
        gameMode: 'physical_companion',
      }),
    ).toMatchObject({ ok: false, kind: 'invalid' });
  });
});
