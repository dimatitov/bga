/**
 * Candidate enumeration (SWR-006 plan-backend §4.2; TC-BOT-01, TC-BOT-03, AC-03): concrete, bounded,
 * deterministic, and every candidate is accepted by the engine.
 */
import { describe, expect, it } from 'vitest';
import {
  enumerateCandidates,
  moveSubsets,
  rebelSpareCapacity,
  type BotCandidate,
} from '../../src/ai';
import { applyCommand, toSideView } from '../../src/rules';
import type { CoreGameState, CorePlayerView, Difficulty, Faction } from '../../src/schema';
import { aiGameSettings, newGame, NOW, originOf, step, walk } from './fixtures/walk';

const act = (leaderId: string, systemId: string): BotCandidate => ({
  key: `A|${leaderId}|${systemId}`,
  kind: 'activate',
  command: { type: 'ACTIVATE_SYSTEM', leaderId, systemId },
  systemId,
});

function capacityOk(view: CorePlayerView, pieceIds: readonly string[]): boolean {
  const types = new Map(view.unitTypes.map((t) => [t.typeKey, t]));
  let required = 0;
  let available = 0;
  for (const id of pieceIds) {
    const unit = view.units.find((u) => u.id === id);
    const type = unit ? types.get(unit.typeKey) : undefined;
    if (!type) return false;
    if (type.requiresTransport) required += 1;
    else available += type.transportCapacity;
  }
  return required <= available;
}

/** TC-BOT-03: shape of each candidate against the templates of the same view. */
function checkAgainstTemplates(view: CorePlayerView, candidates: readonly BotCandidate[]): void {
  const types = new Set(view.legalActions.map((a) => a.type));
  const keys = candidates.map((c) => c.key);
  expect(new Set(keys).size, 'unique keys').toBe(keys.length);
  for (const c of candidates) {
    expect(types.has(c.command.type), c.key).toBe(true);
    if (c.command.type === 'ACTIVATE_SYSTEM') {
      const { leaderId, systemId } = c.command;
      const template = view.legalActions.find((a) => a.type === 'ACTIVATE_SYSTEM');
      expect(template?.type === 'ACTIVATE_SYSTEM' && template.leaderIds.includes(leaderId)).toBe(
        true,
      );
      expect(template?.type === 'ACTIVATE_SYSTEM' && template.systemIds.includes(systemId)).toBe(
        true,
      );
    }
    if (c.command.type === 'MOVE_PIECES') {
      const { fromSystemId, toSystemId, pieceIds } = c.command;
      const template = view.legalActions.find(
        (a) => a.type === 'MOVE_PIECES' && a.fromSystemId === fromSystemId,
      );
      if (template?.type !== 'MOVE_PIECES') throw new Error(`no template for ${c.key}`);
      expect(template.toSystemId).toBe(toSystemId);
      const allowed = new Set(template.pieces.map((p) => p.pieceId));
      for (const id of pieceIds) expect(allowed.has(id), `${c.key}: ${id}`).toBe(true);
      expect(pieceIds.length).toBeGreaterThan(0);
      expect(new Set(pieceIds).size).toBe(pieceIds.length);
      expect(capacityOk(view, pieceIds), c.key).toBe(true);
      expect(c.variants?.length).toBeGreaterThan(0);
    }
  }
}

describe('enumerateCandidates — fixed states', () => {
  it('at creation (Rebels to move): every leader × system pair + PASS; nothing for the other side', () => {
    const state = newGame(aiGameSettings('rebels', 'normal'), 'cand-1');
    const view = toSideView(state, 'rebels');
    const candidates = enumerateCandidates(view);
    // Mon Mothma cannot activate (R-4): 3 leaders × 32 systems + PASS.
    expect(candidates.filter((c) => c.kind === 'activate')).toHaveLength(3 * 32);
    expect(candidates.at(-1)).toEqual({
      key: 'P',
      kind: 'pass',
      command: { type: 'PASS' },
      systemId: null,
    });
    checkAgainstTemplates(view, candidates);
    expect(enumerateCandidates(toSideView(state, 'empire'))).toEqual([]);
    // Deterministic and input-pure.
    expect(enumerateCandidates(view)).toEqual(candidates);
  });

  it('during an activation: ≤ 5 subsets per source, all fit, + FINISH; spare-load for the Rebels', () => {
    let state = newGame(aiGameSettings('rebels', 'hard'), 'cand-2');
    const neighbour = toSideView(state, 'rebels').map.systems.find((s) => s.id === 'bothawui')
      ?.adjacentSystemIds[0];
    if (!neighbour) throw new Error('bothawui has neighbours');
    state = step(state, act('leia', neighbour));
    const view = toSideView(state, 'rebels');
    const candidates = enumerateCandidates(view);
    const moves = candidates.filter((c) => c.kind === 'move');
    const fromBothawui = moves.filter(
      (c) => c.command.type === 'MOVE_PIECES' && c.command.fromSystemId === 'bothawui',
    );
    expect(fromBothawui.length).toBeGreaterThan(1);
    expect(fromBothawui.length).toBeLessThanOrEqual(5);
    expect(candidates.at(-1)?.kind).toBe('finish');
    expect(candidates.some((c) => c.kind === 'pass' || c.kind === 'activate')).toBe(false);
    checkAgainstTemplates(view, candidates);
    // all-fit from Bothawui: corvette (2) + transport (4) + x/y-wing + 4 ground (3 troopers + airspeeder).
    const allFit = fromBothawui.find((c) => c.variants?.includes('all-fit'));
    expect(allFit?.command.type === 'MOVE_PIECES' && allFit.command.pieceIds).toHaveLength(8);
    expect(rebelSpareCapacity(view)).toBeTypeOf('number');
    expect(fromBothawui.some((c) => c.variants?.includes('spare-load'))).toBe(true);
  });

  it('moveSubsets: riders never exceed the capacity of the chosen carriers', () => {
    const pieces = [
      { pieceId: 'u-1', transportCapacity: 2, requiresTransport: false },
      { pieceId: 'u-2', transportCapacity: 0, requiresTransport: false },
      { pieceId: 'u-3', transportCapacity: 0, requiresTransport: true },
      { pieceId: 'u-4', transportCapacity: 0, requiresTransport: true },
      { pieceId: 'u-5', transportCapacity: 0, requiresTransport: true },
      { pieceId: 'u-6', transportCapacity: 0, requiresTransport: true },
    ];
    const arena = (id: string) =>
      ({
        typeKey: 'unit.empire.x',
        owner: 'empire',
        arena: id === 'u-6' ? 'space' : 'ground',
        mobility: 'mobile',
        transportCapacity: 0,
        requiresTransport: true,
      }) as const;
    const subsets = moveSubsets(pieces, arena, 1);
    expect(subsets.map((s) => s.variant)).toEqual([
      'all-fit',
      'ground-strike',
      'ships-only',
      'one-carrier',
      'spare-load',
    ]);
    for (const subset of subsets) {
      const cap = subset.pieces
        .filter((p) => !p.requiresTransport)
        .reduce((s, p) => s + p.transportCapacity, 0);
      expect(subset.pieces.filter((p) => p.requiresTransport).length).toBeLessThanOrEqual(cap);
    }
    // ground riders go first (TIE-like u-6 last).
    expect(subsets[0]?.pieces.map((p) => p.pieceId)).toEqual(['u-1', 'u-2', 'u-3', 'u-4']);
    expect(subsets[4]?.pieces.map((p) => p.pieceId)).toEqual(['u-1', 'u-2', 'u-3']);
    // No carrier: riders never appear.
    const noCarrier = moveSubsets(pieces.slice(1), arena, null);
    for (const subset of noCarrier)
      expect(subset.pieces.every((p) => !p.requiresTransport)).toBe(true);
  });
});

// ---------------------------------------------------------------------------------------------------------
// Property (TC-BOT-01, AC-03): every enumerated candidate on many random-walk states is accepted by the engine
// ---------------------------------------------------------------------------------------------------------

const DIFFICULTIES: Difficulty[] = ['easy', 'normal', 'hard'];
const SIDES: Faction[] = ['empire', 'rebels'];
const SEEDS = ['swr006-p01', 'swr006-p02'];

function checkAllCandidates(state: CoreGameState): { candidates: number; auto: number } {
  if (state.outcome !== null) return { candidates: 0, auto: 0 };
  const side = state.activeSide;
  const view = toSideView(state, side);
  const candidates = enumerateCandidates(view);
  expect(candidates.length).toBeGreaterThan(0);
  checkAgainstTemplates(view, candidates);
  const origin = originOf(state, side);
  for (const candidate of candidates) {
    const result = applyCommand(
      state,
      { actor: side, expectedVersion: state.version, command: candidate.command },
      { now: NOW, origin },
    );
    if (!result.ok) {
      throw new Error(`${candidate.key} rejected (${origin}): ${result.error.messageKey}`);
    }
    expect(result.state.version).toBe(state.version + 1);
  }
  return { candidates: candidates.length, auto: origin === 'auto' ? candidates.length : 0 };
}

describe('enumerateCandidates — property on random-walk games (TC-BOT-01)', () => {
  it('every candidate of every state is engine-legal (AI side with origin auto)', () => {
    let states = 0;
    let candidates = 0;
    let auto = 0;
    let ended = 0;
    for (const aiSide of SIDES) {
      for (const difficulty of DIFFICULTIES) {
        for (const seed of SEEDS) {
          const game = walk(aiGameSettings(aiSide, difficulty), `${seed}-${aiSide}-${difficulty}`);
          if (game.at(-1)?.outcome) ended += 1;
          for (const state of game) {
            const counted = checkAllCandidates(state);
            states += 1;
            candidates += counted.candidates;
            auto += counted.auto;
          }
        }
      }
    }
    console.info(
      `[bot-property] games=${SIDES.length * DIFFICULTIES.length * SEEDS.length} ended=${ended} ` +
        `states=${states} candidates=${candidates} autoCandidates=${auto}`,
    );
    expect(ended).toBe(SIDES.length * DIFFICULTIES.length * SEEDS.length);
    expect(auto).toBeGreaterThan(5_000);
  }, 120_000);
});
