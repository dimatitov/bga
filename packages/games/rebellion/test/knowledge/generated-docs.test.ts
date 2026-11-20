/**
 * SWR-005C W2 — generated rules documents are up to date (AC-5, AC-6; TC-G-01..03; plan-backend §4).
 * Regenerate: UPDATE_KB_DOCS=1 pnpm --filter @bga/game-rebellion exec vitest run test/knowledge/generated-docs.test.ts
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  renderCoverageMatrix,
  renderDiscrepancies,
  renderRulesIndex,
  type KnowledgeBase,
} from '@bga/platform/rules-kb';
import { DOCS_DIR, loadKnowledgeBase, readAuditSummary, repoPath } from './load-kb';

const REGENERATE =
  'run: UPDATE_KB_DOCS=1 pnpm --filter @bga/game-rebellion exec vitest run test/knowledge/generated-docs.test.ts';
const update = process.env.UPDATE_KB_DOCS === '1';
const kb = loadKnowledgeBase();

const DOCS: Array<[string, (kb: KnowledgeBase) => string]> = [
  [
    'rules-index.md',
    (k) => renderRulesIndex(k, { title: 'Star Wars: Rebellion — rules knowledge base (index)' }),
  ],
  [
    'coverage-matrix.md',
    (k) => renderCoverageMatrix(k, { title: 'Star Wars: Rebellion — core-v1 coverage matrix' }),
  ],
  [
    'discrepancies.md',
    (k) =>
      renderDiscrepancies(k, {
        title: 'Star Wars: Rebellion — core-v1 audit and discrepancies',
        preamble: readAuditSummary(),
      }),
  ],
];

describe('generated rules documents', () => {
  it.each(DOCS)('%s is up to date', (name, render) => {
    const path = repoPath(`${DOCS_DIR}/${name}`);
    const expected = render(kb);
    expect(render(kb)).toBe(expected);
    if (update) {
      mkdirSync(repoPath(DOCS_DIR), { recursive: true });
      writeFileSync(path, expected);
    }
    expect(existsSync(path), `${DOCS_DIR}/${name} missing — ${REGENERATE}`).toBe(true);
    expect(readFileSync(path, 'utf8'), `${DOCS_DIR}/${name} is stale — ${REGENERATE}`).toBe(
      expected,
    );
  });

  it('the discrepancies document carries the audit verdict (AC-6)', () => {
    const text = renderDiscrepancies(kb, { preamble: readAuditSummary() });
    expect(text).toContain('Ошибок реализации в рамках среза не найдено');
    expect(text).toContain('DISC-009');
  });
});
