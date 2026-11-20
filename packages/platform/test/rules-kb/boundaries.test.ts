// AC-2 / B-1: the rules-kb sources are game-agnostic and depend only on zod (tests may use node:fs).
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import * as api from '../../src/rules-kb';

const SRC = fileURLToPath(new URL('../../src/rules-kb/', import.meta.url));
const files = readdirSync(SRC).filter((f) => f.endsWith('.ts'));

describe('rules-kb boundaries', () => {
  it('has source files', () => {
    expect(files).toContain('index.ts');
  });

  it.each(files)(
    '%s: no game names, node:* or @bga/*; imports only zod and relative modules',
    (f) => {
      const text = readFileSync(join(SRC, f), 'utf8');
      expect(text).not.toMatch(/rebellion/i);
      expect(text).not.toMatch(/node:/);
      expect(text).not.toMatch(/@bga\//);
      const specifiers = [...text.matchAll(/\bfrom\s+'([^']+)'/g)].map((m) => m[1]);
      for (const s of specifiers) expect(s).toMatch(/^(zod|\.\/[a-z-]+)$/);
      expect(text).not.toMatch(/\bimport\s*\(/);
      expect(text).not.toMatch(/\brequire\s*\(/);
    },
  );

  it('exports the public API of plan-backend §2', () => {
    for (const fn of [
      'parseKnowledgeBase',
      'validateKnowledgeBase',
      'createRulesSearch',
      'buildRulesContext',
      'renderRulesIndex',
      'renderCoverageMatrix',
      'renderDiscrepancies',
      'formatCitation',
      'KnowledgeBaseParseError',
    ] as const) {
      expect(typeof api[fn]).toBe('function');
    }
    for (const schema of [
      'KbManifestSchema',
      'KbSourceSchema',
      'KbCategorySchema',
      'KbSourceSectionSchema',
      'KbEntrySchema',
      'KbSourceRefSchema',
      'KbExceptionSchema',
      'KbAppliesToSchema',
      'KbCoverageSchema',
      'KbCoverageItemSchema',
      'KbDiscrepancySchema',
      'KbDiscrepanciesSchema',
    ] as const) {
      expect(typeof api[schema].safeParse).toBe('function');
    }
    expect(api.RULES_KB_FORMAT_VERSION).toBe(1);
    expect(api.KB_ISSUE_CODES).toContain('SCHEMA_INVALID');
  });
});
