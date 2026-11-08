import { z } from 'zod';

/** kebab-case, stable forever (stored in `Session.gameId`). */
export const GameIdSchema = z
  .string()
  .max(64)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
export type GameId = z.infer<typeof GameIdSchema>;

export const GameStatusSchema = z.enum(['available', 'coming_soon']);
export type GameStatus = z.infer<typeof GameStatusSchema>;

/** Full i18n key of the web app, namespace-qualified: `<ns>:<key>` (e.g. `rebellion.meta:description`). */
export const I18nKeySchema = z.string().regex(/^[a-z0-9.-]+:[A-Za-z0-9._-]+$/);

/** Catalogue card / game page data of a game (SWR-003 AM-1, Q-11, Decisions R-1). */
export const GameDefinitionSchema = z.strictObject({
  id: GameIdSchema,
  /** Proper name, not translated (Q-11). */
  name: z.string().min(1),
  /** Description text key, e.g. `rebellion.meta:description`. */
  descriptionKey: I18nKeySchema,
  /** Fallback description (ru) when the key has no translation. */
  description: z.string().min(1).optional(),
  /** Cover alt text key, e.g. `rebellion.meta:coverAlt`. */
  coverAltKey: I18nKeySchema.optional(),
  /** By contract only; built-in games leave it empty — the cover comes from the game's `./assets`. */
  coverImage: z.string().min(1).optional(),
  status: GameStatusSchema,
  /** Ascending, unique player counts. */
  supportedPlayers: z
    .array(z.int().min(1).max(8))
    .min(1)
    .refine((a) => a.every((n, i) => i === 0 || n > a[i - 1]!), 'ascending, unique'),
  supportsAI: z.boolean(),
});
export type GameDefinition = z.infer<typeof GameDefinitionSchema>;

/**
 * Data of a game's `./assets` entry point that the platform UI uses (FE PA-4). Only original graphics:
 * `cover.svg` is an abstract SVG string (no text, scripts, external refs or raster images).
 * A game may add its own fields (e.g. Rebellion `visualTokens`).
 */
export const GameAssetsSchema = z.object({
  cover: z.strictObject({
    svg: z.string().startsWith('<svg'),
    width: z.int().positive(),
    height: z.int().positive(),
  }),
  /** Accent colour of the catalogue card (`#RRGGBB`). */
  accentColor: z.string().regex(/^#[0-9A-Fa-f]{6}$/),
});
export type GameAssets = z.infer<typeof GameAssetsSchema>;
