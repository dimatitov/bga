/**
 * `./fixtures/empire-win-seeds.json` — the Empire-win seeds handed to W9 (TC-OUT-06). Compared with a fresh
 * simulation on every run; regenerated only with `UPDATE_SIM_FIXTURES=1` (then run `pnpm format`).
 */
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { huntingEmpire, simulate } from './harness';
import { DIFF_SEEDS } from './seeds';
import {
  EMPIRE_WIN_SEEDS,
  type EmpireWinSeed,
  type EmpireWinSeeds,
} from './fixtures/empire-win-seeds';

const UPDATE = process.env['UPDATE_SIM_FIXTURES'] === '1';
const FILE = fileURLToPath(new URL('./fixtures/empire-win-seeds.json', import.meta.url));

function winners(difficulty: 'easy' | 'normal'): EmpireWinSeed[] {
  const out: EmpireWinSeed[] = [];
  for (const sessionId of DIFF_SEEDS) {
    const r = simulate({ sessionId, aiSide: 'rebels', difficulty, human: huntingEmpire });
    if (r.final.outcome?.winner !== 'empire') continue;
    out.push({
      sessionId,
      base: r.final.rebelBase.systemId ?? '',
      winner: 'empire',
      reason: 'rebelBaseCaptured',
      finalRound: r.final.round,
      finalVersion: r.final.version,
      humanCommands: r.records
        .filter((rec) => rec.by === 'human')
        .map((rec) => {
          if (!rec.command) throw new Error('human record without a command');
          return rec.command;
        }),
    });
  }
  return out;
}

describe('Empire-win seed fixtures for W9 (TC-OUT-04/05/06)', () => {
  it(
    'match a fresh simulation (E-HUNT vs AI Rebels easy / normal on DIFF_SEEDS)',
    { timeout: 60_000 },
    () => {
      const actual: EmpireWinSeeds = {
        script: 'E-HUNT',
        aiSide: 'rebels',
        easy: winners('easy'),
        normal: winners('normal'),
      };
      if (UPDATE) writeFileSync(FILE, `${JSON.stringify(actual, null, 2)}\n`);
      expect(actual.easy.length).toBeGreaterThanOrEqual(1);
      expect(actual.normal.length).toBeGreaterThanOrEqual(1);
      expect(JSON.parse(JSON.stringify(actual))).toEqual(
        JSON.parse(JSON.stringify(EMPIRE_WIN_SEEDS)),
      );
    },
  );
});
