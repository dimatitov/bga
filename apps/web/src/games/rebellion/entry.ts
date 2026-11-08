import { rebellionAssets } from '@bga/game-rebellion/assets';
import { rebellionDefinition } from '@bga/game-rebellion/definition';
import { lazy } from 'react';
import type { WebGameEntry } from '@/games/types';
import { svgDataUrl } from '@/platform';
import { describeRebellionSession } from './describeSession';
import { REBELLION_I18N_PREFIX } from './i18n';

/**
 * Star Wars: Rebellion web entry (SWR-003 plan-frontend §4). Screens are `React.lazy` chunks (code splitting,
 * not loading games by name — AC-9): Konva and the board are only in the `TableScreen` chunk.
 */
export const rebellionEntry: WebGameEntry = {
  definition: rebellionDefinition,
  cover: { src: svgDataUrl(rebellionAssets.cover.svg), accentColor: rebellionAssets.accentColor },
  i18nPrefix: REBELLION_I18N_PREFIX,
  describeSession: describeRebellionSession,
  SetupScreen: lazy(() => import('./setup/SetupScreen')),
  TableScreen: lazy(() => import('./table/TableScreen')),
};
