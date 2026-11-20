/**
 * SWR-008 W2 — DISC-009 on seeded real-data games (test-cases.md TC-D-32 property, TC-D-33 differential).
 *
 * Games: `SEEDS_P` (`swr008-p01..p30`, frozen by test-cases.md) bot-vs-bot × the 9 difficulty pairs (the AI seat
 * driven exactly like the server runner, `../../ai/sim/harness`), plus `E-HUNT` (full-knowledge Empire, it
 * reveals the base) vs AI Rebels easy / normal / hard on the first 5 seeds.
 *
 * TC-D-32 — after EVERY accepted command (and at creation): (i) ≤ 1 `BASE_REVEALED` in the log; (ii) `revealed`
 * ⇔ the log has `BASE_REVEALED`; (iii) outside an Imperial activation: hidden base ∧ no outcome ⇒ no Imperial
 * ground unit in the base (independent oracle: the unit type key); (iv) a `BASE_REVEALED` directly follows the
 * Empire's `ACTIVATION_FINISHED` (the only reachable path in core-v1) and only `GAME_OVER` may follow it;
 * (v) ≤ 1 `GAME_OVER` and it is the last event.
 *
 * TC-D-33 — oracle: a copy of the pre-SWR-008 logic (`revealsBaseNow` + the old `applyFinishActivation`, victory
 * inside `applyMove`), kept ONLY here. Every game is replayed command by command with the oracle from the same
 * initial state: every intermediate state, every event list and the final state are identical (A-3: the
 * observable behaviour of core-v1 does not change).
 */
import { describe, expect, it } from 'vitest';
import {
  unitTypeRevealsRebelBase,
  type CoreCommand,
  type CoreGameState,
  type CoreEvent,
  type Difficulty,
  type Faction,
  type GameEvent,
} from '../../../src/schema';
import { runStateChecks } from '../../../src/rules/core';
import { applyActivate, validateActivate } from '../../../src/rules/core/activation';
import { finalize, typeOf, type Transition } from '../../../src/rules/core/helpers';
import { applyMove, validateMove } from '../../../src/rules/core/movement';
import { applyAcceptHandoff, applyPass, handOver } from '../../../src/rules/core/turn-flow';
import { checkEmpireVictory, revealBase } from '../../../src/rules/core/victory';
import { DIFFICULTIES, PAIRS, botVsBot, pairName } from '../../ai/sim/bot-games';
import {
  SIM_NOW,
  huntingEmpire,
  isGroundType,
  simulate,
  type CommandRecord,
  type SimResult,
} from '../../ai/sim/harness';

/** test-cases.md Conventions: `SEEDS_P` — 30 session ids `swr008-p01 … swr008-p30` (frozen; Analyst only). */
const SEEDS_P: readonly string[] = Array.from(
  { length: 30 },
  (_, i) => `swr008-p${String(i + 1).padStart(2, '0')}`,
);
const E_HUNT_SEEDS = SEEDS_P.slice(0, 5);
const TIMEOUT = 120_000;

// ---------------------------------------------------------------------------------------------------------
// Oracle: the core-v1 reveal logic BEFORE SWR-008 (copied from turn-flow.ts / victory.ts / movement.ts / apply.ts)
// ---------------------------------------------------------------------------------------------------------

/** OLD victory.ts `revealsBaseNow`: only at the end of an Imperial activation OF THE BASE with own ground there. */
function oldRevealsBaseNow(state: CoreGameState, activatedSystemId: string): boolean {
  const baseId = state.rebelBase.systemId;
  if (state.rebelBase.revealed || activatedSystemId !== baseId) return false;
  return state.units.some(
    (u) =>
      u.systemId === baseId &&
      u.owner === 'empire' &&
      unitTypeRevealsRebelBase(typeOf(state, u.typeKey)),
  );
}

/** OLD turn-flow.ts `applyFinishActivation`. */
function oldApplyFinishActivation(state: CoreGameState, actor: Faction, auto: boolean): Transition {
  const activation = state.activation;
  if (activation === null) throw new Error('oracle: FINISH_ACTIVATION without an activation');
  let transition: Transition = {
    state: { ...state, activation: null },
    drafts: [{ type: 'ACTIVATION_FINISHED', actor, payload: { auto } }],
  };
  if (actor === 'empire' && oldRevealsBaseNow(transition.state, activation.systemId)) {
    transition = checkEmpireVictory(revealBase(transition));
    if (transition.state.outcome !== null) return transition;
  }
  return handOver(transition, actor);
}

/** OLD `applyCoreCommand` for an ALREADY ACCEPTED command (the check order before the switch is unchanged). */
function oldApply(
  state: CoreGameState,
  actor: Faction,
  command: CoreCommand,
  auto: boolean,
): { state: CoreGameState; events: CoreEvent[] } {
  if (state.outcome !== null) throw new Error('oracle: game over');
  let transition: Transition;
  switch (command.type) {
    case 'ACTIVATE_SYSTEM': {
      if (validateActivate(state, actor, command)) throw new Error('oracle: activation rejected');
      transition = applyActivate(state, actor, command);
      break;
    }
    case 'MOVE_PIECES': {
      if (validateMove(state, actor, command)) throw new Error('oracle: move rejected');
      // OLD movement.ts: the Empire victory was checked inside applyMove
      transition = checkEmpireVictory(applyMove(state, actor, command));
      break;
    }
    case 'FINISH_ACTIVATION':
      transition = oldApplyFinishActivation(state, actor, auto);
      break;
    case 'PASS':
      transition = applyPass(state, actor, auto);
      break;
    case 'ACCEPT_HANDOFF':
      transition = applyAcceptHandoff(state, actor);
      break;
    default:
      throw new Error(`oracle: unexpected command ${(command as { type: string }).type}`);
  }
  return finalize(state, transition, SIM_NOW);
}

/** The command of a record: as sent (human) or rebuilt from its first event (AI candidates). */
function commandOf(record: CommandRecord): CoreCommand {
  if (record.command) return record.command;
  const first = record.events[0];
  if (!first) throw new Error('record without events');
  switch (first.type) {
    case 'SYSTEM_ACTIVATED':
      return { type: 'ACTIVATE_SYSTEM', ...first.payload };
    case 'PIECES_MOVED':
      return { type: 'MOVE_PIECES', ...first.payload, pieceIds: [...first.payload.pieceIds] };
    case 'ACTIVATION_FINISHED':
      return { type: 'FINISH_ACTIVATION' };
    case 'PASSED':
      return { type: 'PASS' };
    case 'HANDOFF_ACCEPTED':
      return { type: 'ACCEPT_HANDOFF' };
    default:
      throw new Error(`cannot rebuild a command from ${first.type}`);
  }
}

// ---------------------------------------------------------------------------------------------------------
// TC-D-32 property
// ---------------------------------------------------------------------------------------------------------

const types = (events: readonly GameEvent[]) => events.map((e) => e.type);
const count = (events: readonly GameEvent[], type: string) =>
  events.filter((e) => e.type === type).length;

function checkStateInvariant(state: CoreGameState, label: string): void {
  const reveals = count(state.log, 'BASE_REVEALED');
  expect(reveals, `${label} (i)`).toBeLessThanOrEqual(1); // (i)
  expect(state.rebelBase.revealed, `${label} (ii)`).toBe(reveals === 1); // (ii)
  if (state.activation?.side !== 'empire' && !state.rebelBase.revealed && state.outcome === null) {
    const base = state.rebelBase.systemId;
    const groundInBase = state.units.filter(
      (u) => u.owner === 'empire' && u.systemId === base && isGroundType(u.typeKey),
    );
    expect(groundInBase, `${label} (iii)`).toEqual([]); // (iii)
  }
  const overs = count(state.log, 'GAME_OVER');
  expect(overs, `${label} (v)`).toBeLessThanOrEqual(1); // (v)
  if (overs === 1) expect(state.log[state.log.length - 1]?.type, `${label} (v)`).toBe('GAME_OVER');
}

function checkCommandEvents(events: readonly GameEvent[], label: string): void {
  const k = events.findIndex((e) => e.type === 'BASE_REVEALED');
  if (k === -1) return;
  const previous = events[k - 1];
  expect([previous?.type, previous?.actor], `${label} (iv)`).toEqual([
    'ACTIVATION_FINISHED',
    'empire',
  ]);
  expect(
    types(events.slice(k + 1)).every((t) => t === 'GAME_OVER'),
    `${label} (iv)`,
  ).toBe(true);
  expect(events.length - k - 1, `${label} (iv)`).toBeLessThanOrEqual(1);
}

interface Tally {
  games: number;
  commands: number;
  reveals: number;
  empireWins: number;
  rebelWins: number;
}
const tally: Tally = { games: 0, commands: 0, reveals: 0, empireWins: 0, rebelWins: 0 };

/** TC-D-32 + TC-D-33 for one finished game. */
function verifyGame(r: SimResult): void {
  const label = `${r.sessionId} ai=${r.aiSide}:${r.difficulty}`;
  // creation: the central check ran in createCoreGame and is a no-op on its result (the old create had none)
  const initial = { state: r.initial, drafts: [] };
  expect(runStateChecks(initial), `${label} creation`).toBe(initial);
  checkStateInvariant(r.initial, `${label} creation`);

  let oracle = r.initial;
  r.records.forEach((record, i) => {
    const at = `${label} #${i} ${record.by}:${record.actor}`;
    // TC-D-32
    checkCommandEvents(record.events, at);
    checkStateInvariant(record.after, at);
    // TC-D-33: the oracle, chained from the same initial state, yields identical events and states
    expect(record.before, `${at} chain`).toBe(i === 0 ? r.initial : r.records[i - 1]?.after);
    const old = oldApply(oracle, record.actor, commandOf(record), record.by === 'ai');
    expect(old.events, `${at} events`).toEqual(record.events);
    expect(old.state, `${at} state`).toEqual(record.after);
    oracle = old.state;
  });
  expect(oracle, `${label} final`).toEqual(r.final);
  expect(r.final.outcome, label).not.toBeNull();

  tally.games += 1;
  tally.commands += r.records.length;
  tally.reveals += count(r.final.log, 'BASE_REVEALED');
  if (r.final.outcome?.winner === 'empire') tally.empireWins += 1;
  if (r.final.outcome?.winner === 'rebels') tally.rebelWins += 1;
}

describe('DISC-009 on seeded games: property (TC-D-32) + differential vs the pre-SWR-008 logic (TC-D-33)', () => {
  it.each(PAIRS.map((p) => [pairName(p), p] as const))(
    'bot vs bot %s on SEEDS_P (30 games)',
    { timeout: TIMEOUT },
    (_name, pair) => {
      SEEDS_P.forEach((sessionId, i) => verifyGame(botVsBot(sessionId, i, pair)));
    },
  );

  it.each(DIFFICULTIES.map((d) => [d] as const))(
    'E-HUNT (human Empire) vs AI Rebels %s on 5 seeds',
    { timeout: TIMEOUT },
    (difficulty: Difficulty) => {
      for (const sessionId of E_HUNT_SEEDS) {
        verifyGame(simulate({ sessionId, aiSide: 'rebels', difficulty, human: huntingEmpire }));
      }
    },
  );

  it('summary: every game checked; the reveal and both victories were exercised', () => {
    console.log(
      `[swr008-disc009] games=${tally.games} commands=${tally.commands} reveals=${tally.reveals} ` +
        `empireWins=${tally.empireWins} rebelWins=${tally.rebelWins}`,
    );
    expect(tally.games).toBe(30 * PAIRS.length + E_HUNT_SEEDS.length * DIFFICULTIES.length);
    expect(tally.reveals).toBeGreaterThan(0);
    expect(tally.empireWins).toBeGreaterThan(0);
    expect(tally.rebelWins).toBeGreaterThan(0);
  });
});
