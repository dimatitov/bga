import { rebellionVisualTokens } from '@bga/game-rebellion/assets';

/**
 * Rebellion visual tokens for the web (ux-decisions.md §7; SWR-003 plan-frontend §6): faction colours and the
 * board (Konva) palette. Single source of truth: `@bga/game-rebellion/assets` → `rebellionVisualTokens`
 * (SWR-003 INTEGRATION, Analyst decision); this module only re-exposes them under the names board code uses.
 */
export const rebellionPalette = rebellionVisualTokens;

export type FactionPalette = { [K in keyof typeof rebellionPalette.faction]: string };
export type BoardPalette = { [K in keyof typeof rebellionPalette.board]: string };
