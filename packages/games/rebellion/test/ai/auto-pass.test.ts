/**
 * Auto-pass policy (SWR-005 W5; AC-08; TC-AI-01, TC-AI-02, TC-AI-14): pure, deterministic, sees only a view.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { AUTO_POLICY_ID, chooseAutoCommand } from '../../src/ai';
import { applyCommand, createCoreGame, toSideView } from '../../src/rules';
import { coreDataBaseV1 } from '../../src/scenario';
import { settingsFromSetupInput, type CorePlayerView } from '../../src/schema';
import { deepFreeze } from '../rules/helpers';

const NOW = '2026-11-08T10:00:00.000Z';
const HOT_SEAT = settingsFromSetupInput({
  playerFaction: 'rebels',
  opponentType: 'human',
  ruleset: 'base',
  gameMode: 'digital',
});

function rebelsView(): CorePlayerView {
  return toSideView(
    createCoreGame(HOT_SEAT, coreDataBaseV1, { gameId: 'ai-1', now: NOW }),
    'rebels',
  );
}

function duringActivation(): CorePlayerView {
  const state = createCoreGame(HOT_SEAT, coreDataBaseV1, { gameId: 'ai-1', now: NOW });
  const activated = applyCommand(
    state,
    {
      actor: 'rebels',
      expectedVersion: 1,
      command: { type: 'ACTIVATE_SYSTEM', leaderId: 'leia', systemId: 'toydaria' },
    },
    { now: NOW },
  );
  if (!activated.ok) throw new Error('activation rejected');
  return toSideView(activated.state, 'rebels');
}

describe('chooseAutoCommand (auto-pass-v1)', () => {
  it('TC-AI-01: PASS when PASS is legal; same answer on every call; input not mutated', () => {
    expect(AUTO_POLICY_ID).toBe('auto-pass-v1');
    const view = deepFreeze(rebelsView());
    expect(view.legalActions.map((a) => a.type)).toEqual(['ACTIVATE_SYSTEM', 'PASS']);
    const answers = Array.from({ length: 10 }, () => chooseAutoCommand(view));
    for (const answer of answers) expect(answer).toEqual({ type: 'PASS' });
  });

  it('TC-AI-02: FINISH_ACTIVATION during an activation (no PASS); null without legal actions', () => {
    const active = deepFreeze(duringActivation());
    expect(active.legalActions.map((a) => a.type)).not.toContain('PASS');
    expect(active.legalActions.map((a) => a.type)).toContain('FINISH_ACTIVATION');
    expect(chooseAutoCommand(active)).toEqual({ type: 'FINISH_ACTIVATION' });

    const notMyTurn = toSideView(
      createCoreGame(HOT_SEAT, coreDataBaseV1, { gameId: 'ai-1', now: NOW }),
      'empire',
    );
    expect(notMyTurn.legalActions).toEqual([]);
    expect(chooseAutoCommand(notMyTurn)).toBeNull();
    expect(
      chooseAutoCommand({ ...notMyTurn, legalActions: [{ type: 'FINISH_ACTIVATION' }] }),
    ).toEqual({ type: 'FINISH_ACTIVATION' });
  });

  it('TC-AI-14: src/ai imports only ../schema and zod (no OpenAI, Nest, React, scenario, rules)', () => {
    const dir = new URL('../../src/ai/', import.meta.url);
    for (const file of readdirSync(dir).filter((f) => f.endsWith('.ts'))) {
      const source = readFileSync(new URL(file, dir), 'utf8');
      const imports = [...source.matchAll(/from\s+'([^']+)'/g)].map((m) => m[1]);
      for (const spec of imports) {
        expect(['../schema', 'zod', './auto-pass'], `${file}: ${spec}`).toContain(spec);
      }
      expect(source).not.toMatch(/Math\.random|Date\.now|new Date\(|process\.env|fetch\(/);
    }
  });
});
