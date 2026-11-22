import { terminalTokens } from '@/shared/theme';

const c = terminalTokens.color;

/**
 * Platform design tokens. Names are FROZEN since SWR-002 (plan-frontend §8); since SWR-009 the values are an adapter
 * over the Galactic Vector Terminal tokens (`@/shared/theme` → `terminalTokens`, the single source of values).
 * Game colours live in the game (`@bga/game-rebellion/assets`, D-V-5).
 */
export const tokens = {
  background: { default: c.page, paper: c.module },
  text: { primary: c.paper, secondary: c.warm },
  primary: { main: c.phosphor },
  mock: { main: c.amber },
  focus: terminalTokens.focus.color,
  shapeRadius: terminalTokens.radius,
  fontFamily: terminalTokens.font.family,
} as const;
