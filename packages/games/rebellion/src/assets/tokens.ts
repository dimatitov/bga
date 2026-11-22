/**
 * Visual tokens of Rebellion (FE PA-4): faction and map colours (ux-decisions §7; SWR-009 values — the
 * Galactic Vector Terminal palette, implementation-plan §1.5). Plain data — the web wraps them into its theme/Konva styles.
 * Lives in its own module so `emblems.ts`/`factions.ts` can use it without an import cycle via `index.ts`.
 */
export const rebellionVisualTokens = {
  // SWR-009 (Galactic Vector Terminal, spec R-1/A-5): Empire = Signal Red, Rebels = Bright Phosphor. Keys unchanged;
  // as TEXT the web uses the light shades of its own tokens (QD-8) — these are glyph/border/fill colours.
  faction: { empire: '#DD6B59', rebels: '#91DFA1' },
  board: {
    /** CRT map screen. */
    background: '#030704',
    /** Screen grid (`grid` role @ 0.35). */
    star: 'rgba(45,85,53,0.35)',
    /** Routes. */
    link: '#456B4D',
    /** Node fill. */
    systemFill: '#020806',
    /** Node outline. */
    systemStroke: '#91DFA1',
    /** Map labels. */
    label: '#B9C2B4',
    /** Selection (amber). */
    selected: '#E3AD5C',
    /** Legal target (phosphor, dashed on the map). */
    legalTarget: '#91DFA1',
    /** Invalid drop target. */
    invalidTarget: '#DD6B59',
  },
} as const;
export type RebellionVisualTokens = typeof rebellionVisualTokens;

/**
 * Faction ids as seen by `./assets`. ESLint B-3 forbids web-reachable subpaths from importing each other, so this
 * mirrors `FactionId` from `./schema`; `test/assets/factions.test.ts` asserts the two types are identical.
 */
export type AssetFactionId = keyof RebellionVisualTokens['faction'];
