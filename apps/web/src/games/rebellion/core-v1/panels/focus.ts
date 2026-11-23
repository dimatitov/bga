/**
 * Focus rules of the `core-v1` turn flow (SWR-005 plan-frontend §5.3): after a command the focus moves to the
 * heading of what appeared (move panel after ACTIVATE, turn panel after FINISH/PASS in an AI game). The target is
 * rendered only after the new server view lands in the cache, so the element is looked up for a few frames.
 * Nothing happens when it never appears (e.g. the hot-seat handoff screen took over and focuses its own h1).
 */
export const TURN_TITLE_ID = 'core-turn-title';
export const MOVE_TITLE_ID = 'core-move-title';
export const TURN_PANEL_ID = 'core-turn-panel';
export const BOARD_LIST_ID = 'core-board-list';
/** SWR-010 FE-B: heading of the Physical Execution module (`physical-execution`) — focus target in the `physical` mode. */
export const PX_TITLE_ID = 'core-px-title';
/** SWR-010 FE-B: the system select of the Location registration form (target of «Зарегистрировать карту базы»). */
export const LOCATION_REGISTER_SELECT_ID = 'core-location-register-select';

const ATTEMPTS = 12;
const STEP_MS = 16;

export function focusWhenReady(id: string): void {
  let left = ATTEMPTS;
  const tick = () => {
    const el = document.getElementById(id);
    if (el) {
      el.focus();
      return;
    }
    left -= 1;
    if (left > 0) setTimeout(tick, STEP_MS);
  };
  setTimeout(tick, 0);
}
