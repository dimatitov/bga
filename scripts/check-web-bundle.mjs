#!/usr/bin/env node
// SWR-002 review #3: automated check that the production web bundle carries no secrets of the
// mock scenario and no dev/test hooks (AC-12, TC-ARCH-08, R-11).
//
// Forbidden values are derived at runtime from @bga/game-rebellion/scenario (its compiled dist), so the check
// follows the scenario when it changes. Patterns are chosen to avoid false positives:
// - piece ids are matched only as quoted string literals ("pc-21"); the web gets pieces from the API,
//   so no piece id may be baked into the bundle (it would expose the hidden piece → type mapping);
// - the rebel base is matched only as an assignment (`rebelBaseSystemId: "<string>"` or
//   `rebelBase: { systemId: "<base>"`) — the bare key name may legitimately appear in Zod schemas;
// - typeKeys are NOT searched: i18n catalogues legitimately contain names like `covert-cell`.
//
// SWR-003 Q-23 / TR-8 / TC-ARCH-08 — module composition: a separate web build with hidden sourcemaps
// (into a temp dir; apps/web/dist is untouched) lists the source modules of the bundle; it fails if any
// game-package module outside ./definition ./schema ./board ./assets (e.g. rules, scenario, server, ai)
// got into the bundle.
//
// Usage: node scripts/check-web-bundle.mjs [--dist <dir>] [--rebuild] [--modules] [--modules-dir <dir>] [--skip-modules]
//   Reads apps/web/dist; builds it first (pnpm --filter @bga/web build) if it is missing or --rebuild.
//   --modules          also print every game-package module of the bundle;
//   --modules-dir <d>  analyse the *.map files already in <d> instead of building (tests / debugging);
//   --skip-modules     skip the module-composition check (local debugging only; never in `pnpm verify`).
// Exit: 0 clean, 1 forbidden content or modules found, 2 usage/setup error.

import fs from 'node:fs';
import os from 'node:os';
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

/** Load the mock scenario from the compiled `@bga/game-rebellion/scenario` subpath (CJS dist). */
export function loadScenario(repoRoot = REPO_ROOT) {
  const entry = path.join(repoRoot, 'packages', 'games', 'rebellion', 'dist', 'scenario', 'index.js');
  if (!fs.existsSync(entry)) {
    throw new Error(`${entry} not found — run \`pnpm run build:packages\` first`);
  }
  const mod = createRequire(import.meta.url)(entry);
  if (!mod.mockScenario) throw new Error('@bga/game-rebellion/scenario does not export mockScenario');
  return mod.mockScenario;
}

/** Game-package entry points the web bundle may contain (Q-8, Q-23). */
export const WEB_GAME_SUBPATHS = ['definition', 'schema', 'board', 'assets'];
const GAME_MODULE_RE = /(?:^|\/)packages\/games\/([^/]+)\/(?:src|dist)\/(.+)$/;

/**
 * Game-package modules among sourcemap `sources` (paths relative or absolute; `\` normalised).
 * @returns {{ source: string, game: string, subpath: string }[]} subpath '(root)' for a file directly in src/.
 */
export function gameModules(sources) {
  const out = [];
  for (const raw of sources) {
    const source = String(raw).replace(/\\/g, '/');
    const m = GAME_MODULE_RE.exec(source);
    if (!m) continue;
    const rest = m[2];
    const slash = rest.indexOf('/');
    out.push({ source, game: m[1], subpath: slash >= 0 ? rest.slice(0, slash) : '(root)' });
  }
  return out;
}

/** Game modules that must never reach the web bundle (rules, scenario, server, ai, or anything unknown). */
export function forbiddenGameModules(sources) {
  return gameModules(sources).filter((m) => !WEB_GAME_SUBPATHS.includes(m.subpath));
}

/** `sources` of every *.map file under `dir`. */
export function readMapSources(dir) {
  const sources = [];
  const walk = (d) => {
    for (const entry of fs.readdirSync(d, { withFileTypes: true })) {
      const full = path.join(d, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.name.endsWith('.map')) {
        const map = JSON.parse(fs.readFileSync(full, 'utf8'));
        for (const src of map.sources ?? []) sources.push(src);
      }
    }
  };
  walk(dir);
  return sources;
}

/** Separate production build of apps/web with hidden sourcemaps into a temp dir. @returns the dir or null. */
function buildWithSourcemaps() {
  const outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bga-bundle-modules-'));
  console.log(`check-web-bundle: module check — building apps/web with sourcemaps into ${outDir}`);
  const res = spawnSync(
    'pnpm',
    ['--filter', '@bga/web', 'exec', 'vite', 'build', '--sourcemap', 'hidden', '--outDir', outDir, '--emptyOutDir', '--logLevel', 'warn'],
    { cwd: REPO_ROOT, stdio: 'inherit' },
  );
  if (res.status !== 0) {
    fs.rmSync(outDir, { recursive: true, force: true });
    return null;
  }
  return outDir;
}

/** @returns {number} 0 clean, 1 forbidden modules, 2 setup error */
function checkBundleModules({ modulesDir, listModules }) {
  const dir = modulesDir ?? buildWithSourcemaps();
  if (!dir) {
    console.error('check-web-bundle: web build with sourcemaps failed');
    return 2;
  }
  try {
    const sources = readMapSources(dir);
    if (sources.length === 0) {
      console.error(`check-web-bundle: no sourcemap sources in ${dir}`);
      return 2;
    }
    const all = gameModules(sources);
    if (all.length === 0) {
      // The web always uses some game schema/board: none found means the check would prove nothing.
      console.error('check-web-bundle: no game-package modules found in the sourcemaps — cannot verify composition');
      return 2;
    }
    const bySubpath = new Map();
    for (const m of all) {
      const key = `${m.game}/${m.subpath}`;
      bySubpath.set(key, (bySubpath.get(key) ?? 0) + 1);
    }
    const summary = [...bySubpath].sort().map(([k, n]) => `${k} (${n})`).join(', ');
    console.log(`check-web-bundle: game modules in the bundle: ${summary}`);
    if (listModules) for (const m of all) console.log(`  module ${m.game}/${m.subpath}: ${m.source}`);
    const forbidden = forbiddenGameModules(sources);
    for (const m of forbidden) {
      console.log(`FORBIDDEN module ${m.source} [game-${m.game}/${m.subpath}] — web may bundle only ${WEB_GAME_SUBPATHS.join(', ')}`);
    }
    if (forbidden.length > 0) {
      console.log(`FAIL check-web-bundle: ${forbidden.length} forbidden game module(s) in the bundle`);
      return 1;
    }
    console.log(`OK check-web-bundle modules: ${sources.length} sources, ${all.length} game modules, only ${WEB_GAME_SUBPATHS.join('/')}`);
    return 0;
  } finally {
    if (!modulesDir) fs.rmSync(dir, { recursive: true, force: true });
  }
}

function main(argv) {
  const args = argv.slice(2);
  const distIdx = args.indexOf('--dist');
  const dist = distIdx >= 0 ? path.resolve(args[distIdx + 1] ?? '') : path.join(REPO_ROOT, 'apps', 'web', 'dist');
  const rebuild = args.includes('--rebuild');

  if (rebuild || !fs.existsSync(path.join(dist, 'index.html'))) {
    console.log(`check-web-bundle: building apps/web (${rebuild ? '--rebuild' : 'dist missing'})`);
    const res = spawnSync('pnpm', ['--filter', '@bga/web', 'run', 'build'], {
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
  let status = 0;
  if (findings.length > 0) {
    console.log(`FAIL check-web-bundle: ${findings.length} finding(s) in ${files.length} files`);
    status = 1;
  } else {
    console.log(
      `OK check-web-bundle: ${files.length} files in ${path.relative(REPO_ROOT, dist) || dist}, ${rules.length} rules (${rules.map((r) => r.id).join(', ')})`,
    );
  }
  if (args.includes('--skip-modules')) {
    console.log('check-web-bundle: module check SKIPPED (--skip-modules)');
    return status;
  }
  const modulesIdx = args.indexOf('--modules-dir');
  const modulesDir = modulesIdx >= 0 ? path.resolve(args[modulesIdx + 1] ?? '') : undefined;
  const modulesStatus = checkBundleModules({ modulesDir, listModules: args.includes('--modules') });
  return Math.max(status, modulesStatus);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = main(process.argv);
}
