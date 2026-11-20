import { describe, expect, it } from 'vitest';
import { validateKnowledgeBase, type KbIssueCode, type KnowledgeBaseIo } from '../../src/rules-kb';
import { FIXTURE_FILES, fixtureKb, memoryIo } from './fixture';

const BUILD_SRC = 'games/star-forge/src/build.ts';
const BUILD_TEST = 'games/star-forge/test/build.test.ts';

function codesAndPaths(files: Record<string, string>) {
  return validateKnowledgeBase(fixtureKb(), memoryIo(files)).issues.map(({ code, path }) => ({
    code,
    path,
  }));
}

function without(path: string): Record<string, string> {
  const files = { ...FIXTURE_FILES };
  delete files[path];
  return files;
}

describe('validateKnowledgeBase with io (files, symbols, tests)', () => {
  it('the fixture evidence exists (TC-C-01 analogue)', () => {
    expect(validateKnowledgeBase(fixtureKb(), memoryIo())).toEqual({ ok: true, issues: [] });
  });

  it.each<[KbIssueCode, string, Record<string, string>, string]>([
    [
      'FILE_MISSING',
      'implementation file missing',
      without(BUILD_SRC),
      'coverage.items.2.implementation.0.path',
    ],
    ['FILE_MISSING', 'test file missing', without(BUILD_TEST), 'coverage.items.2.tests.0.path'],
    [
      'SYMBOL_NOT_FOUND',
      'symbol absent',
      { ...FIXTURE_FILES, [BUILD_SRC]: 'export function buildIt() {}\n' },
      'coverage.items.2.implementation.0.symbol',
    ],
    [
      'SYMBOL_NOT_FOUND',
      'symbol only as a part of a longer identifier',
      { ...FIXTURE_FILES, [BUILD_SRC]: 'export function placeForgeNow() {}\n$placeForge;\n' },
      'coverage.items.2.implementation.0.symbol',
    ],
    [
      'TEST_NOT_FOUND',
      'test name absent',
      { ...FIXTURE_FILES, [BUILD_TEST]: "it('builds', () => {});\n" },
      'coverage.items.2.tests.0.name',
    ],
  ])('%s: %s', (code, _title, files, path) => {
    expect(codesAndPaths(files)).toEqual([{ code, path }]);
  });

  it('messages name the rule and the file', () => {
    const [issue] = validateKnowledgeBase(fixtureKb(), memoryIo(without(BUILD_SRC))).issues;
    expect(issue?.message).toContain('star-forge:build.place-forge');
    expect(issue?.message).toContain(BUILD_SRC);
  });

  it('without io the file checks are skipped, the rest still runs (TC-V-28)', () => {
    expect(validateKnowledgeBase(fixtureKb())).toEqual({ ok: true, issues: [] });
    expect(validateKnowledgeBase(fixtureKb(), memoryIo({})).ok).toBe(false);
  });

  it('reads each file at most once per validation', () => {
    const calls: string[] = [];
    const base = memoryIo();
    const io: KnowledgeBaseIo = {
      fileExists: (p) => base.fileExists(p),
      readText: (p) => {
        calls.push(p);
        return base.readText(p);
      },
    };
    validateKnowledgeBase(fixtureKb(), io);
    expect(calls).toHaveLength(new Set(calls).size);
    // turn.ts (2 symbols) and turn.test.ts (2 tests) are shared by two coverage items
    expect(calls).toHaveLength(4);
  });
});
