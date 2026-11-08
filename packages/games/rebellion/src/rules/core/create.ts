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
 */
import {
  CoreDataSchema,
  REBELLION_STATE_SCHEMA_VERSION,
  RebellionSettingsSchema,
  eligibleRebelBaseSystemIds,
  type CoreData,
  type CoreGameState,
  type CoreLeader,
  type CoreUnit,
  type RebellionSettings,
} from '../../schema';
import type { CreateContext } from '../context';
import { chooseRebelBase } from './base';

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

  return {
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
}
