/** Board geometry and interaction constants (plan-frontend §4.3, ux-decisions D-I-*). World units unless noted. */
export const SYSTEM_RADIUS = 34;
export const ORBIT_RADIUS = 62;
export const PIECE_SIZE = 20;
export const PIECE_HIT = 30;
export const SLOT_STEP_DEG = 26;
export const SLOTS_PER_SIDE = 7;
export const SNAP_RADIUS = 70;

/** A-9 / D-I-8: zoom limits. */
export const MIN_SCALE = 0.4;
export const MAX_SCALE = 2.5;
export const WHEEL_STEP = 1.1;
export const BUTTON_STEP = 1.25;
/** Screen pixels around the fitted map. */
export const FIT_PADDING = 64;
/** Screen pixels per arrow key press. */
export const KEY_PAN = 80;
/** A-10: below this pointer travel (px) a press is a click, at/above it a drag/pan. */
export const DRAG_DISTANCE = 4;
/** Zoom tween duration (ms); 0 when reduced motion is on (A-13). */
export const ZOOM_TWEEN_MS = 150;
/** Extra world margin around system centers for bounds. */
export const BOUNDS_MARGIN = SYSTEM_RADIUS + ORBIT_RADIUS + 40;
