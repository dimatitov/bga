import { describe, expect, it } from 'vitest';
import {
  FactionSchema,
  RebellionSettingsSchema,
  StoredRebellionSetupSchema,
  opponentOf,
  settingsOfStoredSetup,
  toStoredSetup,
} from '../../src/schema';
import { FactionV1Schema } from '../../src/server/legacy-v1';

/** The SWR-003 faction id (taken from the frozen v1 schema): never accepted as current input. */
const LEGACY_FACTION = FactionV1Schema.options.find((f) => f !== 'empire')!;

const REBELS_AI = {
  playerFaction: 'rebels',
  opponentFaction: 'empire',
  opponentType: 'ai',
  aiDifficulty: 'normal',
  ruleset: 'base',
  gameMode: 'digital',
} as const;

describe('factions (SWR-004)', () => {
  it('TC-U-01: ids are rebels and empire (spec order); opponentOf is an involution', () => {
    expect(FactionSchema.options).toEqual(['rebels', 'empire']);
    expect(opponentOf('rebels')).toBe('empire');
    expect(opponentOf('empire')).toBe('rebels');
    for (const f of FactionSchema.options) expect(opponentOf(opponentOf(f))).toBe(f);
  });
});

describe('RebellionSettingsSchema / StoredRebellionSetupSchema', () => {
  it('accepts consistent settings; strict', () => {
    expect(RebellionSettingsSchema.parse(REBELS_AI)).toEqual(REBELS_AI);
    expect(RebellionSettingsSchema.safeParse({ ...REBELS_AI, extra: 1 }).success).toBe(false);
    expect(
      RebellionSettingsSchema.parse({ ...REBELS_AI, opponentType: 'human', aiDifficulty: null }),
    ).toMatchObject({ aiDifficulty: null });
  });

  it.each([
    ['same faction twice', { ...REBELS_AI, opponentFaction: 'rebels' }, 'opponentFaction'],
    ['ai without difficulty', { ...REBELS_AI, aiDifficulty: null }, 'aiDifficulty'],
    ['human with difficulty', { ...REBELS_AI, opponentType: 'human' }, 'aiDifficulty'],
  ])('rejects %s', (_label, input, path) => {
    const parsed = RebellionSettingsSchema.safeParse(input);
    expect(parsed.success).toBe(false);
    expect(parsed.error?.issues[0]?.path).toEqual([path]);
  });

  it('stored setup = settings + schemaVersion 2 (roundtrip)', () => {
    const stored = toStoredSetup(REBELS_AI);
    expect(stored).toEqual({ schemaVersion: 2, ...REBELS_AI });
    expect(settingsOfStoredSetup(stored)).toEqual(REBELS_AI);
    expect(StoredRebellionSetupSchema.safeParse({ ...stored, schemaVersion: 1 }).success).toBe(
      false,
    );
    expect(StoredRebellionSetupSchema.safeParse(REBELS_AI).success).toBe(false);
  });
});

describe('TC-U-02: FactionSchema rejects anything but rebels / empire', () => {
  it.each([LEGACY_FACTION, 'sith', '', null, 'Rebels', undefined])('%j', (value) => {
    expect(FactionSchema.safeParse(value).success).toBe(false);
  });
});
