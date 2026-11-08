// Tests for scripts/check-web-bundle.mjs (SWR-002 review #3). Synthetic inputs only — no build needed.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import {
  forbiddenFromScenario,
  forbiddenGameModules,
  gameModules,
  readMapSources,
  readTextFiles,
  scanFiles,
} from './check-web-bundle.mjs';

const CLI = path.join(path.dirname(fileURLToPath(import.meta.url)), 'check-web-bundle.mjs');

const SCENARIO = {
  rebelBaseSystemId: 'sys-hollin',
  pieces: [
    { id: 'pc-01', typeKey: 'unit.empire.capital-ship' },
    { id: 'pc-21', typeKey: 'token.rebels.covert-cell', hidden: true },
  ],
};
const rules = forbiddenFromScenario(SCENARIO);
const scan = (content) => scanFiles([{ name: 'a.js', content }], rules).map((f) => f.rule);

describe('check-web-bundle: rules', () => {
  test('clean bundle: schemas, i18n names, layout and testids are allowed', () => {
    const content = [
      'const ScenarioSchema=z.object({rebelBaseSystemId:z.string(),pieces:z.array(P)});',
      '{"pieceTypes":{"token":{"rebels":{"covert-cell":"Covert cell"}}}}',
      'const mapLayout={"sys-hollin":{x:1050,y:750}};',
      'e("div",{"data-testid":`piece-item-${p.id}`});',
      'const r=view.rebelBase.systemId??null;',
    ].join('\n');
    assert.deepEqual(scan(content), []);
  });

  test('scenario rebel base assignment is found (minified and JSON forms)', () => {
    assert.ok(scan('const s={id:"m",rebelBaseSystemId:"sys-hollin"}').includes('rebel-base-assignment'));
    assert.ok(scan('{"rebelBaseSystemId":"sys-x"}').includes('rebel-base-assignment'));
    assert.ok(scan('rebelBase:{systemId:"sys-hollin",revealed:!1}').includes('rebel-base-system'));
  });

  test('scenario piece ids as string literals are found', () => {
    assert.ok(scan('pieces:[{id:"pc-01",kind:"unit"}]').includes('scenario-piece-id'));
    assert.deepEqual(scan('const pc01=1; // pc-01 in a comment without quotes'), []);
  });

  test('hidden piece → typeKey mapping is found', () => {
    const found = scan('{id:"pc-21",kind:"token",owner:"rebels",typeKey:"token.rebels.covert-cell",hidden:!0}');
    assert.ok(found.includes('hidden-piece-mapping'));
  });

  test('core-v1 base choice strings are found (Q-18): names, string literals and keys', () => {
    for (const content of [
      'function chooseRebelBase(e,t){return t[0]}',
      'const n={rebelBaseCandidates:["sys-a","sys-b"]};',
      '{"rebelBaseCandidates":[]}',
      'const k="chooseRebelBase";',
    ]) {
      assert.ok(scan(content).includes('rebel-base-choice-symbol'), content);
    }
  });

  test('core-v1 base choice rule: no false positives on legal core-v1 web content', () => {
    const content = [
      'const r=view.rebelBase.systemId??null,v=view.rebelBase.revealed;',
      'e("div",{"data-testid":"hidden-base-zone"});',
      '{"announce":{"baseRevealed":"База Повстанцев раскрыта: {{system}}"}}',
      'const coreMapLayout={"sys-yavin":{x:10,y:20}};',
      // review #2: the web-reachable schema helper is public data and is renamed by the minifier — not searched.
      'export{eligibleRebelBaseSystemIds as e};',
    ].join('\n');
    assert.ok(!scan(content).includes('rebel-base-choice-symbol'));
  });

  test('__boardDebug hook is found', () => {
    assert.ok(scan('window.__boardDebug={getViewport(){}}').includes('board-debug-hook'));
  });
});

describe('check-web-bundle: module composition (Q-23, TC-ARCH-08)', () => {
  const CLEAN = [
    '../../../../packages/games/rebellion/src/schema/enums.ts',
    '../../../../packages/games/rebellion/src/board/layout.ts',
    '../../../../packages/games/rebellion/src/definition/index.ts',
    '../../../../packages/games/forbidden-stars/src/assets/cover.ts',
    '../../../../packages/platform/src/errors.ts',
    '../../../../node_modules/.pnpm/zod@4.6.7/node_modules/zod/v4/core/core.js',
    '../../src/features/game-board/model/legal.ts',
  ];

  test('clean list: only definition/schema/board/assets of games', () => {
    assert.deepEqual(forbiddenGameModules(CLEAN), []);
    assert.deepEqual(
      gameModules(CLEAN).map((m) => `${m.game}/${m.subpath}`),
      ['rebellion/schema', 'rebellion/board', 'rebellion/definition', 'forbidden-stars/assets'],
    );
  });

  test('rules, scenario, server, ai (src or dist), unknown subpaths and root files are forbidden', () => {
    const bad = [
      '../../../../packages/games/rebellion/src/rules/mock-rules.ts',
      '../../../../packages/games/rebellion/src/scenario/scenario.ts',
      '../../../../packages/games/rebellion/src/server/index.ts',
      '../../../../packages/games/rebellion/src/ai/index.ts',
      '/abs/repo/packages/games/rebellion/dist/scenario/index.js',
      '..\\..\\packages\\games\\rebellion\\src\\rules\\apply-command.ts',
      '../../../../packages/games/other/src/extras/x.ts',
      '../../../../packages/games/other/src/index.ts',
    ];
    const found = forbiddenGameModules([...CLEAN, ...bad]).map((m) => `${m.game}/${m.subpath}`);
    assert.deepEqual(found, [
      'rebellion/rules',
      'rebellion/scenario',
      'rebellion/server',
      'rebellion/ai',
      'rebellion/scenario',
      'rebellion/rules',
      'other/extras',
      'other/(root)',
    ]);
  });

  test('CLI --modules-dir: exit 0 on clean maps, 1 on a rules module, 2 without game modules', (t) => {
    const scenarioDist = path.resolve(path.dirname(CLI), '..', 'packages', 'games', 'rebellion', 'dist', 'scenario', 'index.js');
    if (!fs.existsSync(scenarioDist)) {
      t.skip('packages/games/rebellion/dist missing (run pnpm run build:packages)');
      return;
    }
    const dist = fs.mkdtempSync(path.join(os.tmpdir(), 'bga-bundle-'));
    const maps = fs.mkdtempSync(path.join(os.tmpdir(), 'bga-bundle-maps-'));
    const writeMap = (sources) =>
      fs.writeFileSync(path.join(maps, 'index.js.map'), JSON.stringify({ version: 3, sources, mappings: '' }));
    const run = () =>
      spawnSync(process.execPath, [CLI, '--dist', dist, '--modules-dir', maps, '--modules'], { encoding: 'utf8' });
    try {
      fs.writeFileSync(path.join(dist, 'index.html'), '<!doctype html><div id="root"></div>');
      writeMap(CLEAN);
      assert.deepEqual(readMapSources(maps), CLEAN);
      let res = run();
      assert.equal(res.status, 0, res.stdout + res.stderr);
      assert.match(res.stdout, /^OK check-web-bundle modules:/m);
      assert.match(res.stdout, /module rebellion\/schema: /);

      writeMap([...CLEAN, '../../../../packages/games/rebellion/src/rules/mock-rules.ts']);
      res = run();
      assert.equal(res.status, 1, res.stdout + res.stderr);
      assert.match(res.stdout, /FORBIDDEN module .*rules\/mock-rules\.ts \[game-rebellion\/rules\]/);

      writeMap(['../../src/main.tsx']);
      res = run();
      assert.equal(res.status, 2, res.stdout + res.stderr);
    } finally {
      fs.rmSync(dist, { recursive: true, force: true });
      fs.rmSync(maps, { recursive: true, force: true });
    }
  });
});

describe('check-web-bundle: CLI', () => {
  test('exit 0 on a clean dist, exit 1 with FORBIDDEN lines on a leaking dist', (t) => {
    const scenarioDist = path.resolve(
      path.dirname(CLI),
      '..',
      'packages',
      'games',
      'rebellion',
      'dist',
      'scenario',
      'index.js',
    );
    if (!fs.existsSync(scenarioDist)) {
      t.skip('packages/games/rebellion/dist missing (run pnpm run build:packages)');
      return;
    }
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bga-bundle-'));
    try {
      fs.writeFileSync(path.join(dir, 'index.html'), '<!doctype html><div id="root"></div>');
      fs.mkdirSync(path.join(dir, 'assets'));
      fs.writeFileSync(path.join(dir, 'assets', 'index.js'), 'console.log("ok")');
      let res = spawnSync(process.execPath, [CLI, '--dist', dir, '--skip-modules'], {
        encoding: 'utf8',
      });
      assert.equal(res.status, 0, res.stdout + res.stderr);
      assert.match(res.stdout, /^OK check-web-bundle/m);
      assert.equal(readTextFiles(dir).length, 2);

      fs.writeFileSync(path.join(dir, 'assets', 'leak.js'), 'window.__boardDebug={}');
      res = spawnSync(process.execPath, [CLI, '--dist', dir, '--skip-modules'], {
        encoding: 'utf8',
      });
      assert.equal(res.status, 1, res.stdout + res.stderr);
      assert.match(res.stdout, /FORBIDDEN assets\/leak\.js \[board-debug-hook\]/);

      // SWR-005 Q-18: a leaked core-v1 base-choice symbol fails the CLI as well.
      fs.writeFileSync(path.join(dir, 'assets', 'leak.js'), 'const x={rebelBaseCandidates:[]};');
      res = spawnSync(process.execPath, [CLI, '--dist', dir, '--skip-modules'], {
        encoding: 'utf8',
      });
      assert.equal(res.status, 1, res.stdout + res.stderr);
      assert.match(res.stdout, /FORBIDDEN assets\/leak\.js \[rebel-base-choice-symbol\]/);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});
