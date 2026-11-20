import { type KbIssue, type KbIssueCode } from './issues';
import { type KbCoverage } from './schema';

/**
 * Synchronous file access injected by the consumer (C-4 Q-BE-5); paths are repository-root-relative POSIX
 * paths as written in `coverage.json`. The platform itself never touches the file system (B-1).
 */
export interface KnowledgeBaseIo {
  fileExists(path: string): boolean;
  readText(path: string): string;
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** `symbol` occurs in `text` as a whole identifier (not as a part of a longer one). */
export function containsSymbol(text: string, symbol: string): boolean {
  const re = new RegExp(`(?<![A-Za-z0-9_$])${escapeRegExp(symbol)}(?![A-Za-z0-9_$])`);
  return re.test(text);
}

/** File checks of coverage evidence: implementation files/symbols and test files/names exist. */
export function validateCoverageIo(coverage: KbCoverage, io: KnowledgeBaseIo): KbIssue[] {
  const issues: KbIssue[] = [];
  const add = (code: KbIssueCode, path: string, message: string) =>
    issues.push({ code, path, message });

  const exists = new Map<string, boolean>();
  const texts = new Map<string, string>();
  const fileExists = (path: string): boolean => {
    let value = exists.get(path);
    if (value === undefined) {
      value = io.fileExists(path);
      exists.set(path, value);
    }
    return value;
  };
  const readText = (path: string): string => {
    let value = texts.get(path);
    if (value === undefined) {
      value = io.readText(path);
      texts.set(path, value);
    }
    return value;
  };

  coverage.items.forEach((item, i) => {
    const base = `coverage.items.${i}`;
    item.implementation?.forEach((impl, j) => {
      const at = `${base}.implementation.${j}`;
      if (!fileExists(impl.path)) {
        add(
          'FILE_MISSING',
          `${at}.path`,
          `${item.ruleId}: implementation file "${impl.path}" not found`,
        );
      } else if (!containsSymbol(readText(impl.path), impl.symbol)) {
        add(
          'SYMBOL_NOT_FOUND',
          `${at}.symbol`,
          `${item.ruleId}: symbol "${impl.symbol}" not found in "${impl.path}"`,
        );
      }
    });
    item.tests?.forEach((test, j) => {
      const at = `${base}.tests.${j}`;
      if (!fileExists(test.path)) {
        add('FILE_MISSING', `${at}.path`, `${item.ruleId}: test file "${test.path}" not found`);
      } else if (!readText(test.path).includes(test.name)) {
        add(
          'TEST_NOT_FOUND',
          `${at}.name`,
          `${item.ruleId}: test "${test.name}" not found in "${test.path}"`,
        );
      }
    });
  });
  return issues;
}
