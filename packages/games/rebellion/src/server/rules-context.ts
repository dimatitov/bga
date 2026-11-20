/**
 * SWR-008 C-6 — rules support of Rebellion (`ServerGameModule.rules`): where the knowledge base lives, which entry is
 * pinned first (engine scope, review F-7) and which entries the public decision tags add (R-2 step 5).
 * The knowledge base files are read by the server (apps/api, once at start); this module stays pure.
 */
import type { GameRulesSupport } from '@bga/platform';
import { createKnowledgeBaseRulesProvider } from '@bga/platform/rules-kb';

/** Repository-relative POSIX path of the Rebellion knowledge base (manifest.json + entries/*.json). */
export const REBELLION_KNOWLEDGE_BASE_DIR = 'packages/games/rebellion/knowledge';

/**
 * The engine-scope entry (F-7): an `implementation-note` with `ai: 'core'`, pinned as the first line of every rules
 * context, so the model knows which mechanics core-v1 does not implement.
 */
export const REBELLION_ENGINE_SCOPE_RULE_ID = 'rebellion:impl.engine-scope';

/**
 * Decision tag → entries (the last selection group). Tags come only from public fields of the view
 * (`rulesQueryFor`, QD-7). `rebellion:base.secret-location` is left out on purpose to keep room under 6000 chars.
 */
export const REBELLION_TAG_RULES: Readonly<Record<string, readonly string[]>> = {
  'base-hidden': ['rebellion:base.death-star-does-not-reveal'],
  'base-revealed': ['rebellion:base.reveal-procedure'],
  'opponent-passed': ['rebellion:command.pass-is-not-action'],
};

/** Rebellion's `GameRulesSupport`: fail fast on an invalid knowledge base or configuration. */
export const rebellionRules: GameRulesSupport = {
  knowledgeBaseDir: REBELLION_KNOWLEDGE_BASE_DIR,
  createRulesContextProvider: (source) =>
    createKnowledgeBaseRulesProvider(source, {
      pinnedRuleIds: [REBELLION_ENGINE_SCOPE_RULE_ID],
      tagRules: REBELLION_TAG_RULES,
    }),
};
