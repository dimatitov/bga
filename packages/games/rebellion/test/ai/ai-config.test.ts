import { describe, expect, it } from 'vitest';
import { RebellionAiStrategySchema, rebellionAiStrategy } from '../../src/ai';
import {
  DifficultySchema,
  FactionSchema,
  REBELLION_SETUP_DEFAULTS,
  settingsFromSetupInput,
} from '../../src/schema';

describe('@bga/game-rebellion/ai (configuration data)', () => {
  it('passes its schema', () => {
    expect(RebellionAiStrategySchema.parse(rebellionAiStrategy)).toEqual(rebellionAiStrategy);
  });

  it('has a profile for every difficulty and a strategy for every faction', () => {
    expect(Object.keys(rebellionAiStrategy.difficulties).sort()).toEqual(
      [...DifficultySchema.options].sort(),
    );
    expect(Object.keys(rebellionAiStrategy.factions).sort()).toEqual(
      [...FactionSchema.options].sort(),
    );
  });

  it('default difficulty equals the setup default (A-7, REBELLION_SETUP_DEFAULTS)', () => {
    expect(REBELLION_SETUP_DEFAULTS.aiDifficulty).toBe(rebellionAiStrategy.defaultDifficulty);
    const { aiDifficulty: _omitted, ...withoutDifficulty } = REBELLION_SETUP_DEFAULTS;
    expect(settingsFromSetupInput({ ...withoutDifficulty, playerFaction: 'empire' })).toMatchObject(
      {
        aiDifficulty: rebellionAiStrategy.defaultDifficulty,
      },
    );
  });

  it('harder difficulties explore less and consider at least as many candidates', () => {
    const { easy, normal, hard } = rebellionAiStrategy.difficulties;
    expect(easy.exploration).toBeGreaterThan(normal.exploration);
    expect(normal.exploration).toBeGreaterThan(hard.exploration);
    expect(normal.candidateActionLimit).toBeGreaterThanOrEqual(easy.candidateActionLimit);
    expect(hard.candidateActionLimit).toBeGreaterThanOrEqual(normal.candidateActionLimit);
  });

  it('rejects an invalid configuration', () => {
    const broken = {
      ...rebellionAiStrategy,
      difficulties: {
        ...rebellionAiStrategy.difficulties,
        hard: { ...rebellionAiStrategy.difficulties.hard, exploration: 2 },
      },
    };
    expect(RebellionAiStrategySchema.safeParse(broken).success).toBe(false);
    expect(
      RebellionAiStrategySchema.safeParse({ ...rebellionAiStrategy, extra: true }).success,
    ).toBe(false);
  });
});
