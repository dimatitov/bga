import { z } from 'zod';

/**
 * Game-agnostic rules knowledge base format (SWR-005C C-2). The schemas check only the SHAPE of the data;
 * every semantic rule and limit lives in `validateKnowledgeBase` with a stable issue code (plan-backend BD-4).
 */
export const RULES_KB_FORMAT_VERSION = 1;

/** Copyright limits (C-2, C-4 Q-2): own paraphrases, short quotes, a bounded quote budget per source. */
export const RULES_KB_LIMITS = {
  entryTextMaxChars: 600,
  quoteMaxWords: 25,
  quoteWordsPerSourceMax: 400,
} as const;

const NonEmpty = z.string().min(1);
const Kebab = z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
const Sha256 = z.string().regex(/^[0-9a-f]{64}$/);
/** Page numbers are integers; the range (1..pages, excludedPages) is checked by the validator. */
const Page = z.int();

export const KbEntryKindSchema = z.enum([
  'rule',
  'clarification',
  'interpretation',
  'implementation-note',
]);
export type KbEntryKind = z.output<typeof KbEntryKindSchema>;

export const KbEntryStatusSchema = z.enum(['verified', 'needs-review']);
export type KbEntryStatus = z.output<typeof KbEntryStatusSchema>;

export const KbAiRelevanceSchema = z.enum(['core', 'situational', 'none']);
export type KbAiRelevance = z.output<typeof KbAiRelevanceSchema>;

export const KbSourceKindSchema = z.enum(['rules', 'faq', 'tutorial', 'other']);
export type KbSourceKind = z.output<typeof KbSourceKindSchema>;

export const KbCoverageStatusSchema = z.enum([
  'implemented',
  'partial',
  'deviation',
  'not-implemented',
  'not-applicable',
]);
export type KbCoverageStatus = z.output<typeof KbCoverageStatusSchema>;

export const KbDiscrepancyKindSchema = z.enum([
  'intentional-deviation',
  'missing-mechanic',
  'latent-gap',
  'data-uncertainty',
  'bug',
]);
export type KbDiscrepancyKind = z.output<typeof KbDiscrepancyKindSchema>;

export const KbSeveritySchema = z.enum(['low', 'medium', 'high']);
export type KbSeverity = z.output<typeof KbSeveritySchema>;

export const KbDecisionSchema = z.enum([
  'accepted-for-slice',
  'fix-later',
  'verify-with-box',
  'fixed',
]);
export type KbDecision = z.output<typeof KbDecisionSchema>;

// ---- Manifest ----

export const KbCategorySchema = z.strictObject({
  id: NonEmpty,
  title: NonEmpty,
  parent: NonEmpty.optional(),
});

export const KbSourceSchema = z.strictObject({
  /** Short tag, also the citation label (`RR` → `RR p.9`). */
  id: z.string().regex(/^[A-Za-z0-9-]+$/),
  kind: KbSourceKindSchema,
  title: NonEmpty,
  publisher: NonEmpty,
  url: z.url(),
  version: NonEmpty,
  date: NonEmpty,
  retrievedAt: NonEmpty,
  sha256: Sha256,
  pages: z.int().positive(),
  /** Lower = takes precedence. */
  precedence: z.number(),
  status: z.enum(['current', 'superseded']),
  mirror: z
    .strictObject({
      url: z.url(),
      sha256: Sha256,
      reason: NonEmpty,
    })
    .optional(),
  excludedPages: z.array(Page).optional(),
  notes: z.string().optional(),
});

/** A topic of a source that must be covered by at least one entry (or explicitly skipped with a reason). */
export const KbSourceSectionSchema = z.strictObject({
  sourceId: NonEmpty,
  page: Page,
  title: NonEmpty,
  coveredBy: z.literal('skip').optional(),
  reason: z.string().optional(),
});

export const KbManifestSchema = z.strictObject({
  formatVersion: z.literal(RULES_KB_FORMAT_VERSION),
  gameId: Kebab,
  title: NonEmpty,
  /** Language of entry texts. */
  language: z.literal('en'),
  products: z.array(NonEmpty).min(1),
  excludedProducts: z.array(NonEmpty).default([]),
  categories: z.array(KbCategorySchema).min(1),
  sources: z.array(KbSourceSchema).min(1),
  sourceSections: z.array(KbSourceSectionSchema).default([]),
});

// ---- Entries ----

export const KbSourceRefSchema = z.strictObject({
  sourceId: NonEmpty,
  page: Page,
  section: NonEmpty,
  quote: NonEmpty.optional(),
});

export const KbExceptionSchema = z.strictObject({
  text: NonEmpty,
  ruleIds: z.array(NonEmpty).optional(),
  sources: z.array(KbSourceRefSchema).optional(),
});

/** Game strings used to select entries for an AI context. */
export const KbAppliesToSchema = z.strictObject({
  phases: z.array(NonEmpty).optional(),
  commands: z.array(NonEmpty).optional(),
  sides: z.array(NonEmpty).optional(),
});

export const KbEntrySchema = z.strictObject({
  /** `<gameId>:<segment>(.<segment>)+`; the format is checked by the validator (ENTRY_ID_FORMAT/PREFIX). */
  id: NonEmpty,
  kind: KbEntryKindSchema,
  status: KbEntryStatusSchema,
  product: NonEmpty,
  category: NonEmpty,
  title: NonEmpty,
  /** Own paraphrase; length is checked by the validator. */
  text: NonEmpty,
  sources: z.array(KbSourceRefSchema),
  exceptions: z.array(KbExceptionSchema).optional(),
  related: z.array(NonEmpty).optional(),
  amends: z.array(NonEmpty).optional(),
  appliesTo: KbAppliesToSchema.optional(),
  ai: KbAiRelevanceSchema.default('situational'),
  keywords: z.array(NonEmpty).optional(),
  rationale: z.string().optional(),
  discrepancyIds: z.array(NonEmpty).optional(),
});

// ---- Coverage ----

export const KbCoverageItemSchema = z.strictObject({
  ruleId: NonEmpty,
  status: KbCoverageStatusSchema,
  implementation: z.array(z.strictObject({ path: NonEmpty, symbol: NonEmpty })).optional(),
  tests: z.array(z.strictObject({ path: NonEmpty, name: NonEmpty })).optional(),
  discrepancyIds: z.array(NonEmpty).optional(),
  note: z.string().optional(),
});

export const KbCoverageSchema = z.strictObject({
  engine: NonEmpty,
  items: z.array(KbCoverageItemSchema),
});

// ---- Discrepancies ----

export const KbDiscrepancyRefSchema = z.union([
  NonEmpty,
  z.strictObject({ sourceId: NonEmpty, page: Page }),
]);

export const KbDiscrepancySchema = z.strictObject({
  /** `DISC-NNN`; the format is checked by the validator (DISCREPANCY_ID_FORMAT). */
  id: NonEmpty,
  title: NonEmpty,
  kind: KbDiscrepancyKindSchema,
  severity: KbSeveritySchema,
  ruleIds: z.array(NonEmpty).min(1),
  engineBehaviour: NonEmpty,
  officialBehaviour: NonEmpty,
  decision: KbDecisionSchema,
  followUp: NonEmpty,
  /** A string is an entry id; an object is a page of a source. */
  refs: z.array(KbDiscrepancyRefSchema).optional(),
});

export const KbDiscrepanciesSchema = z.array(KbDiscrepancySchema);

// ---- Types (output = after defaults; input = as written in JSON) ----

export type KbCategory = z.output<typeof KbCategorySchema>;
export type KbSource = z.output<typeof KbSourceSchema>;
export type KbSourceSection = z.output<typeof KbSourceSectionSchema>;
export type KbManifest = z.output<typeof KbManifestSchema>;
export type KbSourceRef = z.output<typeof KbSourceRefSchema>;
export type KbException = z.output<typeof KbExceptionSchema>;
export type KbAppliesTo = z.output<typeof KbAppliesToSchema>;
export type KbEntry = z.output<typeof KbEntrySchema>;
export type KbCoverageItem = z.output<typeof KbCoverageItemSchema>;
export type KbCoverage = z.output<typeof KbCoverageSchema>;
export type KbDiscrepancyRef = z.output<typeof KbDiscrepancyRefSchema>;
export type KbDiscrepancy = z.output<typeof KbDiscrepancySchema>;

export type KbManifestInput = z.input<typeof KbManifestSchema>;
export type KbEntryInput = z.input<typeof KbEntrySchema>;
export type KbCoverageInput = z.input<typeof KbCoverageSchema>;
export type KbDiscrepancyInput = z.input<typeof KbDiscrepancySchema>;

/** Raw (unparsed) data of a knowledge base; loading JSON from disk is the consumer's job (C-1). */
export interface KnowledgeBaseInput {
  manifest: unknown;
  /** Flat array of entries (all `entries/*.json` concatenated). */
  entries: unknown;
  coverage?: unknown;
  discrepancies?: unknown;
}

/** Parsed knowledge base. */
export interface KnowledgeBase {
  manifest: KbManifest;
  entries: readonly KbEntry[];
  coverage?: KbCoverage;
  /** `[]` when absent from the input. */
  discrepancies: readonly KbDiscrepancy[];
}
