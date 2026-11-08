// Tests for scripts/check-web-bundle.mjs (SWR-002 review #3). Synthetic inputs only — no build needed.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { forbiddenFromScenario, readTextFiles, scanFiles } from './check-web-bundle.mjs';

const CLI = path.join(path.dirname(fileURLToPath(import.meta.url)), 'check-web-bundle.mjs');

const SCENARIO = {
  rebelBaseSystemId: 'sys-hollin',
  pieces: [
    { id: 'pc-01', typeKey: 'unit.empire.capital-ship' },
    { id: 'pc-21', typeKey: 'token.rebellion.covert-cell', hidden: true },
  ],
};
const rules = forbiddenFromScenario(SCENARIO);
const scan = (content) => scanFiles([{ name: 'a.js', content }], rules).map((f) => f.rule);

describe('check-web-bundle: rules', () => {
  test('clean bundle: schemas, i18n names, layout and testids are allowed', () => {
    const content = [
      'const ScenarioSchema=z.object({rebelBaseSystemId:z.string(),pieces:z.array(P)});',
      '{"pieceTypes":{"token":{"rebellion":{"covert-cell":"Covert cell"}}}}',
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
    const found = scan('{id:"pc-21",kind:"token",owner:"rebellion",typeKey:"token.rebellion.covert-cell",hidden:!0}');
    assert.ok(found.includes('hidden-piece-mapping'));
  });

  test('__boardDebug hook is found', () => {
    assert.ok(scan('window.__boardDebug={getViewport(){}}').includes('board-debug-hook'));
  });
});

describe('check-web-bundle: CLI', () => {
  test('exit 0 on a clean dist, exit 1 with FORBIDDEN lines on a leaking dist', (t) => {
    const scenarioDist = path.resolve(path.dirname(CLI), '..', 'packages', 'game-data', 'dist', 'index.js');
    if (!fs.existsSync(scenarioDist)) {
      t.skip('packages/game-data/dist missing (run pnpm run build:packages)');
      return;
    }
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'swr-bundle-'));
    try {
      fs.writeFileSync(path.join(dir, 'index.html'), '<!doctype html><div id="root"></div>');
      fs.mkdirSync(path.join(dir, 'assets'));
      fs.writeFileSync(path.join(dir, 'assets', 'index.js'), 'console.log("ok")');
      let res = spawnSync(process.execPath, [CLI, '--dist', dir], { encoding: 'utf8' });
      assert.equal(res.status, 0, res.stdout + res.stderr);
      assert.match(res.stdout, /^OK check-web-bundle/m);
      assert.equal(readTextFiles(dir).length, 2);

      fs.writeFileSync(path.join(dir, 'assets', 'leak.js'), 'window.__boardDebug={}');
      res = spawnSync(process.execPath, [CLI, '--dist', dir], { encoding: 'utf8' });
      assert.equal(res.status, 1, res.stdout + res.stderr);
      assert.match(res.stdout, /FORBIDDEN assets\/leak\.js \[board-debug-hook\]/);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});
