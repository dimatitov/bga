/**
 * Fixtures of the SWR-010 Physical Sync v0 tests (W4): `physical_companion` games on the REAL base-game map (the
 * probe-card catalog names its systems). `createCoreGame` builds the cards (W3) and the table (`initialTableState`).
 * Every built state is parsed with the full stored-state schema.
 */
import {
  CoreGameStateV3Schema,
  eligibleRebelBaseSystemIds,
  probeDefinitionId,
  settingsFromSetupInput,
  type Command,
  type CoreGameState,
  type Faction,
  type GameEvent,
  type RebellionSettings,
} from '../../../src/schema';
import { coreDataBaseV1 } from '../../../src/scenario';
import { chooseRebelBase, createCoreGame } from '../../../src/rules';
import { NOW, ok } from './helpers';

export const ELIGIBLE = eligibleRebelBaseSystemIds(coreDataBaseV1);

export function physicalSettings(human: Faction): RebellionSettings {
  return settingsFromSetupInput({
    playerFaction: human,
    opponentType: 'ai',
    aiDifficulty: 'normal',
    ruleset: 'base',
    gameMode: 'physical_companion',
  });
}

export function digitalSettings(human: Faction): RebellionSettings {
  return settingsFromSetupInput({
    playerFaction: human,
    opponentType: 'ai',
    aiDifficulty: 'normal',
    ruleset: 'base',
    gameMode: 'digital',
  });
}

/** A game id whose (provisional) base is `base` on the real map. */
export function realGameIdWithBase(base: string, prefix = 'phys'): string {
  for (let i = 0; i < 10_000; i += 1) {
    const id = `${prefix}-${i}`;
    if (chooseRebelBase(id, ELIGIBLE) === base) return id;
  }
  throw new Error(`fixture: no game id for base ${base}`);
}

/** A new game on the real map, parsed as a stored state. */
export function realGame(settings: RebellionSettings, gameId: string): CoreGameState {
  return CoreGameStateV3Schema.parse(
    createCoreGame(settings, coreDataBaseV1, { gameId, now: NOW }),
  );
}

export function physicalGame(human: Faction, base = 'rodia'): CoreGameState {
  return realGame(physicalSettings(human), realGameIdWithBase(base));
}

export const confirm = (taskId: string): Command => ({ type: 'CONFIRM_TABLE_TASK', taskId });
export const register = (systemId: string, zoneId = 'rebels-location'): Command => ({
  type: 'REGISTER_CARD',
  zoneId,
  definitionId: probeDefinitionId(systemId),
});

/** Confirm every confirmable head task (the human player), stopping at a `registerBase` head. */
export function confirmAll(state: CoreGameState): CoreGameState {
  let current = state;
  for (;;) {
    const head = current.table?.tasks[0];
    if (!head || head.completion !== 'confirm') return current;
    current = humanOk(current, confirm(head.id)).state;
  }
}

/** Human Rebels: confirm the initial setup and register the Location at `systemId` (default: the provisional base). */
export function registeredRebels(base = 'rodia', systemId = base): CoreGameState {
  const created = confirmAll(physicalGame('rebels', base));
  return humanOk(created, register(systemId)).state;
}

/** Apply as the AI side (`origin: 'auto'`); the result must be a valid stored state. */
export function aiOk(
  state: CoreGameState,
  command: Command,
): { state: CoreGameState; events: GameEvent[] } {
  const result = ok(state, state.settings.opponentFaction, command, { origin: 'auto' });
  return { state: CoreGameStateV3Schema.parse(result.state), events: result.events };
}

/** Apply as the human player; the result must be a valid stored state. */
export function humanOk(
  state: CoreGameState,
  command: Command,
): { state: CoreGameState; events: GameEvent[] } {
  const result = ok(state, state.settings.playerFaction, command);
  return { state: CoreGameStateV3Schema.parse(result.state), events: result.events };
}

/** Every task / step value of the queue as one JSON string (leak scans). */
export function tableJson(state: CoreGameState): string {
  return JSON.stringify(state.table ?? null);
}
