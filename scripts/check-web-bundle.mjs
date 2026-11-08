#!/usr/bin/env node
// SWR-002 review #3: automated check that the production web bundle carries no secrets of the
// mock scenario and no dev/test hooks (AC-12, TC-ARCH-08, R-11).
//
// Forbidden values are derived at runtime from packages/game-data (its compiled dist), so the check
// follows the scenario when it changes. Patterns are chosen to avoid false positives:
// - piece ids are matched only as quoted string literals ("pc-21"); the web gets pieces from the API,
//   so no piece id may be baked into the bundle (it would expose the hidden piece → type mapping);
// - the rebel base is matched only as an assignment (`rebelBaseSystemId: "<string>"` or
//   `rebelBase: { systemId: "<base>"`) — the bare key name may legitimately appear in Zod schemas;
// - typeKeys are NOT searched: i18n catalogues legitimately contain names like `covert-cell`.
//
// Usage: node scripts/check-web-bundle.mjs [--dist <dir>] [--rebuild]
//   Reads apps/web/dist; builds it first (pnpm --filter @swr/web build) if it is missing or --rebuild.
// Exit: 0 clean, 1 forbidden content found, 2 usage/setup error.

import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const SCRIPTS_DIR = path.dirname(fileURLToPath(import.meta.url));
export const REPO_ROOT = path.resolve(SCRIPTS_DIR, '..');
const TEXT_EXT = new Set(['.js', '.mjs', '.cjs', '.html', '.css', '.json', '.map', '.txt', '.svg']);

function escapeRegExp(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Rules derived from a scenario object ({ pieces: [{ id, hidden?, typeKey }], rebelBaseSystemId }).
 * @returns {{ id: string, description: string, regex: RegExp }[]}
 */
export function forbiddenFromScenario(scenario) {
  const rules = [
    {
      id: 'board-debug-hook',
      description: '`__boardDebug` dev/test hook in a production bundle (R-11, TC-ARCH-08)',
      regex: /__boardDebug/,
    },
    {
      id: 'rebel-base-assignment',
      description: 'scenario rebel base assignment (`rebelBaseSystemId: "<id>"`)',
      regex: /rebelBaseSystemId["'`]?\s*:\s*["'`]/,
    },
  ];
  const base = scenario.rebelBaseSystemId;
  if (typeof base === 'string' && base.length > 0) {
    rules.push({
      id: 'rebel-base-system',
      description: `rebel base system "${base}" bound to a rebelBase field`,
      regex: new RegExp(
        `rebelBase(SystemId)?["'\`]?\\s*:\\s*(\\{\\s*["'\`]?systemId["'\`]?\\s*:\\s*)?["'\`]${escapeRegExp(base)}["'\`]`,
      ),
    });
  }
  const ids = (scenario.pieces ?? []).map((p) => p.id).filter((id) => typeof id === 'string');
  if (ids.length > 0) {
    rules.push({
      id: 'scenario-piece-id',
      description: 'scenario piece id as a string literal (pieces must come from the API PlayerView)',
      regex: new RegExp(`["'\`](${ids.map(escapeRegExp).join('|')})["'\`]`),
    });
  }
  const hidden = (scenario.pieces ?? []).filter((p) => p.hidden === true);
  for (const p of hidden) {
    rules.push({
      id: 'hidden-piece-mapping',
      description: `hidden piece ${p.id} → its typeKey`,
      regex: new RegExp(
        `${escapeRegExp(p.id)}[\\s\\S]{0,200}${escapeRegExp(p.typeKey)}|${escapeRegExp(p.typeKey)}[\\s\\S]{0,200}["'\`]${escapeRegExp(p.id)}["'\`]`,
      ),
    });
  }
  return rules;
}

/**
 * Scan in-memory files. @param files {{ name: string, content: string }[]}
 * @returns {{ file: string, rule: string, description: string, excerpt: string }[]}
 */
export function scanFiles(files, rules) {
  const findings = [];
  for (const { name, content } of files) {
    for (const rule of rules) {
      const m = rule.regex.exec(content);
      if (!m) continue;
      const start = Math.max(0, m.index - 40);
      const excerpt = content.slice(start, m.index + Math.min(m[0].length, 80) + 40).replace(/\s+/g, ' ');
      findings.push({ file: name, rule: rule.id, description: rule.description, excerpt });
    }
  }
  return findings;
}

/** All text files under `dir` (relative names). */
export function readTextFiles(dir) {
  const out = [];
  const walk = (d) => {
    for (const entry of fs.readdirSync(d, { withFileTypes: true })) {
      const full = path.join(d, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (TEXT_EXT.has(path.extname(entry.name))) {
        out.push({ name: path.relative(dir, full), content: fs.readFileSync(full, 'utf8') });
      }
    }
  };
  walk(dir);
  return out;
}

/** Load the mock scenario from the compiled game-data package (CJS dist). */
export function loadScenario(repoRoot = REPO_ROOT) {
  const entry = path.join(repoRoot, 'packages', 'game-data', 'dist', 'index.js');
  if (!fs.existsSync(entry)) {
    throw new Error(`${entry} not found — run \`pnpm run build:packages\` first`);
  }
  const mod = createRequire(import.meta.url)(entry);
  if (!mod.mockScenario) throw new Error('packages/game-data does not export mockScenario');
  return mod.mockScenario;
}

function main(argv) {
  const args = argv.slice(2);
  const distIdx = args.indexOf('--dist');
  const dist = distIdx >= 0 ? path.resolve(args[distIdx + 1] ?? '') : path.join(REPO_ROOT, 'apps', 'web', 'dist');
  const rebuild = args.includes('--rebuild');

  if (rebuild || !fs.existsSync(path.join(dist, 'index.html'))) {
    console.log(`check-web-bundle: building apps/web (${rebuild ? '--rebuild' : 'dist missing'})`);
    const res = spawnSync('pnpm', ['--filter', '@swr/web', 'run', 'build'], {
      cwd: REPO_ROOT,
      stdio: 'inherit',
    });
    if (res.status !== 0) {
      console.error('check-web-bundle: web build failed');
      return 2;
    }
  }

  let scenario;
  try {
    scenario = loadScenario();
  } catch (e) {
    console.error(`check-web-bundle: ${e.message}`);
    return 2;
  }
  const rules = forbiddenFromScenario(scenario);
  const files = readTextFiles(dist);
  if (files.length === 0) {
    console.error(`check-web-bundle: no text files in ${dist}`);
    return 2;
  }
  const findings = scanFiles(files, rules);
  for (const f of findings) {
    console.log(`FORBIDDEN ${f.file} [${f.rule}] ${f.description}\n  …${f.excerpt}…`);
  }
  if (findings.length > 0) {
    console.log(`FAIL check-web-bundle: ${findings.length} finding(s) in ${files.length} files`);
    return 1;
  }
  console.log(
    `OK check-web-bundle: ${files.length} files in ${path.relative(REPO_ROOT, dist) || dist}, ${rules.length} rules (${rules.map((r) => r.id).join(', ')})`,
  );
  return 0;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = main(process.argv);
}
