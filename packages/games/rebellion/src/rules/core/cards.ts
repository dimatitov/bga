/**
 * SWR-010 card engine of `core-v1` (plan-backend §3.4–3.6, §5.6; AC-4, AC-6, AC-10). Rebellion's rules decide
 * WHICH card transitions happen; the zone mechanics are the platform deck engine (`@bga/platform/cards`).
 * - `initCoreCards` — the probe deck at creation (first-game removals → `probe-box`, the base card → the Rebels'
 *   Location, the rest shuffled with the seed `<gameId>|probe-deck|init`);
 * - `drawProbeCards` — Refresh step 3: the Empire draws up to 2 probe cards (A-6, A-8);
 * - `revealLocationCard` — base reveal: the Location card goes onto the public "Rebel Base" space;
 * - `validateRegisterLocation` / `applyRegisterLocation` — Physical Hand: the human Rebels register the Location
 *   card they hold (`physical_companion`), the deck is reshuffled (setup rule 9) and the base is fixed.
 * Every function is a no-op without `state.cards` (games created before SWR-010 never get cards). Pure and
 * deterministic; a platform error here means a corrupt state or a programming error → throws (never reaches the
 * wire). The projections of the card state live in `./redact` (the single redaction point).
 */
import {
  drawCards,
  registerCard,
  revealCard,
  shuffleZone,
  createPile,
  type CardAuthority,
  type CardPile,
  type CardResult,
} from '@bga/platform/cards';
import {
  FIRST_GAME_REMOVED_PROBE_SYSTEM_IDS,
  PROBE_SYSTEM_IDS,
  REBELLION_CARD_CATALOG_ID,
  REBELLION_CARD_ZONES,
  REBELLION_ERROR_MESSAGE_KEYS as K,
  probeDefinitionId,
  probeInstanceId,
  probeSystemOf,
  rebellionCardEngineContext as ctx,
  type CoreCardsState,
  type CoreGameState,
  type Faction,
  type RebellionSettings,
  type RegisterCardCommand,
} from '../../schema';
import type { CoreError } from '../result';
import { illegal, type Transition } from './helpers';

/** Refresh step 3 (KB `rebellion:cards.probe`, RR p.10): the Empire draws 2 probe cards. */
export const PROBES_PER_REFRESH = 2;
/** The Rebels' Location zone (secret: owner-only until the reveal or the end of the game). */
export const LOCATION_ZONE_ID = 'rebels-location';

/** The platform's result or a thrown error (only a corrupt state / programming error can fail here). */
function must(result: CardResult, what: string): { pile: CardPile; moved: string[] } {
  if (!result.ok) throw new Error(`core-v1 cards: ${what} failed (${result.error.code})`);
  return { pile: result.pile, moved: result.moved };
}

function withPile(state: CoreGameState, pile: CardPile): CoreGameState {
  if (state.cards === undefined) throw new Error('core-v1 cards: no card state');
  return { ...state, cards: { ...state.cards, pile } };
}

function definitionOf(pile: CardPile, instanceId: string): string {
  const definitionId = pile.instances.find((i) => i.id === instanceId)?.definitionId;
  if (definitionId === undefined) throw new Error('core-v1 cards: unknown card instance');
  return definitionId;
}

/**
 * Card state of a new game (plan-backend §3.4). `registrationPending` (`physical_companion` with a human Rebel
 * player): the Location stays empty and the base card stays in the deck (26 cards) until `REGISTER_CARD`.
 * Zone authority (§3.3): the Location is `physical` exactly when the human Rebels hold it at the table; every
 * other zone is `digital` (the probe deck always is, D-4/A-10). Throws only on a programming error.
 */
export function initCoreCards(a: {
  gameId: string;
  settings: RebellionSettings;
  baseSystemId: string;
  registrationPending: boolean;
}): CoreCardsState {
  const baseCard = probeInstanceId(a.baseSystemId);
  if (probeSystemOf(probeDefinitionId(a.baseSystemId)) === null) {
    throw new Error('core-v1 cards: the base system has no probe card');
  }
  const instances = PROBE_SYSTEM_IDS.map((systemId) => ({
    id: probeInstanceId(systemId),
    definitionId: probeDefinitionId(systemId),
  }));
  const box = FIRST_GAME_REMOVED_PROBE_SYSTEM_IDS.map((systemId) => probeInstanceId(systemId));
  if (box.includes(baseCard)) throw new Error('core-v1 cards: the base card is out of the game');
  const location = a.registrationPending ? [] : [baseCard];
  const placed = new Set([...box, ...location]);
  const physicalLocation =
    a.settings.gameMode === 'physical_companion' && a.settings.playerFaction === 'rebels';
  const authority: Record<string, CardAuthority> = Object.fromEntries(
    REBELLION_CARD_ZONES.map((zone) => [
      zone.id,
      zone.id === LOCATION_ZONE_ID && physicalLocation ? 'physical' : 'digital',
    ]),
  );
  const created = must(
    createPile(ctx, {
      instances,
      placement: {
        'probe-deck': instances.map((i) => i.id).filter((id) => !placed.has(id)),
        'probe-box': box,
        [LOCATION_ZONE_ID]: location,
      },
      authority,
    }),
    'createPile',
  );
  const shuffled = must(
    shuffleZone(created.pile, ctx, 'probe-deck', `${a.gameId}|probe-deck|init`),
    'shuffle',
  );
  return { catalogId: REBELLION_CARD_CATALOG_ID, pile: shuffled.pile };
}

/**
 * Refresh step 3 (D-7, A-8): the Empire draws up to `PROBES_PER_REFRESH` cards from the top of the probe deck into
 * its hand (`empire-probes`; drawn probes stay there, A-6). Event `CARDS_DRAWN` (actor `system`) when ≥ 1 card was
 * drawn; an empty deck draws nothing and adds no event. No-op without `state.cards`.
 */
export function drawProbeCards(t: Transition): Transition {
  const { cards } = t.state;
  if (cards === undefined) return t;
  const drawn = must(
    drawCards(cards.pile, ctx, {
      from: 'probe-deck',
      to: 'empire-probes',
      count: PROBES_PER_REFRESH,
      allowShort: true,
    }),
    'draw',
  );
  if (drawn.moved.length === 0) return t;
  return {
    state: withPile(t.state, drawn.pile),
    drafts: [
      ...t.drafts,
      {
        type: 'CARDS_DRAWN',
        actor: 'system',
        payload: {
          side: 'empire',
          fromZoneId: 'probe-deck',
          toZoneId: 'empire-probes',
          count: drawn.moved.length,
          definitionIds: drawn.moved.map((id) => definitionOf(drawn.pile, id)),
        },
      },
    ],
  };
}

/**
 * Base reveal (plan-backend §3.6): the Location card goes onto the public "Rebel Base" space
 * (`rebels-base-revealed`). No own event (`BASE_REVEALED` says it). No-op without `state.cards`.
 */
export function revealLocationCard(t: Transition): Transition {
  const { cards } = t.state;
  if (cards === undefined) return t;
  const moved = must(
    revealCard(cards.pile, ctx, {
      instanceId: probeInstanceId(t.state.rebelBase.systemId),
      from: LOCATION_ZONE_ID,
      to: 'rebels-base-revealed',
    }),
    'reveal',
  );
  return { state: withPile(t.state, moved.pile), drafts: t.drafts };
}

/**
 * `REGISTER_CARD` rules checks (plan-backend §5.5, the part after the table branch's 409 / no table /
 * `notYourSide`): `gameOver` → `registrationUnavailable` (nothing to register, wrong zone) → `unknownCard` (not a
 * probe card of the catalog) → `cardNotEligible` (system outside the eligible base systems, A-7).
 * `details` only echo the request.
 */
export function validateRegisterLocation(
  state: CoreGameState,
  actor: Faction,
  c: RegisterCardCommand,
): CoreError | null {
  if (state.outcome !== null) return illegal(K.gameOver, { actor });
  const echo = { zoneId: c.zoneId, definitionId: c.definitionId };
  const registration = state.table?.baseRegistration ?? null;
  if (
    registration === null ||
    state.cards === undefined ||
    actor !== 'rebels' ||
    c.zoneId !== LOCATION_ZONE_ID
  ) {
    return illegal(K.registrationUnavailable, echo);
  }
  const systemId = probeSystemOf(c.definitionId);
  if (systemId === null) return illegal(K.unknownCard, echo);
  if (!registration.eligibleSystemIds.includes(systemId)) return illegal(K.cardNotEligible, echo);
  return null;
}

/**
 * Physical Hand registration (plan-backend §5.6; validated by `validateRegisterLocation`):
 * 1. the card leaves the probe deck for the (physical) Location;
 * 2. the deck is reshuffled with the seed `<gameId>|probe-deck|registered` (setup rule 9);
 * 3. the base becomes the card's system; the Rebel units of the provisional base move there (no command was
 *    played before the registration and eligible systems hold no starting units — anything else is a corrupt
 *    state → throws);
 * 4. event `CARD_REGISTERED` (actor = the human Rebels; redacted for the Empire until the reveal).
 * The table queue (`registerBase` task, `baseRegistration`) is W4's `completeRegistration`.
 */
export function applyRegisterLocation(
  state: CoreGameState,
  actor: Faction,
  c: RegisterCardCommand,
): Transition {
  if (state.cards === undefined || state.rebelBase.revealed) {
    throw new Error('core-v1 cards: registration without a pending Location');
  }
  const systemId = probeSystemOf(c.definitionId);
  if (systemId === null) throw new Error('core-v1 cards: registration of a non-probe card');
  const registered = must(
    registerCard(state.cards.pile, ctx, {
      definitionId: c.definitionId,
      from: 'probe-deck',
      to: LOCATION_ZONE_ID,
    }),
    'register',
  );
  const reshuffled = must(
    shuffleZone(registered.pile, ctx, 'probe-deck', `${state.id}|probe-deck|registered`),
    'shuffle',
  );
  const provisional = state.rebelBase.systemId;
  if (systemId !== provisional) {
    const corrupt = state.units.some(
      (u) => u.systemId === systemId || (u.systemId === provisional && u.owner !== 'rebels'),
    );
    if (corrupt || state.leaders.some((l) => l.systemId !== null) || state.activation !== null) {
      throw new Error('core-v1 cards: the board changed before the base registration');
    }
  }
  return {
    state: {
      ...withPile(state, reshuffled.pile),
      rebelBase: { systemId, revealed: false },
      units: state.units.map((u) =>
        u.owner === 'rebels' && u.systemId === provisional ? { ...u, systemId } : u,
      ),
    },
    drafts: [
      {
        type: 'CARD_REGISTERED',
        actor,
        payload: { zoneId: LOCATION_ZONE_ID, definitionId: c.definitionId },
      },
    ],
  };
}
