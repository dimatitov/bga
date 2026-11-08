/**
 * Deterministic placement of pieces around a system (plan-frontend §4.3). Pure UI layout:
 * Empire on the left arc, Rebellion on the right arc, slots alternate from the arc center.
 */
import type { Faction, Piece, PieceKind } from '@bga/game-rebellion/schema';
import type { MapPoint } from '@bga/game-rebellion/board';
import { ORBIT_RADIUS, PIECE_SIZE, SLOT_STEP_DEG, SLOTS_PER_SIDE } from './constants';

export type LayoutPiece = Pick<Piece, 'id' | 'kind' | 'owner'>;

export interface PieceLayoutResult {
  slots: Map<string, MapPoint>;
  overflow: Record<Faction, number>;
}

const KIND_ORDER: Record<PieceKind, number> = { unit: 0, leader: 1, token: 2 };
const FACTION_ORDER: Record<Faction, number> = { empire: 0, rebels: 1 };
const ARC_CENTER_DEG: Record<Faction, number> = { empire: 180, rebels: 0 };

export function comparePieces(a: LayoutPiece, b: LayoutPiece): number {
  return (
    FACTION_ORDER[a.owner] - FACTION_ORDER[b.owner] ||
    KIND_ORDER[a.kind] - KIND_ORDER[b.kind] ||
    (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)
  );
}

/** Slot offset (in steps) for the n-th piece: 0, +1, −1, +2, −2 … */
function slotOffset(n: number): number {
  return n === 0 ? 0 : n % 2 === 1 ? (n + 1) / 2 : -(n / 2);
}

function pointOnOrbit(center: MapPoint, deg: number, radius = ORBIT_RADIUS): MapPoint {
  const rad = (deg * Math.PI) / 180;
  return { x: center.x + radius * Math.cos(rad), y: center.y + radius * Math.sin(rad) };
}

export function layoutPiecesInSystem(
  center: MapPoint,
  pieces: readonly LayoutPiece[],
): PieceLayoutResult {
  const slots = new Map<string, MapPoint>();
  const overflow: Record<Faction, number> = { empire: 0, rebels: 0 };
  const used: Record<Faction, number> = { empire: 0, rebels: 0 };
  for (const p of [...pieces].sort(comparePieces)) {
    const n = used[p.owner]++;
    if (n >= SLOTS_PER_SIDE) {
      overflow[p.owner]++;
      continue;
    }
    slots.set(p.id, pointOnOrbit(center, ARC_CENTER_DEG[p.owner] + slotOffset(n) * SLOT_STEP_DEG));
  }
  return { slots, overflow };
}

/** Where the "+N" overflow chip of a faction is drawn (outside the arc center). */
export function overflowChipPosition(center: MapPoint, faction: Faction): MapPoint {
  return pointOnOrbit(center, ARC_CENTER_DEG[faction], ORBIT_RADIUS + PIECE_SIZE + 8);
}

/** Snap preview: slot `moving` would take in the target system (same algorithm on the hypothetical set). */
export function previewSlotForMove(
  center: MapPoint,
  piecesAtTarget: readonly LayoutPiece[],
  moving: LayoutPiece,
): MapPoint | null {
  const set = piecesAtTarget.filter((p) => p.id !== moving.id).concat(moving);
  return layoutPiecesInSystem(center, set).slots.get(moving.id) ?? null;
}

/** Slots of every piece on the board, keyed by piece id (pieces of systems without a layout entry are skipped). */
export function layoutAllPieces(
  centers: ReadonlyMap<string, MapPoint>,
  pieces: readonly (LayoutPiece & { systemId: string })[],
): { slots: Map<string, MapPoint>; overflow: Map<string, Record<Faction, number>> } {
  const bySystem = new Map<string, LayoutPiece[]>();
  for (const p of pieces) {
    const list = bySystem.get(p.systemId);
    if (list) list.push(p);
    else bySystem.set(p.systemId, [p]);
  }
  const slots = new Map<string, MapPoint>();
  const overflow = new Map<string, Record<Faction, number>>();
  for (const [systemId, list] of bySystem) {
    const center = centers.get(systemId);
    if (!center) continue;
    const r = layoutPiecesInSystem(center, list);
    for (const [id, pt] of r.slots) slots.set(id, pt);
    overflow.set(systemId, r.overflow);
  }
  return { slots, overflow };
}
