/**
 * Geometry constants of the `core-v1` map (SWR-005 plan-frontend §4, §6). World units unless the name says `PX`
 * (screen pixels: labels, chips and region captions are screen-constant). Pure data, no rules.
 */
import type { Insets } from '../../board/model/geometry';

export const CORE_SYSTEM_RADIUS = 30;
/** Detail LOD below this scale switches to per-side count chips (D-SW5-9, Q-FE-7). */
export const LOD_THRESHOLD = 0.65;

// System labels (screen-constant, below the system circle).
export const LABEL_FONT_PX = 12;
export const LABEL_LINE_PX = 15;
export const LABEL_GAP_PX = 4;
/**
 * Offset of the label box top below the system centre (screen px at factor 1, SWR-009): the node and the counter
 * rows are screen-constant, so the label sits right under the lower (ground) marker row in the detail LOD and right
 * under the node (the single compact marker row is on the centre line) in the compact LOD.
 */
export const LABEL_OFFSET_PX = 20;
export const LABEL_OFFSET_COMPACT_PX = 12;
export const LABEL_MAX_WIDTH_PX = 120;
/**
 * Glyph advance (em) used to size label boxes without measuring text. PT Mono is monospaced with a 600/1000 em
 * advance for every glyph (Latin and Cyrillic), so 0.6 is exact for the shipped face (SWR-009 R-4, plan §2 M item 8);
 * the `ui-monospace` fallbacks have the same 0.6 em advance.
 */
export const LABEL_CHAR_EM = 0.6;
export const LABEL_PAD_PX = 4;
/** When zoomed in (scale > 1) labels grow with the map up to this factor of their base size. */
export const LABEL_MAX_SCREEN_FACTOR = 1.6;
export const LABEL_MAX_LINES = 2;

// Region captions (screen-constant, UPPERCASE).
export const REGION_FONT_PX = 11;
export const REGION_LETTER_SPACING_PX = 1.3;
/** PT Mono: every glyph (upper case too) advances 0.6 em; letter spacing is added separately. */
export const REGION_CHAR_EM = 0.6;

// Leaders on the map (detail LOD, world units): badges on an outer arc above the system.
export const LEADER_RADIUS = 12;
export const LEADER_ARC_RADIUS = 92;
export const LEADER_STEP_DEG = 17;

// System node (screen px, screen-constant like the Console prototype: r 7, rings r 10…30 around it).
export const NODE_RADIUS_PX = 7;

// Group counter markers (screen px, screen-constant; SWR-009 R-3, AC-6): «glyph + number» plates 34×17 beside the
// node — Empire on the left, Rebels on the right, fleet on the upper row, ground forces on the lower row.
export const MARKER_WIDTH_PX = 34;
export const MARKER_HEIGHT_PX = 17;
export const MARKER_GLYPH_PX = 11;
export const MARKER_FONT_PX = 11;
export const MARKER_PAD_PX = 3;
/** Horizontal distance from the system centre to the inner edge of a marker. */
export const MARKER_REACH_PX = NODE_RADIUS_PX + 5;
/** Vertical gap between the fleet and the ground row (and half of it from the centre line). */
export const MARKER_ROW_GAP_PX = 2;
/** Horizontal gap between the two zone markers. */
export const MARKER_ZONE_GAP_PX = 6;
// Compact LOD side markers (A-8): one plate per side on the centre line, touching the node, with the arena split
// «▲ fleet ■ ground ◆ leaders» (fix round 1: the fleet / ground counts stay visible at fit zoom).
export const COMPACT_MARKER_HEIGHT_PX = 16;
export const COMPACT_MARKER_GLYPH_PX = 7;
export const COMPACT_MARKER_FONT_PX = 10;
export const COMPACT_MARKER_REACH_PX = NODE_RADIUS_PX + 1;
export const COMPACT_MARKER_PAD_PX = 2;
/** Extra transparent hit margin around a marker (the plate itself stays 34×17). */
export const MARKER_HIT_PAD_PX = 4;

// Single-unit move handles (world units, detail LOD, own activation only): upper arc inside the leader arc.
export const HANDLE_ARC_RADIUS = 60;
export const HANDLE_STEP_DEG = 22;

// Hidden rebel-base zone (world units inside HIDDEN_BASE_ZONE_RECT).
export const ZONE_PADDING = 22;
export const ZONE_TITLE_HEIGHT = 84;
export const ZONE_STEP = 34;

/**
 * Screen insets reserved around the fitted content for screen-constant text (§6 item 2): half the widest label on
 * the sides, two label lines (+ gap) at the bottom.
 */
export const CORE_CONTENT_INSETS: Insets = {
  top: 0,
  right: LABEL_MAX_WIDTH_PX / 2,
  bottom: LABEL_GAP_PX + LABEL_MAX_LINES * LABEL_LINE_PX,
  left: LABEL_MAX_WIDTH_PX / 2,
};

/**
 * Narrow consoles (one column, window < 900 px; SWR-009 fix round 3, QA-3): no extra side insets — the map uses the
 * canvas width (only the adaptive fit padding, ≥ 12 px, remains); captions that would fall outside the canvas are
 * culled in the compact LOD like colliding ones (`cullLabels` with `stage`). The two-column consoles (≥ 900) keep
 * `CORE_CONTENT_INSETS`, so the fit at ≥ 1024 is unchanged.
 */
export const CORE_CONTENT_INSETS_NARROW: Insets = {
  top: 0,
  right: 0,
  bottom: LABEL_OFFSET_COMPACT_PX + LABEL_LINE_PX,
  left: 0,
};

/** Window width below which the narrow insets apply (= `CONSOLE_SPLIT`, the one-column console modes). */
export const NARROW_FIT_MAX_WIDTH = 900;

/** Content insets of «вписать карту» for a window width. */
export function coreContentInsets(windowWidth: number): Insets {
  return windowWidth < NARROW_FIT_MAX_WIDTH ? CORE_CONTENT_INSETS_NARROW : CORE_CONTENT_INSETS;
}
