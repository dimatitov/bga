import { z } from 'zod';

/**
 * Game-agnostic card contracts (frozen contract). The platform never interprets a side id,
 * a card type or a parameter: it only checks shapes, references and zone mechanics.
 */

export const CARD_ID_PATTERN = /^[a-z0-9][a-z0-9-]{0,63}$/;
/** Card, type, effect, zone and mechanic ids. */
export const CardIdSchema = z.string().regex(CARD_ID_PATTERN);
export const CardInstanceIdSchema = z.string().regex(/^[a-z0-9][a-z0-9-]{0,63}#[1-9][0-9]{0,2}$/);
export const CardI18nKeySchema = z.string().regex(/^[a-z][A-Za-z0-9-]*(\.[A-Za-z0-9-]+){1,4}$/);
/** Opaque side id of the game (never interpreted by the platform). */
export const CardSideSchema = z.string().regex(/^[a-z][a-z0-9-]{0,31}$/);
export const CardScopeSchema = z.union([CardSideSchema, z.literal('shared')]);

export const CardSourceRefSchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('kb'), id: z.string().min(1).max(128) }),
  z.strictObject({
    kind: z.literal('book'),
    sourceId: z.string().min(1).max(32),
    page: z.int().positive(),
    section: z.string().min(1).max(80).optional(),
  }),
]);
export const CardVerificationSchema = z.enum(['verified', 'needs-review', 'unverified']);
export const CardCatalogStatusSchema = z.enum(['tracked', 'deferred']);
export const CardEffectStatusSchema = z.enum(['none', 'not-implemented', 'implemented']);
export const CardParamValueSchema = z.union([
  z.string().max(64),
  z.number(),
  z.boolean(),
  z.null(),
]);

export const CardEffectSchema = z
  .strictObject({
    id: CardIdSchema,
    status: CardEffectStatusSchema,
    /** Non-null exactly when `implemented`. */
    mechanicId: CardIdSchema.nullable(),
    /** Own short description (never rights-holder text). */
    summaryKey: CardI18nKeySchema,
  })
  .superRefine((e, ctx) => {
    if ((e.mechanicId !== null) !== (e.status === 'implemented'))
      ctx.addIssue({ code: 'custom', path: ['mechanicId'], message: 'mechanicId iff implemented' });
  });

export const CardTypeDefinitionSchema = z.strictObject({
  id: CardIdSchema,
  gameId: z.string().min(1).max(64),
  editionId: z.string().min(1).max(64),
  nameKey: CardI18nKeySchema,
  descriptionKey: CardI18nKeySchema,
  scope: CardScopeSchema,
  catalogStatus: CardCatalogStatusSchema,
  verification: CardVerificationSchema,
  sources: z.array(CardSourceRefSchema).min(1),
});

export const CardDefinitionSchema = z.strictObject({
  id: CardIdSchema,
  gameId: z.string().min(1).max(64),
  editionId: z.string().min(1).max(64),
  typeId: CardIdSchema,
  scope: CardScopeSchema,
  nameKey: CardI18nKeySchema,
  params: z.record(CardIdSchema, CardParamValueSchema),
  usageKeys: z.array(CardI18nKeySchema),
  sources: z.array(CardSourceRefSchema).min(1),
  verification: CardVerificationSchema,
  effectId: CardIdSchema,
});

function duplicates(ids: readonly string[]): string[] {
  const seen = new Set<string>();
  const dup = new Set<string>();
  for (const id of ids) {
    if (seen.has(id)) dup.add(id);
    seen.add(id);
  }
  return [...dup];
}

/**
 * Catalog: unique ids per list; every card's typeId/effectId resolve; every card belongs to the catalog's game and
 * rules edition; a `deferred` type has no cards.
 */
export const CardCatalogSchema = z
  .strictObject({
    id: CardIdSchema,
    gameId: z.string().min(1).max(64),
    editionId: z.string().min(1).max(64),
    types: z.array(CardTypeDefinitionSchema).min(1),
    effects: z.array(CardEffectSchema),
    cards: z.array(CardDefinitionSchema),
  })
  .superRefine((catalog, ctx) => {
    const lists = [
      ['types', catalog.types],
      ['effects', catalog.effects],
      ['cards', catalog.cards],
    ] as const;
    for (const [path, list] of lists) {
      for (const id of duplicates(list.map((item) => item.id)))
        ctx.addIssue({ code: 'custom', path: [path], message: `duplicate id "${id}"` });
    }
    const types = new Map(catalog.types.map((t) => [t.id, t]));
    const effects = new Set(catalog.effects.map((e) => e.id));
    catalog.cards.forEach((card, i) => {
      const type = types.get(card.typeId);
      if (type === undefined)
        ctx.addIssue({
          code: 'custom',
          path: ['cards', i, 'typeId'],
          message: `unknown type "${card.typeId}"`,
        });
      else if (type.catalogStatus === 'deferred')
        ctx.addIssue({
          code: 'custom',
          path: ['cards', i, 'typeId'],
          message: `type "${card.typeId}" is deferred and has no cards`,
        });
      if (!effects.has(card.effectId))
        ctx.addIssue({
          code: 'custom',
          path: ['cards', i, 'effectId'],
          message: `unknown effect "${card.effectId}"`,
        });
      if (card.gameId !== catalog.gameId)
        ctx.addIssue({
          code: 'custom',
          path: ['cards', i, 'gameId'],
          message: 'gameId differs from the catalog',
        });
      if (card.editionId !== catalog.editionId)
        ctx.addIssue({
          code: 'custom',
          path: ['cards', i, 'editionId'],
          message: 'editionId differs from the catalog',
        });
    });
  });

export const CardInstanceSchema = z.strictObject({
  id: CardInstanceIdSchema,
  definitionId: CardIdSchema,
});

export const CardZoneKindSchema = z.enum([
  'deck',
  'hand',
  'discard',
  'inPlay',
  'revealed',
  'removed',
  'special',
]);
export const CardZoneVisibilitySchema = z.enum(['public', 'owner', 'hidden']);
export const CardAuthoritySchema = z.enum(['digital', 'physical']);

/** Static policy (game code): visibility 'owner' ⇒ owner !== null; kind 'deck' ⇒ ordered. */
export const CardZonePolicySchema = z
  .strictObject({
    id: CardIdSchema,
    kind: CardZoneKindSchema,
    owner: CardSideSchema.nullable(),
    visibility: CardZoneVisibilitySchema,
    ordered: z.boolean(),
    acceptsTypeIds: z.array(CardIdSchema).min(1),
    maxCards: z.int().positive().nullable(),
  })
  .superRefine((p, ctx) => {
    if (p.visibility === 'owner' && p.owner === null)
      ctx.addIssue({
        code: 'custom',
        path: ['owner'],
        message: "visibility 'owner' needs an owner",
      });
    if (p.kind === 'deck' && !p.ordered)
      ctx.addIssue({ code: 'custom', path: ['ordered'], message: 'a deck is ordered' });
  });

/** Stored. `cards[0]` = top of an ordered zone. */
export const CardZoneStateSchema = z.strictObject({
  id: CardIdSchema,
  authority: CardAuthoritySchema,
  cards: z.array(CardInstanceIdSchema),
});
export const CardPileSchema = z.strictObject({
  instances: z.array(CardInstanceSchema),
  zones: z.array(CardZoneStateSchema),
});

// ---- views ----
export const CardRefViewSchema = z.strictObject({
  instanceId: CardInstanceIdSchema,
  definitionId: CardIdSchema,
});
/** `cards: null` = contents not visible to this viewer (always null for ordered non-public zones). */
export const CardZoneViewSchema = z
  .strictObject({
    id: CardIdSchema,
    kind: CardZoneKindSchema,
    owner: CardSideSchema.nullable(),
    visibility: CardZoneVisibilitySchema,
    ordered: z.boolean(),
    authority: CardAuthoritySchema,
    count: z.int().nonnegative(),
    cards: z.array(CardRefViewSchema).nullable(),
  })
  .superRefine((z0, ctx) => {
    if (z0.cards !== null && z0.cards.length !== z0.count)
      ctx.addIssue({ code: 'custom', path: ['cards'], message: 'cards.length must equal count' });
    if (z0.cards !== null && z0.ordered && z0.visibility !== 'public')
      ctx.addIssue({ code: 'custom', path: ['cards'], message: 'hidden order is never projected' });
  });

export type CardSourceRef = z.output<typeof CardSourceRefSchema>;
export type CardVerification = z.output<typeof CardVerificationSchema>;
export type CardCatalogStatus = z.output<typeof CardCatalogStatusSchema>;
export type CardEffectStatus = z.output<typeof CardEffectStatusSchema>;
export type CardParamValue = z.output<typeof CardParamValueSchema>;
export type CardEffect = z.output<typeof CardEffectSchema>;
export type CardTypeDefinition = z.output<typeof CardTypeDefinitionSchema>;
export type CardDefinition = z.output<typeof CardDefinitionSchema>;
export type CardCatalog = z.output<typeof CardCatalogSchema>;
export type CardInstance = z.output<typeof CardInstanceSchema>;
export type CardZoneKind = z.output<typeof CardZoneKindSchema>;
export type CardZoneVisibility = z.output<typeof CardZoneVisibilitySchema>;
export type CardAuthority = z.output<typeof CardAuthoritySchema>;
export type CardZonePolicy = z.output<typeof CardZonePolicySchema>;
export type CardZoneState = z.output<typeof CardZoneStateSchema>;
export type CardPile = z.output<typeof CardPileSchema>;
export type CardRefView = z.output<typeof CardRefViewSchema>;
export type CardZoneView = z.output<typeof CardZoneViewSchema>;

// ---- engine (types) ----
export type CardErrorCode =
  | 'unknownZone'
  | 'unknownCard'
  | 'cardNotInZone'
  | 'cardLost'
  | 'duplicateInstance'
  | 'sameZone'
  | 'zoneNotOrdered'
  | 'wrongZoneKind'
  | 'typeNotAccepted'
  | 'zoneFull'
  | 'insufficientCards'
  | 'invalidCount'
  | 'notPhysicalZone';
export interface CardError {
  code: CardErrorCode;
  zoneId?: string;
  instanceId?: string;
  definitionId?: string;
}
export type CardResult =
  { ok: true; pile: CardPile; moved: string[] } | { ok: false; error: CardError };
export interface CardEngineContext {
  layout: readonly CardZonePolicy[];
  typeOfDefinition(definitionId: string): string | undefined;
}
export interface CardInvariantIssue {
  code: CardErrorCode | 'missingZone' | 'extraZone';
  zoneId?: string;
  instanceId?: string;
}
