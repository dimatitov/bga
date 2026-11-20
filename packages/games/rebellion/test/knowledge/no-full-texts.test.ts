/**
 * SWR-005C W2 — no copyrighted full texts in the repository (AC-11; TC-P-01..03).
 */
import { execFileSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';
import { RULES_KB_LIMITS } from '@bga/platform/rules-kb';
import { REPO_ROOT, loadKnowledgeBase } from './load-kb';

const kb = loadKnowledgeBase();

function words(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

describe('no full texts (AC-11)', () => {
  it('git tracks no PDF files', () => {
    const tracked = execFileSync('git', ['ls-files', '*.pdf', '*.PDF'], {
      cwd: REPO_ROOT,
      encoding: 'utf8',
    });
    expect(tracked.trim()).toBe('');
  });

  it('keeps texts within 600 characters and quotes within 25 words and the per-source budget', () => {
    const perSource = new Map<string, number>();
    for (const e of kb.entries) {
      expect([...e.text].length, e.id).toBeLessThanOrEqual(RULES_KB_LIMITS.entryTextMaxChars);
      const refs = [...e.sources, ...(e.exceptions ?? []).flatMap((x) => x.sources ?? [])];
      for (const ref of refs) {
        if (ref.quote === undefined) continue;
        expect(words(ref.quote), e.id).toBeLessThanOrEqual(RULES_KB_LIMITS.quoteMaxWords);
        perSource.set(ref.sourceId, (perSource.get(ref.sourceId) ?? 0) + words(ref.quote));
      }
    }
    for (const [sourceId, total] of perSource) {
      expect(total, sourceId).toBeLessThanOrEqual(RULES_KB_LIMITS.quoteWordsPerSourceMax);
    }
  });

  it('quotes sparingly: most entries carry no quote', () => {
    const quoted = kb.entries.filter((e) => e.sources.some((r) => r.quote !== undefined));
    expect(quoted.length).toBeLessThan(kb.entries.length / 10);
  });
});
