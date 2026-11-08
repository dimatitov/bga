/**
 * Derived data from `view.legalActions` ONLY (plan-frontend §0.2, §3.3). The UI never computes rule
 * legality: these helpers just look up / intersect sets the server already computed.
 */
import type { PlayerViewPlayer } from '@bga/game-rebellion/schema';
import type { DragState } from './dragStore';
import type { Selection } from './selectionStore';

type LegalView = Pick<PlayerViewPlayer, 'legalActions'>;

/** `toSystemIds` of the MOVE_PIECES legal action for this piece, or `[]`. */
export function moveTargetsForPiece(view: LegalView, pieceId: string): string[] {
  for (const a of view.legalActions) {
    if (a.type === 'MOVE_PIECES' && a.pieceId === pieceId) return [...a.toSystemIds];
  }
  return [];
}

/** True if `systemId` is one of the server-provided targets (set membership, not a rule). */
export function isListedTarget(targets: readonly string[], systemId: string): boolean {
  return targets.includes(systemId);
}

/**
 * Group move for a system (D-C-3): pieces of that system that have a MOVE_PIECES legal action; targets are the
 * intersection of their `toSystemIds`. `null` if fewer than 2 such pieces or the intersection is empty.
 */
export function groupMoveForSystem(
  view: Pick<PlayerViewPlayer, 'legalActions' | 'pieces'>,
  systemId: string,
): { pieceIds: string[]; toSystemIds: string[] } | null {
  const inSystem = new Set(view.pieces.filter((p) => p.systemId === systemId).map((p) => p.id));
  const actions = view.legalActions.filter(
    (a): a is Extract<typeof a, { type: 'MOVE_PIECES' }> =>
      a.type === 'MOVE_PIECES' && inSystem.has(a.pieceId) && a.toSystemIds.length > 0,
  );
  if (actions.length < 2) return null;
  const [first, ...rest] = actions;
  if (!first) return null;
  const toSystemIds = first.toSystemIds.filter((t) => rest.every((a) => a.toSystemIds.includes(t)));
  if (toSystemIds.length === 0) return null;
  return { pieceIds: actions.map((a) => a.pieceId).sort(), toSystemIds };
}

export function canAdvancePhase(view: LegalView): boolean {
  return view.legalActions.some((a) => a.type === 'ADVANCE_PHASE');
}

/** Systems highlighted as move targets: the dragged piece's targets, else the selected piece's targets. */
export function highlightedSystemIds(
  view: LegalView,
  selection: Selection,
  drag: Pick<DragState, 'pieceId'> | null,
): string[] {
  if (drag) return moveTargetsForPiece(view, drag.pieceId);
  if (selection.kind === 'piece') return moveTargetsForPiece(view, selection.pieceId);
  return [];
}
