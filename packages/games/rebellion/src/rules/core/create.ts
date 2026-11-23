/**
 * New `core-v1` game (R-1, R-2, R-10; plan-backend §3.2 with the specification revisions).
 * - static data (map, unit types) is copied into the state (BD-2); only the starting leaders enter (D-7);
 * - unit ids `u-01…` follow `startSetup.units` (data order) and never depend on the base;
 * - the base is `chooseRebelBase(gameId, eligibleRebelBaseSystemIds(data))`; units "on the base" stand in
 *   the base system (D-6);
 * - version 1, time = `startingTime`, reputation = `startingReputation`; the empty assignment phase passes
 *   at once (D-2): log `GAME_CREATED`, `PHASE_STARTED{assignment}`, `PHASE_STARTED{command}`;
 *   `phase: 'command'`, Rebels first (Q-5), nobody passed, no activation, no handoff, no outcome.
 * In an AI game with AI Rebels the result is a transient state (Rebels active): the server's auto-play
 * (W5) applies their move before storing it. Deterministic: same input → same state (Q-24).
 * Invalid settings/data is a programming error → throws (Zod).
 * The built state passes the central state checks once (`runStateChecks`, SWR-008 QD-2). With valid data they
 * change nothing (eligible bases exclude systems with Imperial start units and their neighbours); any event they
 * produced would follow the creation log (`seq` = last `seq` + 1…, `at = ctx.now`; see `checkCreatedState`).
 * SWR-010 (plan-backend §3.4): a game on the base-game map (`CORE_SYSTEM_IDS`) tracks cards (`initCoreCards`; no
 * new creation events). In `physical_companion` with a human Rebel player the base is PROVISIONAL (same
 * `chooseRebelBase`) until the Location card is registered (`REGISTER_CARD`); its card stays in the deck. Other
 * maps (test data) get no `cards`, exactly as before SWR-010.
 */
import {
  CORE_SYSTEM_IDS,
  CoreDataSchema,
  REBELLION_STATE_SCHEMA_VERSION,
  RebellionSettingsSchema,
  eligibleRebelBaseSystemIds,
  type CoreData,
  type CoreEvent,
  type CoreGameState,
  type CoreLeader,
  type CoreUnit,
  type RebellionSettings,
} from '../../schema';
import type { CreateContext } from '../context';
import { chooseRebelBase } from './base';
import { initCoreCards } from './cards';
import { runStateChecks } from './state-checks';
import { initialTableState } from './table';

export function createCoreGame(
  settings: RebellionSettings,
  data: CoreData,
  ctx: CreateContext,
): CoreGameState {
  const parsedSettings = RebellionSettingsSchema.parse(settings);
  // Zod returns fresh objects: this is also the deep copy of the data (input never shared/mutated).
  const parsed = CoreDataSchema.parse(data);
  const baseSystemId = chooseRebelBase(ctx.gameId, eligibleRebelBaseSystemIds(parsed));

  const owners = new Map(parsed.unitTypes.map((t) => [t.typeKey, t.owner]));
  const width = Math.max(2, String(parsed.startSetup.units.length).length);
  const units: CoreUnit[] = parsed.startSetup.units.map((u, i) => {
    const owner = owners.get(u.typeKey);
    if (!owner) throw new Error(`createCoreGame: unknown unit type ${u.typeKey}`);
    return {
      id: `u-${String(i + 1).padStart(width, '0')}`,
      owner,
      typeKey: u.typeKey,
      systemId: u.at.kind === 'system' ? u.at.systemId : baseSystemId,
    };
  });
  const leaders: CoreLeader[] = parsed.startSetup.leaders.map((id) => {
    const leader = parsed.leaders.find((l) => l.id === id);
    if (!leader) throw new Error(`createCoreGame: unknown leader ${id}`);
    return { id, owner: leader.owner, canActivate: leader.canActivate, systemId: null };
  });
  const round = parsed.startSetup.startingTime;

  const created: CoreGameState = {
    schemaVersion: REBELLION_STATE_SCHEMA_VERSION,
    rulesEngine: 'core-v1',
    id: ctx.gameId,
    version: 1,
    settings: parsedSettings,
    activeSide: 'rebels',
    handoffPending: false,
    scenarioId: parsed.id,
    round,
    reputation: parsed.startSetup.startingReputation,
    phase: 'command',
    passed: { rebels: false, empire: false },
    activation: null,
    map: { regions: parsed.regions, systems: parsed.systems },
    unitTypes: parsed.unitTypes,
    units,
    leaders,
    rebelBase: { systemId: baseSystemId, revealed: false },
    outcome: null,
    log: [
      {
        seq: 1,
        type: 'GAME_CREATED',
        actor: 'system',
        payload: { scenarioId: parsed.id },
        at: ctx.now,
      },
      {
        seq: 2,
        type: 'PHASE_STARTED',
        actor: 'system',
        payload: { round, phase: 'assignment' },
        at: ctx.now,
      },
      {
        seq: 3,
        type: 'PHASE_STARTED',
        actor: 'system',
        payload: { round, phase: 'command' },
        at: ctx.now,
      },
    ],
  };
  const cards = cardsOnMap(parsed)
    ? initCoreCards({
        gameId: ctx.gameId,
        settings: parsedSettings,
        baseSystemId,
        registrationPending:
          parsedSettings.gameMode === 'physical_companion' &&
          parsedSettings.playerFaction === 'rebels',
      })
    : undefined;
  if (cards === undefined && parsedSettings.gameMode === 'physical_companion') {
    throw new Error('createCoreGame: physical_companion needs the card catalog map');
  }
  // physical_companion: the table queue of the human (plan-backend §5.3, W4's `initialTableState`).
  const table =
    parsedSettings.gameMode === 'physical_companion'
      ? initialTableState(parsedSettings, eligibleRebelBaseSystemIds(parsed))
      : undefined;
  return checkCreatedState(
    {
      ...created,
      ...(cards === undefined ? {} : { cards }),
      ...(table === undefined ? {} : { table }),
    },
    ctx.now,
  );
}

/** Cards are tracked on the base-game map only: its systems are exactly `CORE_SYSTEM_IDS` (the catalog's map). */
function cardsOnMap(data: CoreData): boolean {
  const ids = new Set(data.systems.map((s) => s.id));
  return ids.size === CORE_SYSTEM_IDS.length && CORE_SYSTEM_IDS.every((id) => ids.has(id));
}

/**
 * The central state checks on a just-built state (SWR-008 QD-2). Events they produce are appended to the log numbered
 * from the LAST `seq` (as `finalize` does, review F-6 — not from the log length), with `at = now`; the version stays
 * (creation is version 1). No drafts → the checked state as is. Exported for the unit test on an artificial state.
 */
export function checkCreatedState(created: CoreGameState, now: string): CoreGameState {
  const checked = runStateChecks({ state: created, drafts: [] });
  if (checked.drafts.length === 0) return checked.state;
  const lastSeq = created.log[created.log.length - 1]?.seq ?? 0;
  return {
    ...checked.state,
    log: [
      ...created.log,
      ...checked.drafts.map(
        (draft, i) => ({ ...draft, seq: lastSeq + i + 1, at: now }) as CoreEvent,
      ),
    ],
  };
}
