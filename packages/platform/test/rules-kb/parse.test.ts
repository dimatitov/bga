import { describe, expect, it } from 'vitest';
import {
  KnowledgeBaseParseError,
  RULES_KB_FORMAT_VERSION,
  RULES_KB_LIMITS,
  parseKnowledgeBase,
  type KbIssue,
} from '../../src/rules-kb';
import { fixtureInput, type FixtureInput } from './fixture';

function parseIssues(mutate: (input: FixtureInput) => void): readonly KbIssue[] {
  const input = fixtureInput();
  mutate(input);
  try {
    parseKnowledgeBase(input);
  } catch (error) {
    expect(error).toBeInstanceOf(KnowledgeBaseParseError);
    return (error as KnowledgeBaseParseError).issues;
  }
  throw new Error('expected a KnowledgeBaseParseError');
}

describe('parseKnowledgeBase', () => {
  it('exposes the format constants', () => {
    expect(RULES_KB_FORMAT_VERSION).toBe(1);
    expect(RULES_KB_LIMITS).toEqual({
      entryTextMaxChars: 600,
      quoteMaxWords: 25,
      quoteWordsPerSourceMax: 400,
    });
  });

  it('parses the fixture and fills defaults', () => {
    const kb = parseKnowledgeBase(fixtureInput());
    expect(kb.manifest.gameId).toBe('star-forge');
    expect(kb.entries).toHaveLength(8);
    expect(kb.entries[0]?.ai).toBe('situational');
    expect(kb.entries[1]?.ai).toBe('core');
    expect(kb.coverage?.engine).toBe('forge-v1');
    expect(kb.discrepancies.map((d) => d.id)).toEqual(['DISC-001', 'DISC-002']);
  });

  it('coverage and discrepancies are optional; excludedProducts/sourceSections default to []', () => {
    const { manifest, entries } = fixtureInput();
    delete manifest.excludedProducts;
    delete manifest.sourceSections;
    const kb = parseKnowledgeBase({ manifest, entries });
    expect(kb.coverage).toBeUndefined();
    expect('coverage' in kb).toBe(false);
    expect(kb.discrepancies).toEqual([]);
    expect(kb.manifest.excludedProducts).toEqual([]);
    expect(kb.manifest.sourceSections).toEqual([]);
  });

  it.each<[string, (i: FixtureInput) => void, string]>([
    [
      'formatVersion 2',
      (i) => Object.assign(i.manifest, { formatVersion: 2 }),
      'manifest.formatVersion',
    ],
    ['unknown entry kind', (i) => Object.assign(i.entries[0]!, { kind: 'note' }), 'entries.0.kind'],
    [
      'page of a wrong type',
      (i) => Object.assign(i.entries[1]!.sources[0]!, { page: '3' }),
      'entries.1.sources.0.page',
    ],
    [
      'misspelled field (strict objects)',
      (i) => Object.assign(i.entries[2]!, { titel: 'x' }),
      'entries.2',
    ],
    [
      'bad sha256',
      (i) => Object.assign(i.manifest.sources[0]!, { sha256: 'abc' }),
      'manifest.sources.0.sha256',
    ],
    [
      'unknown coverage status',
      (i) => Object.assign(i.coverage.items[0]!, { status: 'done' }),
      'coverage.items.0.status',
    ],
    [
      'unknown discrepancy decision',
      (i) => Object.assign(i.discrepancies[0]!, { decision: 'maybe' }),
      'discrepancies.0.decision',
    ],
  ])('rejects %s with SCHEMA_INVALID and a path to the field (TC-V-02)', (_title, mutate, path) => {
    const issues = parseIssues(mutate);
    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({ code: 'SCHEMA_INVALID', path });
  });

  it('collects issues of all parts and puts paths into the message', () => {
    const issues = parseIssues((i) => {
      Object.assign(i.manifest, { language: 'ru' });
      Object.assign(i.entries[3]!, { status: 'draft' });
      Object.assign(i.discrepancies[1]!, { severity: 'critical' });
    });
    expect(issues.map((x) => x.path)).toEqual([
      'manifest.language',
      'entries.3.status',
      'discrepancies.1.severity',
    ]);
    expect(issues.every((x) => x.code === 'SCHEMA_INVALID')).toBe(true);
    expect(() => parseKnowledgeBase({ manifest: {}, entries: 'x' })).toThrow(/manifest\..*entries/);
  });

  it('entries must be a flat array', () => {
    const { manifest, entries } = fixtureInput();
    expect(() => parseKnowledgeBase({ manifest, entries: [entries] })).toThrow(
      KnowledgeBaseParseError,
    );
  });
});
