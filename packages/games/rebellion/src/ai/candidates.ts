/**
 * Concrete candidate commands from the templates of `view.legalActions` (SWR-006 plan-backend §4.2).
 * Deterministic, bounded and engine-legal by construction:
 * - `ACTIVATE_SYSTEM`: every leader × system pair of the template (≤ 4 × 32);
 * - `MOVE_PIECES`: per template (one per adjacent source) at most 5 subsets of the template's pieces, each with
 *   `required ≤ available` capacity by construction (riders never exceed the capacity of the chosen carriers);
 *   empty subsets are skipped and equal subsets merged (their variants are kept);
 * - `FINISH_ACTIVATION`, `PASS` — as in the template.
 * The template already filtered owner, mobility, pinning by an own leader and adjacency; pieces are only taken
 * from it, so nothing here can name a piece or system the actor cannot see.
 */
import type { CoreLegalAction, CorePlayerView, UnitType } from '../schema';
import type { BotCandidate, MoveVariant } from './types';

type Piece = Extract<CoreLegalAction, { type: 'MOVE_PIECES' }>['pieces'][number];

interface Classified {
  /** Mobile ships with capacity > 0, by capacity desc then id. */
  carriers: Piece[];
  /** Ships without capacity and without the transport restriction (x-wing, y-wing). */
  ships0: Piece[];
  /** Pieces that require transport: ground first, then the rest (TIE), each group by id. */
  riders: Piece[];
  groundRiders: Piece[];
}

function byId(a: Piece, b: Piece): number {
  return a.pieceId < b.pieceId ? -1 : a.pieceId > b.pieceId ? 1 : 0;
}

function classify(pieces: readonly Piece[], typeOfPiece: (id: string) => UnitType | undefined) {
  const carriers = pieces
    .filter((p) => !p.requiresTransport && p.transportCapacity > 0)
    .sort((a, b) => b.transportCapacity - a.transportCapacity || byId(a, b));
  const ships0 = pieces.filter((p) => !p.requiresTransport && p.transportCapacity === 0).sort(byId);
  const isGround = (p: Piece) => typeOfPiece(p.pieceId)?.arena === 'ground';
  const groundRiders = pieces.filter((p) => p.requiresTransport && isGround(p)).sort(byId);
  const otherRiders = pieces.filter((p) => p.requiresTransport && !isGround(p)).sort(byId);
  return {
    carriers,
    ships0,
    riders: [...groundRiders, ...otherRiders],
    groundRiders,
  } satisfies Classified;
}

const capacityOf = (carriers: readonly Piece[]) =>
  carriers.reduce((sum, p) => sum + p.transportCapacity, 0);

/**
 * Rebels only: free capacity of the fleet outside the base after it takes every mobile ground unit of the base
 * (`spare-load(k)`, plan-backend §4.5). `null` when the base is unknown to the viewer.
 */
export function rebelSpareCapacity(view: CorePlayerView): number | null {
  if (view.viewer !== 'rebels') return null;
  const baseId = view.rebelBase.systemId;
  if (baseId === null) return null;
  const types = new Map(view.unitTypes.map((t) => [t.typeKey, t]));
  let fleet = 0;
  let groundInBase = 0;
  for (const unit of view.units) {
    if (unit.owner !== 'rebels' || unit.location.kind !== 'system') continue;
    const type = types.get(unit.typeKey);
    if (!type || type.mobility !== 'mobile') continue;
    const inBase = unit.location.systemId === baseId;
    if (!type.requiresTransport && !inBase) fleet += type.transportCapacity;
    if (type.requiresTransport && type.arena === 'ground' && inBase) groundInBase += 1;
  }
  return Math.max(0, fleet - groundInBase);
}

/** The ≤ 5 subsets of one `MOVE_PIECES` template, in variant order (may contain duplicates / empties). */
export function moveSubsets(
  pieces: readonly Piece[],
  typeOfPiece: (id: string) => UnitType | undefined,
  spareLoad: number | null,
): { variant: MoveVariant; pieces: Piece[] }[] {
  const { carriers, ships0, riders, groundRiders } = classify(pieces, typeOfPiece);
  const out: { variant: MoveVariant; pieces: Piece[] }[] = [];
  const totalCap = capacityOf(carriers);

  // 1. all-fit
  out.push({
    variant: 'all-fit',
    pieces: [...carriers, ...ships0, ...riders.slice(0, Math.min(riders.length, totalCap))],
  });
  // 2. ground-strike: minimal carrier prefix covering the ground riders (or all carriers)
  if (groundRiders.length > 0 && carriers.length > 0) {
    const chosen: Piece[] = [];
    let cap = 0;
    for (const carrier of carriers) {
      if (cap >= groundRiders.length) break;
      chosen.push(carrier);
      cap += carrier.transportCapacity;
    }
    out.push({
      variant: 'ground-strike',
      pieces: [...chosen, ...groundRiders.slice(0, Math.min(groundRiders.length, cap))],
    });
  }
  // 3. ships-only
  out.push({ variant: 'ships-only', pieces: [...carriers, ...ships0] });
  // 4. one-carrier: the largest carrier + up to its capacity of ground riders
  const largest = carriers[0];
  if (largest) {
    out.push({
      variant: 'one-carrier',
      pieces: [largest, ...groundRiders.slice(0, largest.transportCapacity)],
    });
  }
  // 5. spare-load(k): the fleet + at most k ground riders (Rebels only)
  if (spareLoad !== null) {
    const k = Math.min(spareLoad, totalCap, groundRiders.length);
    out.push({
      variant: 'spare-load',
      pieces: [...carriers, ...ships0, ...groundRiders.slice(0, k)],
    });
  }
  return out;
}

function compareKeys(a: BotCandidate, b: BotCandidate): number {
  return a.key < b.key ? -1 : a.key > b.key ? 1 : 0;
}

/**
 * Every candidate of the view (empty when it is not the viewer's turn). Order: template order (activation
 * pairs system-major in map order, leaders in template order; move templates in map order with their
 * variants; FINISH; PASS) — deterministic; ranking re-sorts anyway.
 */
export function enumerateCandidates(view: CorePlayerView): BotCandidate[] {
  const types = new Map(view.unitTypes.map((t) => [t.typeKey, t]));
  const unitType = new Map(view.units.map((u) => [u.id, types.get(u.typeKey)]));
  const typeOfPiece = (id: string) => unitType.get(id);
  const spareLoad = rebelSpareCapacity(view);
  const out: BotCandidate[] = [];

  for (const action of view.legalActions) {
    switch (action.type) {
      case 'ACTIVATE_SYSTEM':
        for (const systemId of action.systemIds) {
          for (const leaderId of action.leaderIds) {
            out.push({
              key: `A|${leaderId}|${systemId}`,
              kind: 'activate',
              command: { type: 'ACTIVATE_SYSTEM', leaderId, systemId },
              systemId,
            });
          }
        }
        break;
      case 'MOVE_PIECES': {
        const merged = new Map<string, { pieceIds: string[]; variants: Set<MoveVariant> }>();
        for (const subset of moveSubsets(action.pieces, typeOfPiece, spareLoad)) {
          if (subset.pieces.length === 0) continue;
          const pieceIds = subset.pieces.map((p) => p.pieceId).sort();
          const key = `M|${action.fromSystemId}>${action.toSystemId}|${pieceIds.join(',')}`;
          const entry = merged.get(key);
          if (entry) entry.variants.add(subset.variant);
          else merged.set(key, { pieceIds, variants: new Set([subset.variant]) });
        }
        for (const [key, { pieceIds, variants }] of merged) {
          out.push({
            key,
            kind: 'move',
            command: {
              type: 'MOVE_PIECES',
              pieceIds,
              fromSystemId: action.fromSystemId,
              toSystemId: action.toSystemId,
            },
            systemId: action.toSystemId,
            variants: [...variants].sort(),
          });
        }
        break;
      }
      case 'FINISH_ACTIVATION':
        out.push({
          key: 'F',
          kind: 'finish',
          command: { type: 'FINISH_ACTIVATION' },
          systemId: null,
        });
        break;
      case 'PASS':
        out.push({ key: 'P', kind: 'pass', command: { type: 'PASS' }, systemId: null });
        break;
      default: {
        const unreachable: never = action;
        return unreachable;
      }
    }
  }
  return out;
}

/** Candidates sorted by key (stable, locale-independent). */
export function sortByKey<T extends BotCandidate>(candidates: readonly T[]): T[] {
  return [...candidates].sort(compareKeys);
}

/** The terminating action of the view (`FINISH_ACTIVATION` or `PASS`), if legal. */
export function isTerminating(candidate: Pick<BotCandidate, 'kind'>): boolean {
  return candidate.kind === 'finish' || candidate.kind === 'pass';
}
