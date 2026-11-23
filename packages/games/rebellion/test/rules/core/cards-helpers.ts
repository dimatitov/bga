/**
 * SWR-010 W3 test helpers for games WITH cards (real base-game data; the mini data map tracks no cards):
 * settings for every mode, a game driver for whole rounds (Refresh), zone accessors and the metamorphic state
 * transforms of the leak tests (test-cases.md: `permuteDeck`, `swapHand`, `relocateBase2`).
 */
import {
  CoreGameStateV3Schema,
  probeInstanceId,
  settingsFromSetupInput,
  type Command,
  type CommandOrigin,
  type CoreGameState,
  type Faction,
  type GameEvent,
  type RebellionSettings,
} from '../../../src/schema';
import { applyCommand, createCoreGame } from '../../../src/rules';
import { coreDataBaseV1 } from '../../../src/scenario';

export const NOW = '2026-11-23T10:00:00.000Z';
export const LATER = '2026-11-23T10:05:00.000Z';

export function settings(
  playerFaction: Faction,
  gameMode: 'digital' | 'physical_companion' = 'digital',
  opponentType: 'ai' | 'human' = 'ai',
): RebellionSettings {
  return settingsFromSetupInput({
    playerFaction,
    opponentType,
    ruleset: 'base',
    gameMode,
    ...(opponentType === 'ai' ? { aiDifficulty: 'normal' } : {}),
  });
}

export const DIG_REB = settings('rebels');
export const DIG_EMP = settings('empire');
export const HOT_SEAT = settings('rebels', 'digital', 'human');
export const PHY_REB = settings('rebels', 'physical_companion');
export const PHY_EMP = settings('empire', 'physical_companion');

export function newGame(s: RebellionSettings = DIG_REB, gameId = 'cards-game-1'): CoreGameState {
  return createCoreGame(s, coreDataBaseV1, { gameId, now: NOW });
}

export function zone(state: CoreGameState, id: string): string[] {
  const z = state.cards?.pile.zones.find((x) => x.id === id);
  if (!z) throw new Error(`no zone ${id}`);
  return z.cards;
}

export function definitionsIn(state: CoreGameState, id: string): string[] {
  const def = new Map(state.cards?.pile.instances.map((i) => [i.id, i.definitionId]));
  return zone(state, id).map((i) => def.get(i) ?? '?');
}

function withZone(state: CoreGameState, id: string, cards: string[]): CoreGameState {
  if (!state.cards) throw new Error('no cards');
  return {
    ...state,
    cards: {
      ...state.cards,
      pile: {
        ...state.cards.pile,
        zones: state.cards.pile.zones.map((z) => (z.id === id ? { ...z, cards } : z)),
      },
    },
  };
}

export interface Step {
  actor: Faction;
  command: Command;
  origin?: CommandOrigin;
}

/** Apply one command (throws on a rejection); returns the next state and the command's events. */
export function step(state: CoreGameState, s: Step): { state: CoreGameState; events: GameEvent[] } {
  const r = applyCommand(
    state,
    { actor: s.actor, expectedVersion: state.version, command: s.command },
    { now: LATER, origin: s.origin ?? 'player' },
  );
  if (!r.ok) throw new Error(`${s.actor} ${s.command.type} rejected: ${r.error.messageKey}`);
  if (r.state.rulesEngine !== 'core-v1') throw new Error('expected core-v1');
  return { state: r.state, events: r.events };
}

/** Both sides pass once (who is AI is taken from the settings) → one Refresh. Digital AI games only. */
export function passRound(state: CoreGameState): { state: CoreGameState; events: GameEvent[] } {
  const ai = state.settings.opponentType === 'ai' ? state.settings.opponentFaction : null;
  let current = state;
  const events: GameEvent[] = [];
  for (let i = 0; i < 2; i += 1) {
    const actor = current.activeSide;
    const r = step(current, {
      actor,
      command: { type: 'PASS' },
      origin: actor === ai ? 'auto' : 'player',
    });
    current = r.state;
    events.push(...r.events);
  }
  return { state: current, events };
}

export function rounds(state: CoreGameState, n: number): CoreGameState {
  let current = state;
  for (let i = 0; i < n; i += 1) current = passRound(current).state;
  return current;
}

/** Same multiset, other deck order (`π` = rotation by `k` + reversal when `k` is odd). */
export function permuteDeck(state: CoreGameState, k: number): CoreGameState {
  const deck = zone(state, 'probe-deck');
  const rotated = [...deck.slice(k % deck.length), ...deck.slice(0, k % deck.length)];
  return withZone(state, 'probe-deck', k % 2 === 1 ? rotated.reverse() : rotated);
}

/**
 * Swap the Empire's probe hand with as many cards of the deck (same positions): the Empire's secret changes,
 * every count stays.
 */
export function swapHand(state: CoreGameState): CoreGameState {
  const hand = zone(state, 'empire-probes');
  const deck = zone(state, 'probe-deck');
  if (deck.length < hand.length) throw new Error('deck too small for swapHand');
  const nextHand = deck.slice(0, hand.length);
  const nextDeck = [...hand, ...deck.slice(hand.length)];
  return withZone(withZone(state, 'empire-probes', nextHand), 'probe-deck', nextDeck);
}

/**
 * Move the hidden base to `to` (plan-backend §10.3: the Location card is exchanged with `to`'s card at the same
 * deck position; Rebel units of the old base follow). Valid only while `to`'s card is in the deck (before it can
 * be drawn) and the base is hidden. Returns a parsed (valid) state.
 */
export function relocateBase(state: CoreGameState, to: string): CoreGameState {
  const from = state.rebelBase.systemId;
  const deck = zone(state, 'probe-deck');
  const at = deck.indexOf(probeInstanceId(to));
  if (at < 0) throw new Error(`card of ${to} is not in the deck`);
  const nextDeck = [...deck];
  nextDeck[at] = probeInstanceId(from);
  const moved = withZone(
    withZone(state, 'probe-deck', nextDeck),
    'rebels-location',
    zone(state, 'rebels-location').length === 1 ? [probeInstanceId(to)] : [],
  );
  return CoreGameStateV3Schema.parse({
    ...moved,
    rebelBase: { ...state.rebelBase, systemId: to },
    units: state.units.map((u) =>
      u.owner === 'rebels' && u.systemId === from ? { ...u, systemId: to } : u,
    ),
  });
}

/** All instance / definition ids of the cards in `zoneId` (search tokens of the leak tests). */
export function secretTokens(state: CoreGameState, zoneId: string): string[] {
  return [...zone(state, zoneId), ...definitionsIn(state, zoneId)];
}

/** `probe-x` must not match inside `probe-x-y`: match as a whole JSON string or as `probe-x#1`. */
export function containsToken(json: string, token: string): boolean {
  return json.includes(`"${token}"`) || json.includes(`"${token}#`);
}
