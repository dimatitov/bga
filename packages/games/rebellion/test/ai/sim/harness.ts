/**
 * Engine-level game simulation for SWR-006 W8 (test-cases.md TR-4, plan-backend §9.2 W8, §6.4).
 *
 * The AI side is driven EXACTLY like the server runner drives it: `module.automation.pendingActor` →
 * `decisionPoint` (validated with the platform schema, Q-9) → the bot strategy takes `fallbackCandidateId` →
 * `applyCandidate(state, id, { now })`; one automated "run" lasts until the human's turn or the end of the
 * game and is bounded by `AI_COMMANDER_MAX_STEPS` (64, Contract §4). The human side plays a deterministic
 * script through `module.applyCommand` (origin 'player'), like `POST /commands`.
 *
 * Human scripts (test-cases.md Conventions): `E-PASSIVE`, `E-HUNT` (full-knowledge Empire — the oracle reads
 * the true base from the full state; only the HUMAN script does that, never the bot), `R-PASSIVE`, `R-ACTIVE`,
 * and `botHuman(difficulty)` (the bot itself on the human seat, for bot-vs-bot property games).
 *
 * Pure and deterministic: no clock (fixed `SIM_NOW`), no randomness except the bot's own seeded one.
 */
import { AutomationDecisionPointSchema, type ServerGameModule } from '@bga/platform';
import {
  botSeed,
  deriveBaseIntel,
  enumerateCandidates,
  rankCandidates,
  type BotCandidate,
} from '../../../src/ai';
import { toSideView } from '../../../src/rules';
import {
  opponentOf,
  settingsFromSetupInput,
  toStoredSetup,
  type CoreCommand,
  type CoreGameState,
  type Difficulty,
  type Faction,
  type GameEvent,
  type RebellionSettings,
} from '../../../src/schema';
import { createCoreInitialState, createRebellionServerModule } from '../../../src/server';

export const SIM_NOW = '2026-11-19T12:00:00.000Z';
/** `AI_COMMANDER_MAX_STEPS` default (Contract §4, plan-backend §6.4). */
export const MAX_STEPS_PER_RUN = 64;
/** Time 1 → reputation 14: at most 13 rounds are played (§6.4.3). */
export const MAX_ROUNDS = 13;

/** The production module (bot policy, default options) — the same object the API registry uses. */
export const botModule: ServerGameModule = createRebellionServerModule();

/** A human script: the next command of the human side (it is always the human's turn when called). */
export type HumanScript = (state: CoreGameState) => CoreCommand;

export interface CommandRecord {
  readonly by: 'ai' | 'human';
  readonly actor: Faction;
  readonly before: CoreGameState;
  readonly after: CoreGameState;
  readonly events: readonly GameEvent[];
  /** AI steps only: the decision point's policy id (`rebellion-bot-v1:<difficulty>`). */
  readonly policyId?: string;
  /** Human commands only: the command as sent. */
  readonly command?: CoreCommand;
}

export interface SimOptions {
  readonly sessionId: string;
  readonly aiSide: Faction;
  readonly difficulty: Difficulty;
  readonly human: HumanScript;
  /** Steps per automated run (default 64); exceeding it fails the simulation (termination guarantee). */
  readonly maxStepsPerRun?: number;
  /** Safety cap on human commands (default 2000). */
  readonly maxHumanCommands?: number;
}

export interface SimResult {
  readonly sessionId: string;
  readonly aiSide: Faction;
  readonly difficulty: Difficulty;
  readonly initial: CoreGameState;
  readonly final: CoreGameState;
  readonly records: readonly CommandRecord[];
  /** Steps of every automated run (after creation and after every human command). */
  readonly runs: readonly number[];
}

export function simSettings(aiSide: Faction, difficulty: Difficulty): RebellionSettings {
  return settingsFromSetupInput({
    playerFaction: opponentOf(aiSide),
    opponentType: 'ai',
    aiDifficulty: difficulty,
    ruleset: 'base',
    gameMode: 'digital',
  });
}

function asCore(state: unknown): CoreGameState {
  const s = state as CoreGameState;
  if (s.rulesEngine !== 'core-v1') throw new Error('sim: not a core-v1 state');
  return s;
}

/** One automated run, exactly like the server runner with the `bot` strategy. */
function runAutomation(
  module: ServerGameModule,
  start: CoreGameState,
  maxSteps: number,
  records: CommandRecord[],
): { state: CoreGameState; steps: number } {
  const automation = module.automation;
  if (!automation) throw new Error('sim: the module has no automation');
  let state = start;
  let steps = 0;
  for (;;) {
    const actor = automation.pendingActor(state);
    if (actor === null) return { state, steps };
    if (steps >= maxSteps) {
      throw new Error(`sim ${state.id}: more than ${maxSteps} automated steps in one run`);
    }
    const point = AutomationDecisionPointSchema.parse(automation.decisionPoint(state));
    const result = automation.applyCandidate(state, point.fallbackCandidateId, { now: SIM_NOW });
    if (!result.ok) {
      throw new Error(`sim ${state.id}: the engine rejected the bot (${result.error.messageKey})`);
    }
    const after = asCore(result.state);
    if (after.version !== state.version + 1) throw new Error('sim: an AI step must be version + 1');
    records.push({
      by: 'ai',
      actor: actor as Faction,
      before: state,
      after,
      events: result.events as GameEvent[],
      policyId: point.policyId,
    });
    state = after;
    steps += 1;
  }
}

/** Play one AI game from creation to the end. Throws on any rejection or broken termination bound. */
export function simulate(options: SimOptions, module: ServerGameModule = botModule): SimResult {
  const maxSteps = options.maxStepsPerRun ?? MAX_STEPS_PER_RUN;
  const maxHuman = options.maxHumanCommands ?? 2000;
  const settings = simSettings(options.aiSide, options.difficulty);
  const created = createCoreInitialState(toStoredSetup(settings), {
    sessionId: options.sessionId,
    now: SIM_NOW,
  });
  const initial = created.state;
  const records: CommandRecord[] = [];
  const runs: number[] = [];
  const humanSide = opponentOf(options.aiSide);

  let run = runAutomation(module, initial, maxSteps, records);
  runs.push(run.steps);
  let state = run.state;
  for (let i = 0; state.outcome === null; i += 1) {
    if (i >= maxHuman) throw new Error(`sim ${options.sessionId}: the game did not end`);
    if (state.activeSide !== humanSide) throw new Error('sim: expected the human to move');
    const command = options.human(state);
    const result = module.applyCommand(
      state,
      { actor: humanSide, expectedVersion: state.version, command },
      { now: SIM_NOW },
    );
    if (!result.ok) {
      throw new Error(
        `sim ${options.sessionId}: human ${command.type} rejected (${result.error.messageKey})`,
      );
    }
    const after = asCore(result.state);
    records.push({
      by: 'human',
      actor: humanSide,
      before: state,
      after,
      events: result.events as GameEvent[],
      command,
    });
    run = runAutomation(module, after, maxSteps, records);
    runs.push(run.steps);
    state = run.state;
  }
  return {
    sessionId: options.sessionId,
    aiSide: options.aiSide,
    difficulty: options.difficulty,
    initial,
    final: state,
    records,
    runs,
  };
}

// ---------------------------------------------------------------------------------------------------------
// Board helpers (full state — test oracle)
// ---------------------------------------------------------------------------------------------------------

const GROUND = /\.(stormtrooper|at-st|at-at|rebel-trooper|airspeeder)$/;

export function isGroundType(typeKey: string): boolean {
  return GROUND.test(typeKey);
}

export function adjacency(state: CoreGameState): Map<string, readonly string[]> {
  return new Map(state.map.systems.map((s) => [s.id, s.adjacentSystemIds]));
}

/** BFS jumps from `from` to every system. */
export function distancesFrom(state: CoreGameState, from: string): Map<string, number> {
  const adj = adjacency(state);
  const dist = new Map<string, number>([[from, 0]]);
  const queue = [from];
  for (let head = 0; head < queue.length; head += 1) {
    const id = queue[head] as string;
    for (const next of adj.get(id) ?? []) {
      if (dist.has(next)) continue;
      dist.set(next, (dist.get(id) ?? 0) + 1);
      queue.push(next);
    }
  }
  return dist;
}

/** `emptyBase(s)` (test-cases.md): 0 Rebel units in the base system. */
export function emptyBase(state: CoreGameState): boolean {
  const base = state.rebelBase.systemId;
  return !state.units.some((u) => u.owner === 'rebels' && u.systemId === base);
}

/** `threat(s)` (Q-13): Imperial ground in the base or in a system adjacent to it. */
export function threat(state: CoreGameState): boolean {
  const base = state.rebelBase.systemId;
  if (base === null) return false;
  const around = new Set([base, ...(adjacency(state).get(base) ?? [])]);
  return state.units.some(
    (u) => u.owner === 'empire' && around.has(u.systemId) && isGroundType(u.typeKey),
  );
}

/** Did `side` already activate a system in the current round (from the full log)? */
export function activatedThisRound(state: CoreGameState, side: Faction): number {
  let count = 0;
  for (let i = state.log.length - 1; i >= 0; i -= 1) {
    const event = state.log[i];
    if (!event) continue;
    if (event.type === 'PHASE_STARTED' && event.payload.phase === 'command') break;
    if (event.type === 'SYSTEM_ACTIVATED' && event.actor === side) count += 1;
  }
  return count;
}

/** Own `PIECES_MOVED` since the current activation started. */
function movesInActivation(state: CoreGameState, side: Faction): number {
  let count = 0;
  for (let i = state.log.length - 1; i >= 0; i -= 1) {
    const event = state.log[i];
    if (!event) continue;
    if (event.type === 'SYSTEM_ACTIVATED' && event.actor === side) break;
    if (event.type === 'PIECES_MOVED' && event.actor === side) count += 1;
  }
  return count;
}

// ---------------------------------------------------------------------------------------------------------
// Human scripts
// ---------------------------------------------------------------------------------------------------------

function candidatesOf(state: CoreGameState): BotCandidate[] {
  return enumerateCandidates(toSideView(state, state.activeSide));
}

function terminating(candidates: readonly BotCandidate[]): CoreCommand {
  const c = candidates.find((x) => x.kind === 'pass' || x.kind === 'finish');
  if (!c) throw new Error('sim: no terminating action');
  return c.command;
}

/** `E-PASSIVE` / `R-PASSIVE`: always PASS (FINISH inside an activation — never happens for them). */
export const passiveHuman: HumanScript = (state) => terminating(candidatesOf(state));

function groundAndCapacity(state: CoreGameState, systemId: string, side: Faction) {
  let ground = 0;
  let capacity = 0;
  for (const u of state.units) {
    if (u.owner !== side || u.systemId !== systemId) continue;
    const type = state.unitTypes.find((t) => t.typeKey === u.typeKey);
    if (!type || type.mobility !== 'mobile') continue;
    if (type.arena === 'ground') ground += 1;
    else if (!type.requiresTransport) capacity += type.transportCapacity;
  }
  return { ground, capacity, deliverable: Math.min(ground, capacity) };
}

/**
 * `E-HUNT` — full-knowledge Empire (oracle BASE): one strike group (ground + transport) walks the shortest path
 * to the base, one hop per round (the activating leader pins it), activates the base, brings ground in and
 * finishes (→ reveal); after the reveal it keeps its units in the base and passes.
 */
export const huntingEmpire: HumanScript = (state) => {
  const candidates = candidatesOf(state);
  const base = state.rebelBase.systemId;
  if (base === null) throw new Error('E-HUNT: no base');
  const toBase = distancesFrom(state, base);
  const d = (id: string) => toBase.get(id) ?? Infinity;

  if (state.activation !== null) {
    if (movesInActivation(state, 'empire') > 0) return terminating(candidates);
    // The first (only) move: the all-fit load with ground from the source closest to the base.
    const moves = candidates.filter(
      (c) =>
        c.kind === 'move' &&
        c.command.type === 'MOVE_PIECES' &&
        (c.variants ?? []).includes('all-fit') &&
        groundAndCapacity(state, c.command.fromSystemId, 'empire').deliverable > 0,
    );
    moves.sort((a, b) => {
      const fa = a.command.type === 'MOVE_PIECES' ? a.command.fromSystemId : '';
      const fb = b.command.type === 'MOVE_PIECES' ? b.command.fromSystemId : '';
      return d(fa) - d(fb) || (fa < fb ? -1 : fa > fb ? 1 : 0);
    });
    return moves[0]?.command ?? terminating(candidates);
  }

  if (state.rebelBase.revealed || activatedThisRound(state, 'empire') > 0) {
    return terminating(candidates);
  }
  // The strike group: a system with deliverable ground, closest to the base (ties by id).
  const leaderHere = new Set(
    state.leaders.filter((l) => l.owner === 'empire' && l.systemId !== null).map((l) => l.systemId),
  );
  const groups = state.map.systems
    .map((s) => s.id)
    .filter(
      (id) =>
        !leaderHere.has(id) &&
        id !== base &&
        groundAndCapacity(state, id, 'empire').deliverable > 0 &&
        Number.isFinite(d(id)),
    )
    .sort((a, b) => d(a) - d(b) || (a < b ? -1 : 1));
  const group = groups[0];
  if (group === undefined) return terminating(candidates);
  const hop = [...(adjacency(state).get(group) ?? [])]
    .filter((x) => d(x) === d(group) - 1)
    .sort()[0];
  const activation = candidates.find((c) => c.kind === 'activate' && c.systemId === hop);
  return activation?.command ?? terminating(candidates);
};

/**
 * `R-ACTIVE` — every round one activation of a NON-base system with one move into it (never touching the
 * base), then PASS.
 */
export const activeRebels: HumanScript = (state) => {
  const candidates = candidatesOf(state);
  const base = state.rebelBase.systemId;
  if (state.activation !== null) {
    if (movesInActivation(state, 'rebels') > 0) return terminating(candidates);
    const move = candidates.find(
      (c) => c.command.type === 'MOVE_PIECES' && c.command.fromSystemId !== base,
    );
    return move?.command ?? terminating(candidates);
  }
  if (activatedThisRound(state, 'rebels') > 0) return terminating(candidates);
  const pinned = new Set(
    state.leaders.filter((l) => l.owner === 'rebels' && l.systemId !== null).map((l) => l.systemId),
  );
  const adj = adjacency(state);
  // A non-base system next to a free, non-base Rebel group that has a ship to move.
  const sources = new Set(
    state.units
      .filter((u) => {
        if (u.owner !== 'rebels' || u.systemId === base || pinned.has(u.systemId)) return false;
        const type = state.unitTypes.find((t) => t.typeKey === u.typeKey);
        return type?.mobility === 'mobile' && !type.requiresTransport;
      })
      .map((u) => u.systemId),
  );
  const activation = candidates.find(
    (c) =>
      c.kind === 'activate' &&
      c.systemId !== null &&
      c.systemId !== base &&
      (adj.get(c.systemId) ?? []).some((s) => sources.has(s)),
  );
  return activation?.command ?? terminating(candidates);
};

/** The bot itself on the human seat (bot-vs-bot property games); `difficulty` of that seat. */
export function botHuman(difficulty: Difficulty): HumanScript {
  return (state) => {
    const view = toSideView(state, state.activeSide);
    const first = rankCandidates(view, difficulty, botSeed(view))[0];
    if (!first) throw new Error('botHuman: no candidate');
    return first.command;
  };
}

// ---------------------------------------------------------------------------------------------------------
// Per-game metrics (TC-DIF-*, TC-OUT-*)
// ---------------------------------------------------------------------------------------------------------

export interface GameMetrics {
  readonly sessionId: string;
  readonly base: string;
  readonly winner: Faction | null;
  readonly reason: string | null;
  readonly finalRound: number;
  /** Round of `BASE_REVEALED`, 14 when never revealed (TC-DIF-05). */
  readonly revealRound: number;
  readonly revealed: boolean;
  /** Commands after which the base held no Rebel unit (checked after EVERY command, Q-15). */
  readonly emptyBaseStates: number;
  /** `emptyBaseStates > 0`. */
  readonly emptiedBase: boolean;
  /** AI-Rebel commands that emptied the base WITHOUT a threat in the state before them (TC-DIF-03). */
  readonly emptyingsWithoutThreat: number;
  /** Rebel `MOVE_PIECES` out of the base (TC-DIF-04). */
  readonly movesOutOfBase: number;
  /** AI-Empire activations before the reveal, and rounds played (even partly) before it (TC-DIF-07). */
  readonly empireActivationsBeforeReveal: number;
  readonly roundsBeforeReveal: number;
  /** TC-DIF-06: pre-reveal AI-Empire activations with ≥ 1 ground move / of systems already searched. */
  readonly activationsWithGround: number;
  readonly activationsOfSearched: number;
  /** Longest automated run (steps) and number of commands. */
  readonly maxRun: number;
  readonly commands: number;
}

export function gameMetrics(result: SimResult): GameMetrics {
  const { final, records } = result;
  const base = final.rebelBase.systemId ?? '';
  const revealEvent = final.log.find((e) => e.type === 'BASE_REVEALED');
  let revealRound = 14;
  if (revealEvent) {
    const rec = records.find((r) => r.events.some((e) => e.type === 'BASE_REVEALED'));
    revealRound = rec?.before.round ?? 14;
  }
  let emptyBaseStates = 0;
  let emptyingsWithoutThreat = 0;
  let movesOutOfBase = 0;
  let empireActivationsBeforeReveal = 0;
  let activationsWithGround = 0;
  let activationsOfSearched = 0;
  let currentActivation: { ground: boolean } | null = null;
  const closeActivation = () => {
    if (currentActivation?.ground) activationsWithGround += 1;
    currentActivation = null;
  };
  for (const r of records) {
    if (emptyBase(r.after)) {
      emptyBaseStates += 1;
      if (r.by === 'ai' && r.actor === 'rebels' && !emptyBase(r.before) && !threat(r.before)) {
        emptyingsWithoutThreat += 1;
      }
    }
    for (const e of r.events) {
      if (e.type === 'PIECES_MOVED' && e.actor === 'rebels' && e.payload.fromSystemId === base) {
        movesOutOfBase += 1;
      }
    }
    const preReveal = !r.before.rebelBase.revealed;
    if (r.by === 'ai' && r.actor === 'empire' && preReveal) {
      for (const e of r.events) {
        if (e.type === 'SYSTEM_ACTIVATED' && e.actor === 'empire') {
          closeActivation();
          empireActivationsBeforeReveal += 1;
          if (deriveBaseIntel(toSideView(r.before, 'empire')).searched.has(e.payload.systemId)) {
            activationsOfSearched += 1;
          }
          currentActivation = { ground: false };
        }
        if (e.type === 'PIECES_MOVED' && e.actor === 'empire' && currentActivation) {
          const ids = new Set(e.payload.pieceIds);
          const ground = r.after.units.some((u) => ids.has(u.id) && isGroundType(u.typeKey));
          if (ground) currentActivation.ground = true;
        }
        if (e.type === 'ACTIVATION_FINISHED' && e.actor === 'empire') closeActivation();
      }
    }
  }
  closeActivation();
  const preRevealRounds = new Set(
    records.filter((r) => !r.before.rebelBase.revealed).map((r) => r.before.round),
  );
  const roundsBeforeReveal = Math.max(1, preRevealRounds.size);
  return {
    sessionId: result.sessionId,
    base,
    winner: final.outcome?.winner ?? null,
    reason: final.outcome?.reason ?? null,
    finalRound: final.round,
    revealRound,
    revealed: revealEvent !== undefined,
    emptyBaseStates,
    emptiedBase: emptyBaseStates > 0,
    emptyingsWithoutThreat,
    movesOutOfBase,
    empireActivationsBeforeReveal,
    roundsBeforeReveal,
    activationsWithGround,
    activationsOfSearched,
    maxRun: Math.max(0, ...result.runs),
    commands: records.length,
  };
}

export const mean = (xs: readonly number[]): number =>
  xs.length === 0 ? 0 : xs.reduce((a, b) => a + b, 0) / xs.length;
