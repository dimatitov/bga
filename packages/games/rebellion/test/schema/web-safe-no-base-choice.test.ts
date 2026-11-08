/**
 * SWR-005 (plan-backend §2 "check:bundle", TC-H-17 package side; added on INTEGRATION by backend-lead):
 * the web-reachable subpaths `./schema` and `./board` never carry the rebel-base choice. The choice lives
 * only in `./rules` (`chooseRebelBase`, server-only); there is no stored candidate list (`rebelBaseCandidates`,
 * W1 decision 2). The bundle-level module check stays in `scripts/check-web-bundle.mjs`.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const SRC = join(__dirname, '..', '..', 'src');

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(full);
    return entry.name.endsWith('.ts') ? [full] : [];
  });
}

describe.each(['schema', 'board'])('src/%s (web-reachable)', (subpath) => {
  const files = sourceFiles(join(SRC, subpath));

  it('has source files', () => {
    expect(files.length).toBeGreaterThan(0);
  });

  it.each(['chooseRebelBase', 'rebelBaseCandidates', 'fnv1a32'])('never mentions %s', (symbol) => {
    const offenders = files.filter((file) => readFileSync(file, 'utf8').includes(symbol));
    expect(offenders).toEqual([]);
  });
});
