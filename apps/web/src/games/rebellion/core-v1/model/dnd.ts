/**
 * Drag-and-drop of a leader from the pool onto the map (SWR-005 plan-frontend §5, Q-FE-10). HTML5 DnD payload:
 * a private MIME type so foreign drags (text, files) are never taken for a leader. The drop target still checks
 * the leader/system against `legalActions` (`viewModel.canActivate`) — the payload is only an id.
 */
export const LEADER_DND_MIME = 'application/x-swr-leader';

/** Minimal `DataTransfer` surface (testable without a browser). */
export interface DataTransferLike {
  readonly types: readonly string[] | DOMStringList;
  getData(format: string): string;
  setData?(format: string, data: string): void;
}

const LEADER_ID = /^[a-z0-9][a-z0-9-]*$/;

export function isLeaderId(value: string): boolean {
  return LEADER_ID.test(value);
}

/** Writes the leader id into a drag start event's `dataTransfer` (`effectAllowed` is the caller's choice). */
export function encodeLeaderDrag(dt: Pick<DataTransferLike, 'setData'>, leaderId: string): void {
  if (!isLeaderId(leaderId)) throw new Error(`Invalid leader id: ${leaderId}`);
  dt.setData?.(LEADER_DND_MIME, leaderId);
}

/** Whether a drag carries a leader (readable during `dragover`, when `getData` is still empty). */
export function hasLeaderDrag(dt: Pick<DataTransferLike, 'types'> | null | undefined): boolean {
  if (!dt) return false;
  return Array.from(dt.types as ArrayLike<string>).includes(LEADER_DND_MIME);
}

/** The dropped leader id, or `null` for a foreign / malformed payload. */
export function decodeLeaderDrag(dt: DataTransferLike | null | undefined): string | null {
  if (!hasLeaderDrag(dt)) return null;
  const value = dt!.getData(LEADER_DND_MIME).trim();
  return isLeaderId(value) ? value : null;
}
