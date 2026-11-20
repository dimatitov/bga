/**
 * What the Empire knows about the hidden Rebel base (SWR-006 BD-2, plan-backend §4.4) — derived ONLY from the
 * Empire's own `CorePlayerView` (own pieces are always visible; `view.log` is redacted by the same rule as a
 * human Empire's log). No rules / scenario imports: the true base is physically unavailable here, so every
 * value below is invariant to where the base really is (TC-H-01, §9.3).
 *
 * Sources:
 * 1. `knownBaseId` — `view.rebelBase.systemId` (non-null only after the reveal or the end of the game).
 * 2. `excluded` — systems where Rebel units / leaders / the Rebel activation are VISIBLE (the base is always
 *    shown as the hidden zone, so a visible Rebel system is not the base) and non-null systems of Rebel
 *    `SYSTEM_ACTIVATED` / `PIECES_MOVED` events (events are redacted against the current state).
 * 3. `searched` — reconstruction of own positions: current Imperial units are rewound through Imperial
 *    `PIECES_MOVED` (never redacted) to their starting systems, then replayed; an Imperial activation of X
 *    that finished with an Imperial ground unit in X and was NOT followed by `BASE_REVEALED` proves X is not
 *    the base (rule R-8 evaluated on public data).
 * 4. `startRuleExcluded` — the public first-game setup rule (R-10): the base is never in, or adjacent to, a
 *    system with a starting Imperial unit (Clarifications Q-BE-4: used by hard only).
 * 5. `hintWeight` — a Rebel move from a visible S into the hidden zone (or from the zone to a visible T) shows
 *    that the base is adjacent to S (T): +2 to every neighbour (Q-BE-5: public part of the view).
 */
import { unitTypeRevealsRebelBase, type CorePlayerView, type UnitType } from '../schema';

export interface BaseIntel {
  /** After `BASE_REVEALED` (`view.rebelBase.systemId`), else `null`. */
  readonly knownBaseId: string | null;
  /** Certainly not the base (after the reveal: every other system). */
  readonly excluded: ReadonlySet<string>;
  /** Searched by the Empire without a reveal. */
  readonly searched: ReadonlySet<string>;
  /** Excluded by the public first-game setup rule (only hard uses it, Q-BE-4). */
  readonly startRuleExcluded: ReadonlySet<string>;
  /** Hints from Rebel moves into / out of the hidden zone (Q-BE-5). */
  readonly hintWeight: ReadonlyMap<string, number>;
  /** Rebel units currently in the hidden zone. */
  readonly hiddenRebelUnits: number;
}

export const HINT_WEIGHT = 2;

/** Imperial ground units reveal the base (R-8): same derived predicate as the rules. */
function revealsBase(type: UnitType | undefined): boolean {
  return type !== undefined && unitTypeRevealsRebelBase(type);
}

export function deriveBaseIntel(view: CorePlayerView): BaseIntel {
  if (view.viewer !== 'empire') {
    throw new Error('deriveBaseIntel: only the Empire hunts for the base');
  }
  const systemIds = view.map.systems.map((s) => s.id);
  const adjacency = new Map(view.map.systems.map((s) => [s.id, s.adjacentSystemIds]));
  const types = new Map(view.unitTypes.map((t) => [t.typeKey, t]));
  const knownBaseId = view.rebelBase.systemId;

  // 2. Visible Rebel presence and non-null Rebel event systems.
  const excluded = new Set<string>();
  for (const unit of view.units) {
    if (unit.owner === 'rebels' && unit.location.kind === 'system')
      excluded.add(unit.location.systemId);
  }
  for (const leader of view.leaders) {
    if (leader.owner === 'rebels' && leader.location.kind === 'system')
      excluded.add(leader.location.systemId);
  }
  if (view.activation?.side === 'rebels' && view.activation.location.kind === 'system') {
    excluded.add(view.activation.location.systemId);
  }
  const hintWeight = new Map<string, number>();
  const hint = (around: string) => {
    for (const id of adjacency.get(around) ?? []) {
      hintWeight.set(id, (hintWeight.get(id) ?? 0) + HINT_WEIGHT);
    }
  };
  for (const event of view.log) {
    if (event.actor !== 'rebels') continue;
    if (event.type === 'SYSTEM_ACTIVATED' && event.payload.systemId !== null) {
      excluded.add(event.payload.systemId);
    } else if (event.type === 'PIECES_MOVED') {
      const { fromSystemId, toSystemId } = event.payload;
      if (fromSystemId !== null) excluded.add(fromSystemId);
      if (toSystemId !== null) excluded.add(toSystemId);
      // 5. Hints (only meaningful while the base is hidden; after the reveal nothing is null).
      if (toSystemId === null && fromSystemId !== null) hint(fromSystemId);
      if (fromSystemId === null && toSystemId !== null) hint(toSystemId);
    }
  }
  if (knownBaseId !== null) {
    for (const id of systemIds) if (id !== knownBaseId) excluded.add(id);
    excluded.delete(knownBaseId);
  }

  // 3. Rewind own units to the starting positions, then replay the log.
  const position = new Map<string, string>();
  for (const unit of view.units) {
    if (unit.owner === 'empire' && unit.location.kind === 'system')
      position.set(unit.id, unit.location.systemId);
  }
  for (let i = view.log.length - 1; i >= 0; i -= 1) {
    const event = view.log[i];
    if (event?.type !== 'PIECES_MOVED' || event.actor !== 'empire') continue;
    const from = event.payload.fromSystemId;
    if (from === null) continue; // never happens for Imperial moves
    for (const id of event.payload.pieceIds) if (position.has(id)) position.set(id, from);
  }
  const unitType = new Map(
    view.units.filter((u) => u.owner === 'empire').map((u) => [u.id, types.get(u.typeKey)]),
  );
  // 4. Starting Imperial systems and their neighbours.
  const startRuleExcluded = new Set<string>();
  for (const systemId of position.values()) {
    startRuleExcluded.add(systemId);
    for (const id of adjacency.get(systemId) ?? []) startRuleExcluded.add(id);
  }

  const searched = new Set<string>();
  let activated: string | null = null;
  view.log.forEach((event, i) => {
    if (event.actor !== 'empire') return;
    if (event.type === 'SYSTEM_ACTIVATED') {
      activated = event.payload.systemId;
    } else if (event.type === 'PIECES_MOVED') {
      const to = event.payload.toSystemId;
      if (to === null) return;
      for (const id of event.payload.pieceIds) if (position.has(id)) position.set(id, to);
    } else if (event.type === 'ACTIVATION_FINISHED') {
      const target: string | null = activated;
      activated = null;
      if (target === null) return;
      const groundThere = [...position].some(
        ([id, systemId]) => systemId === target && revealsBase(unitType.get(id)),
      );
      if (groundThere && view.log[i + 1]?.type !== 'BASE_REVEALED') searched.add(target);
    }
  });

  return {
    knownBaseId,
    excluded,
    searched,
    startRuleExcluded,
    hintWeight,
    hiddenRebelUnits: view.units.filter(
      (u) => u.owner === 'rebels' && u.location.kind === 'rebelBase',
    ).length,
  };
}

/** Options of `possibleBaseSystems` (difficulty-dependent knowledge, plan-backend §4.4). */
export interface BaseCandidateOptions {
  /** normal / hard: use `hintWeight` (easy: every candidate weighs 1). */
  readonly useHints: boolean;
  /** hard only (Q-BE-4): drop `startRuleExcluded`. */
  readonly useStartRule: boolean;
}

/**
 * Systems that may still hold the base, with weights `1 + hintWeight` (map order). After the reveal: the
 * known base alone. Never empty while the base is hidden unless the view is inconsistent (then: map minus
 * excluded/searched without the start rule, and finally the whole map).
 */
export function possibleBaseSystems(
  view: CorePlayerView,
  intel: BaseIntel,
  options: BaseCandidateOptions,
): Map<string, number> {
  if (intel.knownBaseId !== null) return new Map([[intel.knownBaseId, 1]]);
  const systemIds = view.map.systems.map((s) => s.id);
  const weigh = (ids: string[]) =>
    new Map(ids.map((id) => [id, 1 + (options.useHints ? (intel.hintWeight.get(id) ?? 0) : 0)]));
  const open = systemIds.filter((id) => !intel.excluded.has(id) && !intel.searched.has(id));
  const strict = options.useStartRule
    ? open.filter((id) => !intel.startRuleExcluded.has(id))
    : open;
  if (strict.length > 0) return weigh(strict);
  if (open.length > 0) return weigh(open);
  return weigh(systemIds);
}
