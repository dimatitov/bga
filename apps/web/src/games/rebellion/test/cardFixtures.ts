/**
 * SWR-010 FE-A (plan-frontend §10): card views for web tests. `cardsView` builds every zone of
 * `REBELLION_CARD_ZONES`, in that order, exactly as the server projector does (plan-backend §2.4, §4.2): an ordered
 * hidden zone is a count only; an owner zone of the other side is a count only (unless the Location is revealed to the
 * viewer — after the reveal or the end of the game); unordered lists are sorted by `instanceId`. Card ids are real
 * catalog ids. Every factory parses with `PlayerViewSchema` (see `cardFixtures.test.ts`).
 */
import {
  FIRST_GAME_REMOVED_PROBE_SYSTEM_IDS,
  PROBE_SYSTEM_IDS,
  REBELLION_CARD_CATALOG_ID,
  REBELLION_CARD_ZONES,
  probeDefinitionId,
  probeInstanceId,
  type FactionId,
  type PlayerViewCore,
} from '@bga/game-rebellion/schema';
import {
  CORE_EMPIRE_VS_AI,
  CS_YAVIN,
  makeCoreEmpireView,
  makeCoreOutcomeView,
  makeCoreView,
} from './coreFixtures';

type CardsView = NonNullable<PlayerViewCore['cards']>;
type ZoneView = CardsView['zones'][number];

export function probeId(systemId: string): string {
  return probeDefinitionId(systemId);
}

export interface CardsViewOptions {
  /** System of the Rebel Location card (default Yavin, the fixture base); `null` = not registered / empty. */
  location?: string | null;
  /** Probe cards in the Empire's hand (systems), or just a count for the opponent's view. */
  empireProbes?: string[];
  /** The base was revealed: the Location card moved to `rebels-base-revealed`. */
  revealed?: boolean;
  /** The game is over: the Location is visible to both sides. */
  gameOver?: boolean;
  /** Override the deck count (default: the rest of the 31 probe cards). */
  deckCount?: number;
  /** Zones whose authority is `physical` (Physical Hand). */
  physicalZoneIds?: string[];
}

export function cardsView(viewer: FactionId, opts: CardsViewOptions = {}): CardsView {
  const location = opts.location === undefined ? CS_YAVIN : opts.location;
  const probes = opts.empireProbes ?? [];
  const revealed = opts.revealed ?? false;
  const removed = [...FIRST_GAME_REMOVED_PROBE_SYSTEM_IDS];
  const used = removed.length + probes.length + (location === null ? 0 : 1);
  const deckCount = opts.deckCount ?? PROBE_SYSTEM_IDS.length - used;
  const locationVisible = viewer === 'rebels' || revealed || (opts.gameOver ?? false);
  const content: Record<string, string[]> = {
    'probe-deck': [],
    'probe-box': removed,
    'rebels-location': location !== null && !revealed ? [location] : [],
    'rebels-base-revealed': location !== null && revealed ? [location] : [],
    'empire-probes': probes,
  };
  const physical = new Set(opts.physicalZoneIds ?? []);
  const zones: ZoneView[] = REBELLION_CARD_ZONES.map((policy) => {
    const systems = content[policy.id] ?? [];
    const count = policy.id === 'probe-deck' ? deckCount : systems.length;
    const visible =
      !(policy.ordered && policy.visibility !== 'public') &&
      (policy.visibility === 'public' ||
        policy.owner === viewer ||
        (policy.id === 'rebels-location' && locationVisible));
    const cards = visible
      ? systems
          .map((s) => ({ instanceId: probeInstanceId(s), definitionId: probeDefinitionId(s) }))
          .sort((a, b) => a.instanceId.localeCompare(b.instanceId))
      : null;
    return {
      id: policy.id,
      kind: policy.kind,
      owner: policy.owner,
      visibility: policy.visibility,
      ordered: policy.ordered,
      authority: physical.has(policy.id) ? 'physical' : 'digital',
      count,
      cards,
    };
  });
  return { catalogId: REBELLION_CARD_CATALOG_ID, zones };
}

/** Human Rebels vs AI Empire, digital game: own Location (Yavin), the Empire has 2 probes (count only). */
export function makeRebelsDigitalCardsView(
  overrides: Partial<PlayerViewCore> = {},
): PlayerViewCore {
  return makeCoreView({
    cards: cardsView('rebels', { empireProbes: ['hoth', 'endor'] }),
    ...overrides,
  });
}

/** Human Empire vs AI Rebels with its own probe cards (default Hoth and Endor); the Location is a count only. */
export function makeEmpireWithProbesView(
  systems: string[] = ['hoth', 'endor'],
  overrides: Partial<PlayerViewCore> = {},
): PlayerViewCore {
  return makeCoreEmpireView({
    cards: cardsView('empire', { empireProbes: systems }),
    ...overrides,
  });
}

/** Human Empire after the reveal: the base card lies in the public `rebels-base-revealed` zone. */
export function makeEmpireRevealedView(overrides: Partial<PlayerViewCore> = {}): PlayerViewCore {
  return makeCoreEmpireView({
    rebelBase: { systemId: CS_YAVIN, revealed: true },
    cards: cardsView('empire', { empireProbes: ['hoth', 'endor'], revealed: true }),
    ...overrides,
  });
}

/**
 * Human Rebels vs AI Empire, `physical_companion`, before the Location card is registered: the Location zone is
 * physical and empty, `view.table.registration` lists the eligible cards (the task queue is FE-B's concern; here
 * only the registerBase head task is given so the view parses).
 */
export function makeRebelsPhysicalUnregisteredView(
  overrides: Partial<PlayerViewCore> = {},
): PlayerViewCore {
  const base = makeCoreView();
  return makeCoreView({
    settings: { ...base.settings, gameMode: 'physical_companion' },
    legalActions: [],
    cards: cardsView('rebels', { location: null, physicalZoneIds: ['rebels-location'] }),
    table: {
      tasks: [
        {
          id: 't-1-2',
          kind: 'registerBase',
          actor: 'rebels',
          titleKey: 'table.tasks.registerBase',
          createdAtVersion: 1,
          affected: { cardDefinitionIds: [], leaderIds: [], unitIds: [], systemIds: [] },
          steps: [{ key: 'table.steps.registerBaseCard', params: {} }],
          completion: 'register',
        },
      ],
      aiWaiting: false,
      registration: {
        zoneId: 'rebels-location',
        eligibleDefinitionIds: [probeId('yavin'), probeId('hoth'), probeId('dagobah')],
      },
    },
    ...overrides,
  });
}

/** The game is over: both sides see the Location (Q-14). */
export function makeEmpireGameOverCardsView(): PlayerViewCore {
  return makeCoreOutcomeView('rebels', 'timeReachedReputation', {
    viewer: 'empire',
    settings: { ...CORE_EMPIRE_VS_AI },
    cards: cardsView('empire', { gameOver: true }),
  });
}
