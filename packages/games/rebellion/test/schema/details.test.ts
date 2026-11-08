import { SessionDetailsSchema } from '@bga/platform';
import { describe, expect, it } from 'vitest';
import { RebellionSessionDetailsSchema } from '../../src/schema';

const AI = {
  playerFaction: 'empire',
  opponentFaction: 'rebels',
  opponentType: 'ai',
  aiDifficulty: 'hard',
  ruleset: 'base',
  gameMode: 'digital',
  round: 2,
  phase: 'command',
} as const;
const HUMAN = {
  ...AI,
  playerFaction: 'rebels',
  opponentFaction: 'empire',
  opponentType: 'human',
  aiDifficulty: null,
  round: 1,
  phase: 'assignment',
} as const;

describe('RebellionSessionDetailsSchema (SWR-004, Q-20)', () => {
  it('TC-U-14: the spec keys, flat; null difficulty for a human opponent; valid platform SessionDetails', () => {
    for (const details of [AI, HUMAN]) {
      expect(RebellionSessionDetailsSchema.parse(details)).toEqual(details);
      expect(SessionDetailsSchema.safeParse(details).success).toBe(true);
      expect(Object.keys(details).sort()).toEqual(
        [
          'aiDifficulty',
          'gameMode',
          'opponentFaction',
          'opponentType',
          'phase',
          'playerFaction',
          'round',
          'ruleset',
        ].sort(),
      );
    }
  });

  it('rejects unknown keys (no hidden data, no legacy SWR-003 keys)', () => {
    expect(RebellionSessionDetailsSchema.safeParse({ ...AI, rebelBase: 'sys-x' }).success).toBe(
      false,
    );
    expect(RebellionSessionDetailsSchema.safeParse({ ...AI, humanFaction: 'empire' }).success).toBe(
      false,
    );
    const { aiDifficulty: _omitted, ...withoutDifficulty } = AI;
    expect(RebellionSessionDetailsSchema.safeParse(withoutDifficulty).success).toBe(false);
  });
});
