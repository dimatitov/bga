/**
 * SWR-010 FE-A (plan-frontend §4.1, §5): pure model of the Card Hand tab built only from the server view.
 * Zones are classified by their own fields (`owner`, `kind`) — zone ids are not hard-coded, so future zones keep
 * working. Nothing hidden is reconstructed: a zone with `cards: null` is shown only by its `count`, the deck order and
 * the opponent's cards never reach the client (the server projects them away), and the rebel base is not read here.
 */
import type { FactionId, PlayerViewCore } from '@bga/game-rebellion/schema';
import { deferredCardTypes } from './catalog';

type CardsView = NonNullable<PlayerViewCore['cards']>;
export type CardZoneView = CardsView['zones'][number];
export type CardZoneKind = CardZoneView['kind'];
export type CardAuthority = CardZoneView['authority'];

export interface ZoneCard {
  instanceId: string;
  definitionId: string;
}

export interface ZoneModel {
  id: string;
  kind: CardZoneKind;
  owner: string | null;
  visibility: CardZoneView['visibility'];
  authority: CardAuthority;
  count: number;
  /** `null` = the viewer sees only the count. */
  cards: ZoneCard[] | null;
}

/**
 * `notRegistered` — physical game, the human Rebels have not registered their Location card yet;
 * `registered` — the viewer's own Location holds a card; `revealed` — the base card is public;
 * `none` — no Location information for this viewer (e.g. the Empire before the reveal).
 */
export type LocationState = 'registered' | 'notRegistered' | 'revealed' | 'none';

export interface HandModel {
  tracked: boolean;
  viewer: FactionId;
  own: ZoneModel[];
  opponent: ZoneModel[];
  deck: ZoneModel | null;
  removed: ZoneModel | null;
  locationState: LocationState;
  deferredTypeIds: string[];
}

function toZoneModel(z: CardZoneView): ZoneModel {
  return {
    id: z.id,
    kind: z.kind,
    owner: z.owner,
    visibility: z.visibility,
    authority: z.authority,
    count: z.count,
    cards: z.cards === null ? null : z.cards.map((c) => ({ ...c })),
  };
}

/** Whether a physical registration of the Location card is pending (`view.table.registration`). */
export function registrationPending(view: PlayerViewCore): boolean {
  return view.table?.registration != null;
}

function locationStateOf(view: PlayerViewCore, zones: ZoneModel[]): LocationState {
  if (registrationPending(view)) return 'notRegistered';
  if (zones.some((z) => z.kind === 'revealed' && z.count > 0)) return 'revealed';
  if (zones.some((z) => z.kind === 'special' && z.owner === view.viewer && z.count > 0))
    return 'registered';
  return 'none';
}

export function handModel(view: PlayerViewCore): HandModel {
  const viewer = view.viewer;
  const deferredTypeIds = deferredCardTypes().map((t) => t.id);
  if (view.cards === null) {
    return {
      tracked: false,
      viewer,
      own: [],
      opponent: [],
      deck: null,
      removed: null,
      locationState: 'none',
      deferredTypeIds,
    };
  }
  const zones = view.cards.zones.map(toZoneModel);
  const opponentSide: FactionId = viewer === 'rebels' ? 'empire' : 'rebels';
  return {
    tracked: true,
    viewer,
    own: zones.filter((z) => z.owner === viewer),
    opponent: zones.filter((z) => z.owner === opponentSide),
    deck: zones.find((z) => z.owner === null && z.kind === 'deck') ?? null,
    removed: zones.find((z) => z.owner === null && z.kind === 'removed') ?? null,
    locationState: locationStateOf(view, zones),
    deferredTypeIds,
  };
}

/** Every card the viewer can see in the hand model (own + revealed opponent + public removed), with its zone. */
export function visibleCards(model: HandModel): { definitionId: string; zone: ZoneModel }[] {
  const zones = [...model.own, ...model.opponent, ...(model.removed ? [model.removed] : [])];
  return zones.flatMap((zone) =>
    (zone.cards ?? []).map((c) => ({ definitionId: c.definitionId, zone })),
  );
}
