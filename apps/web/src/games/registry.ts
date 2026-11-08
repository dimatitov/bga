/**
 * Web game registry (spec "Реестры", plan-frontend §4): a plain typed array, no plugins, no loading by name.
 * Adding a game = its folder `src/games/<id>/` + one entry here. Read by the platform only through
 * `GameRegistryProvider` / `useGameRegistry()` (tests inject other entries, TR-5).
 */
import { forbiddenStarsEntry } from './forbidden-stars/entry';
import { rebellionEntry } from './rebellion/entry';
import type { WebGameEntry } from './types';

export type * from './types';

export const gameRegistry: readonly WebGameEntry[] = Object.freeze([
  rebellionEntry,
  forbiddenStarsEntry,
]);
