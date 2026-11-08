/**
 * Geometry constants of the `core-v1` map (SWR-005 plan-frontend §4, §6). World units unless the name says `PX`
 * (screen pixels: labels, chips and region captions are screen-constant). Pure data, no rules.
 */
import type { Insets } from '../../board/model/geometry';

export const CORE_SYSTEM_RADIUS = 30;
/** Detail LOD below this scale switches to per-side count chips (D-SW5-9, Q-FE-7). */
export const LOD_THRESHOLD = 0.65;

// System labels (screen-constant, below the system circle).
export const LABEL_FONT_PX = 13;
export const LABEL_LINE_PX = 16;
export const LABEL_GAP_PX = 4;
export const LABEL_MAX_WIDTH_PX = 120;
/** Conservative average glyph width (em) used to size label boxes without measuring text. */
export const LABEL_CHAR_EM = 0.62;
export const LABEL_PAD_PX = 6;
/** When zoomed in (scale > 1) labels grow with the map up to this factor of their base size. */
export const LABEL_MAX_SCREEN_FACTOR = 1.6;
export const LABEL_MAX_LINES = 2;

// Region captions (screen-constant, UPPERCASE).
export const REGION_FONT_PX = 11;
export const REGION_LETTER_SPACING_PX = 1.3;
export const REGION_CHAR_EM = 0.78;

// Leaders on the map (detail LOD, world units): badges on an outer arc above the system.
export const LEADER_RADIUS = 12;
export const LEADER_ARC_RADIUS = 92;
export const LEADER_STEP_DEG = 17;

// Compact LOD chips (screen px), beside the system circle: Empire on the left, Rebels on the right.
export const CHIP_HEIGHT_PX = 16;
export const CHIP_GAP_PX = 3;
export const CHIP_FONT_PX = 11;
export const CHIP_GLYPH_PX = 9;

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
