/**
 * SWR-005C W2 — the Rebellion knowledge base passes every format check, including the file/symbol/test checks
 * against the repository (AC-1, AC-5, AC-10; TC-S-01..05, TC-S-07/08, TC-C-01, TC-V-31).
 */
import { describe, expect, it } from 'vitest';
import { parseKnowledgeBase, validateKnowledgeBase, type KbIssue } from '@bga/platform/rules-kb';
import { loadKnowledgeBase, loadRawKnowledgeBase, nodeIo } from './load-kb';

function describeIssues(issues: readonly KbIssue[]): string {
  return issues.map((i) => `${i.code} ${i.path}: ${i.message}`).join('\n');
}

const kb = loadKnowledgeBase();

describe('Rebellion knowledge base — validation', () => {
  it('has zero issues with the repository io checks (files, symbols, test names)', () => {
    const result = validateKnowledgeBase(kb, nodeIo);
    expect(result.issues, describeIssues(result.issues)).toEqual([]);
    expect(result.ok).toBe(true);
  });

  it('has zero issues without io as well', () => {
    expect(validateKnowledgeBase(kb).issues).toEqual([]);
  });

  it('reports a dangling related id with the entry path and code (scenario 4)', () => {
    const raw = loadRawKnowledgeBase();
    const entries = structuredClone(raw.entries) as Array<Record<string, unknown>>;
    entries[0] = { ...entries[0], related: ['rebellion:does.not-exist'] };
    const result = validateKnowledgeBase(parseKnowledgeBase({ ...raw, entries }));
    expect(result.ok).toBe(false);
    expect(result.issues).toContainEqual(
      expect.objectContaining({ code: 'ENTRY_REF_UNKNOWN', path: 'entries.0.related.0' }),
    );
  });
});

describe('Rebellion knowledge base — manifest and sources (AC-1)', () => {
  const { manifest } = kb;
  const source = (id: string) => {
    const found = manifest.sources.find((s) => s.id === id);
    if (!found) throw new Error(`source ${id} missing`);
    return found;
  };

  it('is the base game only', () => {
    expect(manifest.gameId).toBe('rebellion');
    expect(manifest.products).toEqual(['base']);
    expect(manifest.excludedProducts).toEqual(['rise-of-the-empire']);
  });

  it('describes RR, LTP and FAQ v2.1 with the official URLs, hashes, page counts and retrieval date', () => {
    expect(manifest.sources.map((s) => s.id).sort()).toEqual(['FAQ', 'LTP', 'RR']);
    expect(source('RR').url).toBe(
      'https://images-cdn.fantasyflightgames.com/filer_public/d9/76/d97645d4-3973-41b6-ad78-6c9b927d3bc1/sw03_rules_reference_web.pdf',
    );
    expect(source('LTP').url).toBe(
      'https://images-cdn.fantasyflightgames.com/filer_public/0b/07/0b07601a-6ac3-4333-ac41-b6d1b9a979da/sw03_learn_to_play_web.pdf',
    );
    expect(source('FAQ').url).toBe(
      'https://images-cdn.fantasyflightgames.com/filer_public/53/ac/53ac8f34-2d3b-4ec1-bfe8-816811756692/sw03_faq_v2_1.pdf',
    );
    expect(source('RR').sha256).toBe(
      '0b5af3a28bc4bc29a16f84456ed3a6543bf4d6a141461971e6fb170c6afba35a',
    );
    expect(source('FAQ').sha256).toBe(
      '0f6cdcbe9bf50d8afe6d17bfb6d8936d99ea1f060b89bcd9500ce5fafcebd82e',
    );
    expect([source('RR').pages, source('LTP').pages, source('FAQ').pages]).toEqual([16, 20, 8]);
    for (const s of manifest.sources) {
      expect(s.retrievedAt).toBe('2026-11-20');
      expect(s.status).toBe('current');
      expect(s.version.length).toBeGreaterThan(0);
      expect(s.date.length).toBeGreaterThan(0);
    }
    expect(source('RR').kind).toBe('rules');
    expect(source('LTP').kind).toBe('tutorial');
    expect(source('FAQ').kind).toBe('faq');
  });

  it('records the LTP mirror and why it was used', () => {
    const { mirror } = source('LTP');
    expect(mirror?.url).toContain('1j1ju');
    expect(mirror?.sha256).toBe('e471220f4130a091c954c7d07696830a281c95bd3dd5f294c552b1a82a29fe16');
    expect(mirror?.reason).toContain('503');
    expect(source('LTP').sha256).toBe(
      'b26b98139d694e9f42cb36060ec82fdc3000ab753d29809be03b7bc44d8598fc',
    );
    expect(source('LTP').date).toBe('2016-03-22');
  });

  it('excludes the Rise of the Empire pages of the FAQ and ranks RR above LTP', () => {
    expect(source('FAQ').excludedPages).toEqual([6, 7, 8]);
    expect(source('FAQ').version).toContain('2.1');
    expect(source('FAQ').date.startsWith('2019')).toBe(true);
    expect(source('RR').precedence).toBeLessThan(source('LTP').precedence);
  });

  it('rejects an entry of an excluded product or citing an excluded FAQ page (TC-S-07, TC-S-08)', () => {
    const raw = loadRawKnowledgeBase();
    const entries = structuredClone(raw.entries) as Array<Record<string, unknown>>;
    entries[0] = { ...entries[0], product: 'rise-of-the-empire' };
    entries[1] = {
      ...entries[1],
      sources: [{ sourceId: 'FAQ', page: 7, section: 'Rise of the Empire' }],
    };
    const { issues } = validateKnowledgeBase(parseKnowledgeBase({ ...raw, entries }));
    expect(issues).toContainEqual(
      expect.objectContaining({ code: 'ENTRY_PRODUCT_UNKNOWN', path: 'entries.0.product' }),
    );
    expect(issues).toContainEqual(
      expect.objectContaining({ code: 'SOURCE_PAGE_EXCLUDED', path: 'entries.1.sources.0.page' }),
    );
  });
});
