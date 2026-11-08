/**
 * Visual tokens of Rebellion (FE PA-4): faction and map colours, moved here from the web theme without
 * change (ux-decisions §7). Plain data — the web wraps them into its theme/Konva styles.
 * Lives in its own module so `emblems.ts`/`factions.ts` can use it without an import cycle via `index.ts`.
 */
export const rebellionVisualTokens = {
  faction: { empire: '#7C9CFF', rebels: '#F5A524' },
  board: {
    background: '#070A10',
    star: 'rgba(230,234,242,0.25)',
    link: 'rgba(154,164,181,0.45)',
    systemFill: '#1C2536',
    systemStroke: '#5B6B85',
    label: '#C9D1DE',
    selected: '#FFFFFF',
    legalTarget: '#2DD4BF',
    invalidTarget: '#F87171',
  },
} as const;
export type RebellionVisualTokens = typeof rebellionVisualTokens;

/**
 * Faction ids as seen by `./assets`. ESLint B-3 forbids web-reachable subpaths from importing each other, so this
 * mirrors `FactionId` from `./schema`; `test/assets/factions.test.ts` asserts the two types are identical.
 */
export type AssetFactionId = keyof RebellionVisualTokens['faction'];
