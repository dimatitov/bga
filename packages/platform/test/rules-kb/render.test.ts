import { describe, expect, it } from 'vitest';
import {
  parseKnowledgeBase,
  renderCoverageMatrix,
  renderDiscrepancies,
  renderRulesIndex,
} from '../../src/rules-kb';
import { fixtureInput, fixtureKb } from './fixture';

const HEADER =
  '<!-- Generated from packages/games/star-forge/knowledge — do not edit; UPDATE_KB_DOCS=1 -->';
const kb = fixtureKb();
const RENDERERS = [renderRulesIndex, renderCoverageMatrix, renderDiscrepancies];

describe('render* (C-3, Q-BE-3)', () => {
  it.each(RENDERERS.map((r) => [r.name, r] as const))(
    '%s: header, single trailing newline, deterministic',
    (_name, render) => {
      const md = render(kb);
      expect(md.split('\n')[0]).toBe(HEADER);
      expect(md.endsWith('\n')).toBe(true);
      expect(md.endsWith('\n\n')).toBe(false);
      expect(md).not.toMatch(/\n\n\n/);
      expect(md).not.toMatch(/[ \t]+\n/);
      expect(render(fixtureKb())).toBe(md);
    },
  );

  it.each(RENDERERS.map((r) => [r.name, r] as const))(
    '%s: title and preamble options',
    (_name, render) => {
      const md = render(kb, { title: 'Custom title', preamble: '## Audit\n\nAll good.  \n' });
      expect(md.split('\n').slice(0, 7)).toEqual([
        HEADER,
        '',
        '# Custom title',
        '',
        '## Audit',
        '',
        'All good.',
      ]);
    },
  );

  it('renders the coverage matrix (snapshot)', () => {
    expect(renderCoverageMatrix(kb)).toBe(
      [
        HEADER,
        '',
        '# Star Forge — coverage matrix (forge-v1)',
        '',
        '## Summary',
        '',
        '| Status | Rules |',
        '|---|---|',
        '| implemented | 2 |',
        '| partial | 1 |',
        '| deviation | 0 |',
        '| not-implemented | 1 |',
        '| not-applicable | 1 |',
        '| **total** | 5 |',
        '',
        '## Rules',
        '',
        '| Rule | Status | Implementation | Tests | Discrepancies | Note |',
        '|---|---|---|---|---|---|',
        '| `star-forge:build.place-forge`<br>Placing a forge | partial | `games/star-forge/src/build.ts` `placeForge` | `games/star-forge/test/build.test.ts` › places a forge | DISC-002 |  |',
        '| `star-forge:combat.resolve`<br>Resolving combat | not-implemented |  |  | DISC-001 |  |',
        '| `star-forge:setup.board`<br>Board setup | not-applicable |  |  |  | Setup is fixed by the scenario. |',
        '| `star-forge:turn.order`<br>Turn order | implemented | `games/star-forge/src/turn.ts` `nextPlayer` | `games/star-forge/test/turn.test.ts` › fewest stations first |  |  |',
        '| `star-forge:victory.score`<br>Winning the game | implemented | `games/star-forge/src/turn.ts` `checkVictory` | `games/star-forge/test/turn.test.ts` › five forges win |  |  |',
        '',
      ].join('\n'),
    );
  });

  it('renders the rules index by the category tree', () => {
    const md = renderRulesIndex(kb);
    expect(md).toContain('# Star Forge — rules index');
    expect(md).toContain(
      '| `SFQ` | [Star Forge FAQ](https://example.com/star-forge/faq.pdf) | faq |',
    );
    expect(md).toContain('| rule | 5 |');
    const turn = md.indexOf('## Turn (`turn`)');
    const build = md.indexOf('### Building (`build`)');
    const combat = md.indexOf('## Combat (`combat`)');
    expect(turn).toBeGreaterThan(0);
    expect(build).toBeGreaterThan(turn);
    expect(combat).toBeGreaterThan(build);
    expect(md).toContain(
      '- `star-forge:turn.pass-timing` Passing mid-turn — interpretation, **needs-review** (SFR p.3)',
    );
    for (const e of kb.entries) expect(md).toContain(`\`${e.id}\``);
    expect(md).not.toContain('Uncategorized');
  });

  it('renders discrepancies with summaries and cards', () => {
    const md = renderDiscrepancies(kb);
    expect(md).toContain('| missing-mechanic | 1 |');
    expect(md).toContain('| high | 1 |');
    expect(md).toContain('| accepted-for-slice | 1 |');
    expect(md).toContain('### DISC-001 — No combat');
    expect(md).toContain('- **Refs:** `star-forge:combat.engine-gap`, SFR p.7');
    expect(md.indexOf('### DISC-001')).toBeLessThan(md.indexOf('### DISC-002'));
  });

  it('handles a knowledge base without coverage and discrepancies', () => {
    const { manifest, entries } = fixtureInput();
    const bare = parseKnowledgeBase({ manifest, entries });
    expect(renderCoverageMatrix(bare)).toContain('_No coverage data._');
    expect(renderDiscrepancies(bare)).toContain('_No discrepancies._');
  });

  it('escapes table cells and lists entries of unknown categories', () => {
    const input = fixtureInput();
    input.entries[0]!.title = 'A | B';
    input.entries[0]!.category = 'lost';
    input.coverage.items[0]!.note = 'x | y';
    const odd = parseKnowledgeBase(input);
    expect(renderCoverageMatrix(odd)).toContain('A \\| B');
    expect(renderCoverageMatrix(odd)).toContain('x \\| y');
    expect(renderRulesIndex(odd)).toContain('## Uncategorized');
  });
});
