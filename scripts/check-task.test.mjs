// Tests for scripts/check-task.mjs (SWR-000/S2).
// Written by qa-lead from docs/tasks/SWR-000/specification.md and the contract in
// implementation-plan.md ONLY, without reading the implementation.
// Each test name starts with the TC id from docs/tasks/SWR-000/test-cases.md.
//
// Contract assumptions used here:
// - checkTask(taskDir, { repoRoot }) -> { problems: string[] }
// - every problem starts with the task file name (e.g. "status.md: ...") and contains a rule id ("[R5]").
// - CLI: exit 0 / 1 / 2; problem lines "<taskDir>/<file>: <message>"; last line "OK <taskDir>" or
//   "FAIL <taskDir> (<n> problems)".
// Assertions check rule ids and file prefixes, never exact wording.
// Rework cycle 1 (after CODE_REVIEW #1): spec "Clarifications log" + decisions D1–D11 are covered by the
// TC-100+ block at the end; TC-31/32/38 now require exact rule ids, TC-83..88 require the file prefix of
// the file that says `accepted`, TC-70 became negative (D9).

import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { checkTask } from './check-task.mjs';

const SCRIPTS_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(SCRIPTS_DIR, '..');
const CLI = path.join(SCRIPTS_DIR, 'check-task.mjs');
const VALID_FIXTURE = path.join(SCRIPTS_DIR, 'fixtures', 'valid-task');
const TEMPLATE_DIR = path.join(REPO_ROOT, 'docs', 'tasks', '_template');

const REQUIRED_FILES = [
  'request.md',
  'specification.md',
  'implementation-plan.md',
  'test-cases.md',
  'review.md',
  'qa-results.md',
  'acceptance.md',
  'delivery-report.md',
  'status.md',
];

const STAGES = [
  'INTAKE',
  'ANALYSIS',
  'TECH_PLANNING',
  'EARLY_QA_DESIGN',
  'IMPLEMENTATION',
  'INTEGRATION',
  'CODE_REVIEW',
  'BUSINESS_VALIDATION',
  'QA_EXECUTION',
  'FINAL_ACCEPTANCE',
  'DELIVERY',
];

// ---------------------------------------------------------------- helpers

const tempRoots = [];

/**
 * Copies the valid fixture into a fresh temp "repo":
 *   <tmp>/repo/            <- repoRoot (contains AGENTS.md so default-root discovery also lands here)
 *   <tmp>/repo/task/       <- taskDir (copy of scripts/fixtures/valid-task)
 */
function makeTask() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'check-task-test-'));
  tempRoots.push(tmp);
  const repoRoot = path.join(tmp, 'repo');
  const taskDir = path.join(repoRoot, 'task');
  fs.mkdirSync(repoRoot, { recursive: true });
  fs.writeFileSync(path.join(repoRoot, 'AGENTS.md'), '# temp repo root for tests\n');
  fs.cpSync(VALID_FIXTURE, taskDir, { recursive: true });
  return { repoRoot, taskDir };
}

function read(taskDir, file) {
  return fs.readFileSync(path.join(taskDir, file), 'utf8');
}

function write(taskDir, file, content) {
  fs.writeFileSync(path.join(taskDir, file), content);
}

/** Replace exactly-present text; throws if `from` is absent so a mutation can never silently no-op. */
function edit(taskDir, file, from, to) {
  const before = read(taskDir, file);
  assert.ok(before.includes(from), `test setup: "${from}" not found in ${file}`);
  write(taskDir, file, before.replace(from, to));
}

/** Set the Status cell of a stage row in status.md. */
function setStage(taskDir, stage, status) {
  const lines = read(taskDir, 'status.md').split('\n');
  let hit = false;
  const out = lines.map((line) => {
    const cells = line.split('|').map((c) => c.trim());
    if (cells[1] === stage) {
      hit = true;
      cells[2] = status;
      return `| ${cells.slice(1, -1).join(' | ')} |`;
    }
    return line;
  });
  assert.ok(hit, `test setup: stage ${stage} not found`);
  write(taskDir, 'status.md', out.join('\n'));
}

/** Set the Artifact cell of a stage row in status.md. */
function setStageArtifact(taskDir, stage, artifact) {
  const lines = read(taskDir, 'status.md').split('\n');
  let hit = false;
  const out = lines.map((line) => {
    const cells = line.split('|').map((c) => c.trim());
    if (cells[1] === stage) {
      hit = true;
      cells[4] = artifact;
      return `| ${cells.slice(1, -1).join(' | ')} |`;
    }
    return line;
  });
  assert.ok(hit, `test setup: stage ${stage} not found`);
  write(taskDir, 'status.md', out.join('\n'));
}

/** Replace a whole AC row (by AC id) in an AC table of the given file. */
function setAcRow(taskDir, file, ac, status, evidence) {
  const lines = read(taskDir, file).split('\n');
  let hit = false;
  const out = lines.map((line) => {
    if (line.startsWith(`| ${ac} |`)) {
      hit = true;
      return `| ${ac} | ${status} | ${evidence} |`;
    }
    return line;
  });
  assert.ok(hit, `test setup: ${ac} row not found in ${file}`);
  write(taskDir, file, out.join('\n'));
}

function run(taskDir, repoRoot) {
  const result = checkTask(taskDir, { repoRoot });
  assert.ok(result && Array.isArray(result.problems), 'checkTask must return { problems: string[] }');
  for (const p of result.problems) assert.equal(typeof p, 'string');
  return result.problems;
}

function hasProblem(problems, file, rule) {
  return problems.some(
    (p) => (file == null || p.startsWith(file)) && (rule == null || p.includes(`[${rule}]`)),
  );
}

function assertProblem(problems, file, rule) {
  assert.ok(
    hasProblem(problems, file, rule),
    `expected a problem with prefix "${file}" and rule [${rule}], got:\n  ${problems.join('\n  ')}`,
  );
}

/** Fixture says `accepted` in both acceptance.md and delivery-report.md -> R10 reported with each prefix. */
function assertR10BothFiles(problems) {
  assertProblem(problems, 'acceptance.md', 'R10');
  assertProblem(problems, 'delivery-report.md', 'R10');
}

function assertNoRule(problems, rule) {
  const hits = problems.filter((p) => p.includes(`[${rule}]`));
  assert.deepEqual(hits, [], `expected no [${rule}] problems`);
}

function assertClean(problems) {
  assert.deepEqual(problems, [], `expected no problems, got:\n  ${problems.join('\n  ')}`);
}

function cli(args, opts = {}) {
  return spawnSync(process.execPath, [CLI, ...args], { encoding: 'utf8', ...opts });
}

after(() => {
  for (const dir of tempRoots) fs.rmSync(dir, { recursive: true, force: true });
});

// ---------------------------------------------------------------- AC-5 baseline (run first: everything else mutates it)

describe('AC-5: valid inputs and CLI contract', () => {
  test('TC-50 valid fixture (in place) has no problems', () => {
    // repoRoot = the fixture dir itself: nothing outside it is needed.
    assertClean(run(VALID_FIXTURE, VALID_FIXTURE));
  });

  test('TC-51 valid fixture copied to temp dir has no problems', () => {
    const { taskDir, repoRoot } = makeTask();
    assertClean(run(taskDir, repoRoot));
  });

  test('TC-52 CLI on valid fixture -> exit 0 and "OK <taskDir>"', () => {
    const { taskDir, repoRoot } = makeTask();
    const r = cli([taskDir], { cwd: repoRoot });
    assert.equal(r.status, 0, r.stdout + r.stderr);
    assert.match(r.stdout, /^OK .*task\s*$/m);
    assert.doesNotMatch(r.stdout, /^FAIL /m);
  });

  test('TC-53 fresh docs/tasks/_template has no problems (honest template)', () => {
    assertClean(run(TEMPLATE_DIR, REPO_ROOT));
  });

  test('TC-54 CLI on docs/tasks/_template -> exit 0', () => {
    const r = cli([TEMPLATE_DIR], { cwd: REPO_ROOT });
    assert.equal(r.status, 0, r.stdout + r.stderr);
    assert.match(r.stdout, /^OK /m);
  });

  test('TC-55 CLI with no arguments -> exit 2', () => {
    const r = cli([], { cwd: REPO_ROOT });
    assert.equal(r.status, 2, r.stdout + r.stderr);
  });

  test('TC-56 CLI with non-existent directory -> exit 2', () => {
    const missing = path.join(os.tmpdir(), `check-task-does-not-exist-${process.pid}-${Date.now()}`);
    const r = cli([missing], { cwd: REPO_ROOT });
    assert.equal(r.status, 2, r.stdout + r.stderr);
  });

  test('TC-57 CLI with one valid and one invalid dir -> exit 1, OK for one and FAIL for other', () => {
    const good = makeTask();
    const bad = makeTask();
    fs.rmSync(path.join(bad.taskDir, 'review.md'));
    const r = cli([good.taskDir, bad.taskDir], { cwd: good.repoRoot });
    assert.equal(r.status, 1, r.stdout + r.stderr);
    assert.ok(r.stdout.split('\n').some((l) => l.startsWith('OK ') && l.includes(good.taskDir)), r.stdout);
    assert.ok(r.stdout.split('\n').some((l) => l.startsWith('FAIL ') && l.includes(bad.taskDir)), r.stdout);
  });

  test('TC-58 CLI problem lines are "<taskDir>/<file>: ..." and FAIL count matches checkTask', () => {
    const { taskDir, repoRoot } = makeTask();
    fs.rmSync(path.join(taskDir, 'request.md'));
    setAcRow(taskDir, 'acceptance.md', 'AC-1', 'passed', 'TBD');
    const problems = run(taskDir, repoRoot);
    const r = cli([taskDir], { cwd: repoRoot });
    assert.equal(r.status, 1, r.stdout + r.stderr);
    const lines = r.stdout.split('\n');
    assert.ok(lines.some((l) => l.startsWith(`${taskDir}/request.md:`)), r.stdout);
    assert.ok(lines.some((l) => l.startsWith(`${taskDir}/acceptance.md:`)), r.stdout);
    const m = r.stdout.match(/^FAIL .* \((\d+) problems?\)\s*$/m);
    assert.ok(m, `no FAIL summary line in:\n${r.stdout}`);
    assert.equal(Number(m[1]), problems.length);
  });

  test('TC-59 importing the module does not run the CLI', () => {
    const r = spawnSync(
      process.execPath,
      ['--input-type=module', '-e', `await import(${JSON.stringify(new URL('./check-task.mjs', import.meta.url).href)});`],
      { encoding: 'utf8', cwd: os.tmpdir() },
    );
    assert.equal(r.status, 0, r.stdout + r.stderr);
    assert.equal(r.stdout.trim(), '');
  });
});

// ---------------------------------------------------------------- AC-1 (R1)

describe('AC-1: required files (R1)', () => {
  for (const file of REQUIRED_FILES) {
    test(`TC-10 missing ${file} -> "${file}" [R1]`, () => {
      const { taskDir, repoRoot } = makeTask();
      fs.rmSync(path.join(taskDir, file));
      assertProblem(run(taskDir, repoRoot), file, 'R1');
    });
  }

  test('TC-11 empty task directory -> every required file reported with [R1]', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'check-task-empty-'));
    tempRoots.push(tmp);
    const problems = run(tmp, tmp);
    for (const file of REQUIRED_FILES) assertProblem(problems, file, 'R1');
  });

  test('TC-12 two files missing -> both reported (no early stop)', () => {
    const { taskDir, repoRoot } = makeTask();
    fs.rmSync(path.join(taskDir, 'test-cases.md'));
    fs.rmSync(path.join(taskDir, 'delivery-report.md'));
    const problems = run(taskDir, repoRoot);
    assertProblem(problems, 'test-cases.md', 'R1');
    assertProblem(problems, 'delivery-report.md', 'R1');
  });

  test('TC-13 CLI with a missing file -> exit 1 and FAIL line', () => {
    const { taskDir, repoRoot } = makeTask();
    fs.rmSync(path.join(taskDir, 'specification.md'));
    const r = cli([taskDir], { cwd: repoRoot });
    assert.equal(r.status, 1, r.stdout + r.stderr);
    assert.match(r.stdout, /specification\.md:.*\[R1\]/);
    assert.match(r.stdout, /^FAIL /m);
  });

  test('TC-14 extra unrelated files do not cause problems (boundary)', () => {
    const { taskDir, repoRoot } = makeTask();
    write(taskDir, 'notes.md', '# extra\n');
    assertClean(run(taskDir, repoRoot));
  });
});

// ---------------------------------------------------------------- AC-2 (R5, R6, R7)

describe('AC-2: AC tables evidence (R5, R6)', () => {
  for (const file of ['acceptance.md', 'qa-results.md']) {
    test(`TC-20 ${file}: passed with empty evidence -> [R5]`, () => {
      const { taskDir, repoRoot } = makeTask();
      setAcRow(taskDir, file, 'AC-1', 'passed', '');
      assertProblem(run(taskDir, repoRoot), file, 'R5');
    });

    for (const placeholder of ['-', '—', 'TBD', 'TODO', 'n/a', 'tbd', 'N/A', 'Todo']) {
      test(`TC-21 ${file}: passed with placeholder evidence "${placeholder}" -> [R5]`, () => {
        const { taskDir, repoRoot } = makeTask();
        setAcRow(taskDir, file, 'AC-1', 'passed', placeholder);
        assertProblem(run(taskDir, repoRoot), file, 'R5');
      });
    }

    test(`TC-22 ${file}: invalid AC status "done" -> [R5]`, () => {
      const { taskDir, repoRoot } = makeTask();
      setAcRow(taskDir, file, 'AC-1', 'done', '`artifacts/logs/unit.log`');
      assertProblem(run(taskDir, repoRoot), file, 'R5');
    });

    test(`TC-23 ${file}: passed with non-existent path (with "/") -> [R6]`, () => {
      const { taskDir, repoRoot } = makeTask();
      setAcRow(taskDir, file, 'AC-1', 'passed', '`artifacts/logs/missing.log`');
      assertProblem(run(taskDir, repoRoot), file, 'R6');
    });

    test(`TC-24 ${file}: passed with non-existent file name (".ext", no "/") -> [R6]`, () => {
      const { taskDir, repoRoot } = makeTask();
      setAcRow(taskDir, file, 'AC-1', 'passed', '`missing-report.log`');
      assertProblem(run(taskDir, repoRoot), file, 'R6');
    });

    test(`TC-25 ${file}: one existing + one missing path in the same cell -> [R6]`, () => {
      const { taskDir, repoRoot } = makeTask();
      setAcRow(taskDir, file, 'AC-1', 'passed', '`artifacts/logs/unit.log`, `artifacts/logs/nope.log`');
      assertProblem(run(taskDir, repoRoot), file, 'R6');
    });
  }

  test('TC-26 command token `node --test scripts/` is not a path (boundary)', () => {
    const { taskDir, repoRoot } = makeTask();
    setAcRow(taskDir, 'acceptance.md', 'AC-1', 'passed', '`node --test scripts/` → `artifacts/logs/unit.log`');
    assertClean(run(taskDir, repoRoot));
  });

  test('TC-27 token with spaces (`pnpm run test`) is not a path (boundary)', () => {
    const { taskDir, repoRoot } = makeTask();
    setAcRow(taskDir, 'acceptance.md', 'AC-1', 'passed', '`pnpm run test/unit` + `artifacts/logs/unit.log`');
    assertClean(run(taskDir, repoRoot));
  });

  test('TC-28 bare word token without "/" or ".ext" (`unit`) is not a path (boundary)', () => {
    const { taskDir, repoRoot } = makeTask();
    setAcRow(taskDir, 'acceptance.md', 'AC-1', 'passed', 'suite `unit` green, log `artifacts/logs/unit.log`');
    assertClean(run(taskDir, repoRoot));
  });

  test('TC-29 non-passed statuses with empty evidence are fine for R5/R6 (boundary)', () => {
    const { taskDir, repoRoot } = makeTask();
    // acceptance must not be "accepted" anymore, otherwise R10 legitimately fires.
    edit(taskDir, 'acceptance.md', 'accepted — all AC passed with evidence', 'blocked — waiting');
    edit(taskDir, 'delivery-report.md', 'accepted — delivered', 'blocked — waiting');
    setAcRow(taskDir, 'acceptance.md', 'AC-1', 'failed', '');
    setAcRow(taskDir, 'acceptance.md', 'AC-2', 'not_run', '');
    setAcRow(taskDir, 'qa-results.md', 'AC-1', 'blocked', '');
    setAcRow(taskDir, 'qa-results.md', 'AC-2', 'not_run', '-');
    const problems = run(taskDir, repoRoot);
    assertNoRule(problems, 'R5');
    assertNoRule(problems, 'R6');
  });

  test('TC-30 path that exists only relative to repoRoot is accepted', () => {
    const { taskDir, repoRoot } = makeTask();
    fs.mkdirSync(path.join(repoRoot, 'scripts'), { recursive: true });
    fs.writeFileSync(path.join(repoRoot, 'scripts', 'evidence.test.mjs'), '// evidence\n');
    setAcRow(taskDir, 'acceptance.md', 'AC-1', 'passed', '`scripts/evidence.test.mjs`');
    assertClean(run(taskDir, repoRoot));
  });

  test('TC-31 acceptance.md without "## Acceptance criteria" section -> acceptance.md [R5]', () => {
    const { taskDir, repoRoot } = makeTask();
    edit(taskDir, 'acceptance.md', '## Acceptance criteria', '## Something else');
    assertProblem(run(taskDir, repoRoot), 'acceptance.md', 'R5');
  });

  test('TC-32 qa-results.md without "## Acceptance criteria" section -> qa-results.md [R5]', () => {
    const { taskDir, repoRoot } = makeTask();
    edit(taskDir, 'qa-results.md', '## Acceptance criteria', '## Criteria');
    assertProblem(run(taskDir, repoRoot), 'qa-results.md', 'R5');
  });

  test('TC-33 CLI: passed with placeholder evidence -> exit 1', () => {
    const { taskDir, repoRoot } = makeTask();
    setAcRow(taskDir, 'qa-results.md', 'AC-2', 'passed', 'TODO');
    const r = cli([taskDir], { cwd: repoRoot });
    assert.equal(r.status, 1, r.stdout + r.stderr);
    assert.match(r.stdout, /qa-results\.md:.*\[R5\]/);
  });
});

describe('AC-2: Verification section (R7)', () => {
  for (const file of ['qa-results.md', 'delivery-report.md']) {
    test(`TC-34 ${file}: "- unit: passed" without evidence -> [R7]`, () => {
      const { taskDir, repoRoot } = makeTask();
      edit(taskDir, file, '- unit: passed — `artifacts/logs/unit.log`', '- unit: passed');
      assertProblem(run(taskDir, repoRoot), file, 'R7');
    });

    test(`TC-35 ${file}: "- unit: passed — " (dash, empty evidence) -> [R7]`, () => {
      const { taskDir, repoRoot } = makeTask();
      edit(taskDir, file, '- unit: passed — `artifacts/logs/unit.log`', '- unit: passed — ');
      assertProblem(run(taskDir, repoRoot), file, 'R7');
    });

    test(`TC-36 ${file}: invalid status "ok" -> [R7]`, () => {
      const { taskDir, repoRoot } = makeTask();
      edit(taskDir, file, '- unit: passed — `artifacts/logs/unit.log`', '- unit: ok — `artifacts/logs/unit.log`');
      assertProblem(run(taskDir, repoRoot), file, 'R7');
    });

    test(`TC-37 ${file}: passed with non-existent path -> [R7] or [R6]`, () => {
      const { taskDir, repoRoot } = makeTask();
      edit(taskDir, file, '- unit: passed — `artifacts/logs/unit.log`', '- unit: passed — `artifacts/logs/ghost.log`');
      const problems = run(taskDir, repoRoot);
      assert.ok(
        hasProblem(problems, file, 'R7') || hasProblem(problems, file, 'R6'),
        `expected ${file} [R7] or [R6], got:\n  ${problems.join('\n  ')}`,
      );
    });

    test(`TC-38 ${file}: missing "## Verification" section -> ${file} [R7]`, () => {
      const { taskDir, repoRoot } = makeTask();
      edit(taskDir, file, '## Verification', '## Checks');
      assertProblem(run(taskDir, repoRoot), file, 'R7');
    });
  }

  test('TC-39 not_run / blocked / failed lines without evidence are fine (boundary)', () => {
    const { taskDir, repoRoot } = makeTask();
    edit(taskDir, 'qa-results.md', '- e2e: not_run — no UI in this fixture', '- e2e: not_run — \n- lint: blocked\n- perf: failed — ');
    const problems = run(taskDir, repoRoot);
    assertNoRule(problems, 'R7');
  });

  test('TC-40 Verification evidence with a command token is not a path (boundary)', () => {
    const { taskDir, repoRoot } = makeTask();
    edit(
      taskDir,
      'qa-results.md',
      '- unit: passed — `artifacts/logs/unit.log`',
      '- unit: passed — `node --test scripts/` → `artifacts/logs/unit.log`',
    );
    assertClean(run(taskDir, repoRoot));
  });
});

// ---------------------------------------------------------------- AC-3 (R2, R3, R4)

describe('AC-3: status.md (R2, R3, R4)', () => {
  test('TC-60 missing stage row -> status.md [R2]', () => {
    const { taskDir, repoRoot } = makeTask();
    edit(taskDir, 'status.md', '| INTEGRATION | passed | lead | `artifacts/logs/unit.log` | ok |\n', '');
    assertProblem(run(taskDir, repoRoot), 'status.md', 'R2');
  });

  test('TC-61 duplicated stage row -> status.md [R2]', () => {
    const { taskDir, repoRoot } = makeTask();
    const row = '| CODE_REVIEW | passed | reviewer | `review.md` | ok |\n';
    edit(taskDir, 'status.md', row, row + row);
    assertProblem(run(taskDir, repoRoot), 'status.md', 'R2');
  });

  test('TC-62 two stages swapped (all passed) -> status.md [R2]', () => {
    const { taskDir, repoRoot } = makeTask();
    const a = '| ANALYSIS | passed | analyst | `specification.md` | ok |\n';
    const b = '| TECH_PLANNING | passed | lead | `implementation-plan.md` | ok |\n';
    edit(taskDir, 'status.md', a + b, b + a);
    assertProblem(run(taskDir, repoRoot), 'status.md', 'R2');
  });

  test('TC-63 invalid stage status "done" -> status.md [R2]', () => {
    const { taskDir, repoRoot } = makeTask();
    setStage(taskDir, 'ANALYSIS', 'done');
    assertProblem(run(taskDir, repoRoot), 'status.md', 'R2');
  });

  for (const status of ['pending', 'in_progress', 'failed', 'blocked']) {
    test(`TC-64 passed stage after a "${status}" stage -> status.md [R3]`, () => {
      const { taskDir, repoRoot } = makeTask();
      setStage(taskDir, 'CODE_REVIEW', status);
      assertProblem(run(taskDir, repoRoot), 'status.md', 'R3');
    });
  }

  test('TC-65 first stage not passed, all later passed -> [R3] (boundary: first stage)', () => {
    const { taskDir, repoRoot } = makeTask();
    setStage(taskDir, 'INTAKE', 'in_progress');
    assertProblem(run(taskDir, repoRoot), 'status.md', 'R3');
  });

  test('TC-66 passed prefix followed only by non-passed stages -> no [R3] (boundary)', () => {
    const { taskDir, repoRoot } = makeTask();
    // Make it an honest in-progress task: no accepted decisions.
    edit(taskDir, 'acceptance.md', 'accepted — all AC passed with evidence', 'blocked — in progress');
    edit(taskDir, 'delivery-report.md', 'accepted — delivered', 'blocked — in progress');
    setStage(taskDir, 'QA_EXECUTION', 'in_progress');
    setStage(taskDir, 'FINAL_ACCEPTANCE', 'pending');
    setStage(taskDir, 'DELIVERY', 'pending');
    assertClean(run(taskDir, repoRoot));
  });

  test('TC-67 passed stage with non-existent artifact -> status.md [R4]', () => {
    const { taskDir, repoRoot } = makeTask();
    setStageArtifact(taskDir, 'IMPLEMENTATION', '`artifacts/logs/impl-missing.log`');
    assertProblem(run(taskDir, repoRoot), 'status.md', 'R4');
  });

  test('TC-68 passed stage whose artifact file was deleted (review.md) -> [R1] and status.md [R4]', () => {
    const { taskDir, repoRoot } = makeTask();
    fs.rmSync(path.join(taskDir, 'review.md'));
    const problems = run(taskDir, repoRoot);
    assertProblem(problems, 'review.md', 'R1');
    assertProblem(problems, 'status.md', 'R4');
  });

  test('TC-69 non-passed stage with non-existent artifact -> no [R4] (boundary)', () => {
    const { taskDir, repoRoot } = makeTask();
    edit(taskDir, 'acceptance.md', 'accepted — all AC passed with evidence', 'blocked — in progress');
    edit(taskDir, 'delivery-report.md', 'accepted — delivered', 'blocked — in progress');
    setStage(taskDir, 'FINAL_ACCEPTANCE', 'pending');
    setStage(taskDir, 'DELIVERY', 'pending');
    setStageArtifact(taskDir, 'DELIVERY', '`artifacts/logs/not-yet.log`');
    assertNoRule(run(taskDir, repoRoot), 'R4');
  });

  test('TC-70 passed stage with empty Artifact cell -> status.md [R4] (D9)', () => {
    const { taskDir, repoRoot } = makeTask();
    setStageArtifact(taskDir, 'IMPLEMENTATION', '');
    assertProblem(run(taskDir, repoRoot), 'status.md', 'R4');
  });

  test('TC-71 passed stage artifact resolved relative to repoRoot -> no [R4]', () => {
    const { taskDir, repoRoot } = makeTask();
    fs.mkdirSync(path.join(repoRoot, 'scripts'), { recursive: true });
    fs.writeFileSync(path.join(repoRoot, 'scripts', 'impl.mjs'), '// impl\n');
    setStageArtifact(taskDir, 'IMPLEMENTATION', '`scripts/impl.mjs`');
    assertClean(run(taskDir, repoRoot));
  });

  test('TC-72 status.md without a stage table -> status.md [R2]', () => {
    const { taskDir, repoRoot } = makeTask();
    write(taskDir, 'status.md', '# Status — FIX-001\n\nnothing here\n');
    assertProblem(run(taskDir, repoRoot), 'status.md', 'R2');
  });

  test('TC-73 every stage name is recognised (all 11 present in fixture, canonical order)', () => {
    // Guards the fixture itself so negative tests above are meaningful.
    const rows = read(VALID_FIXTURE, 'status.md')
      .split('\n')
      .map((l) => l.split('|').map((c) => c.trim())[1])
      .filter((s) => STAGES.includes(s));
    assert.deepEqual(rows, STAGES);
  });

  test('TC-74 CLI: duplicated stage -> exit 1 with status.md [R2] line', () => {
    const { taskDir, repoRoot } = makeTask();
    const row = '| INTAKE | passed | analyst | `request.md` | ok |\n';
    edit(taskDir, 'status.md', row, row + row);
    const r = cli([taskDir], { cwd: repoRoot });
    assert.equal(r.status, 1, r.stdout + r.stderr);
    assert.match(r.stdout, /status\.md:.*\[R2\]/);
  });
});

// ---------------------------------------------------------------- AC-4 (R8, R9, R10)

describe('AC-4: review verdict, final decision, accepted gate (R8, R9, R10)', () => {
  test('TC-80 review verdict not in allowed set ("lgtm") -> review.md [R8]', () => {
    const { taskDir, repoRoot } = makeTask();
    edit(taskDir, 'review.md', '## Verdict\napproved', '## Verdict\nlgtm');
    assertProblem(run(taskDir, repoRoot), 'review.md', 'R8');
  });

  test('TC-81 review.md without "## Verdict" -> review.md [R8]', () => {
    const { taskDir, repoRoot } = makeTask();
    edit(taskDir, 'review.md', '## Verdict\napproved', '## Summary\napproved');
    assertProblem(run(taskDir, repoRoot), 'review.md', 'R8');
  });

  test('TC-82 verdict after blank lines is still read (boundary: first NON-empty line)', () => {
    const { taskDir, repoRoot } = makeTask();
    edit(taskDir, 'review.md', '## Verdict\napproved', '## Verdict\n\n\napproved');
    assertClean(run(taskDir, repoRoot));
  });

  for (const verdict of ['changes_requested', 'blocked']) {
    test(`TC-83 accepted with review verdict "${verdict}" -> [R10]`, () => {
      const { taskDir, repoRoot } = makeTask();
      edit(taskDir, 'review.md', '## Verdict\napproved', `## Verdict\n${verdict}`);
      const problems = run(taskDir, repoRoot);
      assertR10BothFiles(problems);
      assertNoRule(problems, 'R8');
    });
  }

  for (const status of ['failed', 'not_run', 'blocked']) {
    test(`TC-84 accepted with an AC "${status}" in acceptance.md -> [R10]`, () => {
      const { taskDir, repoRoot } = makeTask();
      setAcRow(taskDir, 'acceptance.md', 'AC-2', status, '');
      assertR10BothFiles(run(taskDir, repoRoot));
    });
  }

  test('TC-85 accepted with zero AC rows in acceptance.md -> [R10]', () => {
    const { taskDir, repoRoot } = makeTask();
    const content = read(taskDir, 'acceptance.md')
      .split('\n')
      .filter((l) => !l.startsWith('| AC-'))
      .join('\n');
    write(taskDir, 'acceptance.md', content);
    assertR10BothFiles(run(taskDir, repoRoot));
  });

  for (const status of ['in_progress', 'pending', 'failed', 'blocked']) {
    test(`TC-86 accepted with FINAL_ACCEPTANCE "${status}" -> [R10]`, () => {
      const { taskDir, repoRoot } = makeTask();
      setStage(taskDir, 'FINAL_ACCEPTANCE', status);
      setStage(taskDir, 'DELIVERY', 'pending'); // keep R3 out of the way
      assertR10BothFiles(run(taskDir, repoRoot));
    });
  }

  test('TC-87 accepted only in delivery-report.md (acceptance.md blocked) + AC failed -> [R10]', () => {
    const { taskDir, repoRoot } = makeTask();
    edit(taskDir, 'acceptance.md', 'accepted — all AC passed with evidence', 'blocked — waiting');
    setAcRow(taskDir, 'acceptance.md', 'AC-1', 'failed', '`artifacts/logs/unit.log`');
    const problems = run(taskDir, repoRoot);
    assertProblem(problems, 'delivery-report.md', 'R10');
    assert.ok(!hasProblem(problems, 'acceptance.md', 'R10'), 'acceptance.md is not accepted -> no R10 with its prefix');
  });

  test('TC-88 accepted only in acceptance.md (delivery-report blocked) + review changes_requested -> [R10]', () => {
    const { taskDir, repoRoot } = makeTask();
    edit(taskDir, 'delivery-report.md', 'accepted — delivered', 'blocked — waiting');
    edit(taskDir, 'review.md', '## Verdict\napproved', '## Verdict\nchanges_requested');
    const problems = run(taskDir, repoRoot);
    assertProblem(problems, 'acceptance.md', 'R10');
    assert.ok(!hasProblem(problems, 'delivery-report.md', 'R10'), 'delivery-report.md is not accepted -> no R10 with its prefix');
  });

  for (const file of ['acceptance.md', 'delivery-report.md']) {
    test(`TC-89 ${file}: Final decision first word not allowed ("approved") -> ${file} [R9]`, () => {
      const { taskDir, repoRoot } = makeTask();
      const from = file === 'acceptance.md' ? 'accepted — all AC passed with evidence' : 'accepted — delivered';
      edit(taskDir, file, from, 'approved — looks good');
      assertProblem(run(taskDir, repoRoot), file, 'R9');
    });

    test(`TC-90 ${file}: missing "## Final decision" -> ${file} [R9]`, () => {
      const { taskDir, repoRoot } = makeTask();
      edit(taskDir, file, '## Final decision', '## Decision');
      assertProblem(run(taskDir, repoRoot), file, 'R9');
    });

    test(`TC-91 ${file}: empty "## Final decision" section -> ${file} [R9]`, () => {
      const { taskDir, repoRoot } = makeTask();
      const content = read(taskDir, file);
      const idx = content.indexOf('## Final decision');
      assert.ok(idx >= 0);
      write(taskDir, file, content.slice(0, idx) + '## Final decision\n\n');
      assertProblem(run(taskDir, repoRoot), file, 'R9');
    });
  }

  test('TC-92 "rejected"/"blocked" decisions with failing AC and unapproved review -> no [R10] (boundary)', () => {
    const { taskDir, repoRoot } = makeTask();
    edit(taskDir, 'acceptance.md', 'accepted — all AC passed with evidence', 'rejected — AC-1 failed');
    edit(taskDir, 'delivery-report.md', 'accepted — delivered', 'blocked — rework');
    setAcRow(taskDir, 'acceptance.md', 'AC-1', 'failed', '`artifacts/logs/unit.log`');
    edit(taskDir, 'review.md', '## Verdict\napproved', '## Verdict\nchanges_requested');
    const problems = run(taskDir, repoRoot);
    assertNoRule(problems, 'R10');
    assertNoRule(problems, 'R9');
    assertNoRule(problems, 'R8');
  });

  test('TC-93 decision word followed by text on the same line is OK (boundary: first word)', () => {
    const { taskDir, repoRoot } = makeTask();
    edit(taskDir, 'acceptance.md', 'accepted — all AC passed with evidence', 'accepted');
    edit(taskDir, 'delivery-report.md', 'accepted — delivered', 'accepted after QA run');
    assertClean(run(taskDir, repoRoot));
  });

  test('TC-94 CLI: accepted with a not_run AC -> exit 1 with [R10]', () => {
    const { taskDir, repoRoot } = makeTask();
    setAcRow(taskDir, 'acceptance.md', 'AC-1', 'not_run', '');
    const r = cli([taskDir], { cwd: repoRoot });
    assert.equal(r.status, 1, r.stdout + r.stderr);
    assert.match(r.stdout, /\[R10\]/);
  });
});

// ---------------------------------------------------------------- Rework cycle 1: review findings 1–4, 11 and D1–D11

const AC_ACCEPTED = 'accepted — all AC passed with evidence';
const DR_ACCEPTED = 'accepted — delivered';
const UNIT_LINE = '- unit: passed — `artifacts/logs/unit.log`';

describe('Regression f1 / D1: fenced code and HTML comments are not live markdown', () => {
  test('TC-100 ``` fenced decoy AC section before the real one; real AC-2 failed + accepted -> [R10]', () => {
    const { taskDir, repoRoot } = makeTask();
    setAcRow(taskDir, 'acceptance.md', 'AC-2', 'failed', '`artifacts/logs/cli.log`');
    edit(
      taskDir,
      'acceptance.md',
      '## Pre-QA business validation',
      '## Format reminder\n```markdown\n## Acceptance criteria\n| AC | Status | Evidence |\n|---|---|---|\n| AC-1 | passed | `artifacts/logs/unit.log` |\n```\n\n## Pre-QA business validation',
    );
    assertProblem(run(taskDir, repoRoot), 'acceptance.md', 'R10');
  });

  test('TC-101 ~~~ fenced decoy verdict "approved" before real changes_requested + accepted -> [R10]', () => {
    const { taskDir, repoRoot } = makeTask();
    edit(taskDir, 'review.md', '## Verdict\napproved', '~~~\n## Verdict\napproved\n~~~\n\n## Verdict\nchanges_requested');
    const problems = run(taskDir, repoRoot);
    assertR10BothFiles(problems);
  });

  test('TC-102 status.md: all-passed example table inside <!-- --> before real table with FINAL_ACCEPTANCE pending -> [R10]', () => {
    const { taskDir, repoRoot } = makeTask();
    const original = read(taskDir, 'status.md');
    const tableStart = original.indexOf('| Stage |');
    const exampleTable = original.slice(tableStart);
    setStage(taskDir, 'FINAL_ACCEPTANCE', 'pending');
    setStage(taskDir, 'DELIVERY', 'pending');
    const real = read(taskDir, 'status.md');
    const idx = real.indexOf('| Stage |');
    write(taskDir, 'status.md', `${real.slice(0, idx)}<!--\n${exampleTable}-->\n\n${real.slice(idx)}`);
    assertR10BothFiles(run(taskDir, repoRoot));
  });

  test('TC-103 fenced block with bogus rows/sections AFTER real sections does not create problems (boundary)', () => {
    const { taskDir, repoRoot } = makeTask();
    const extra =
      '\n## Notes\n```\n## Acceptance criteria\n| AC-9 | passed | TBD |\n## Final decision\nmaybe\n```\n<!--\n## Verification\n- x: done\n-->\n';
    write(taskDir, 'acceptance.md', read(taskDir, 'acceptance.md') + extra);
    write(taskDir, 'qa-results.md', read(taskDir, 'qa-results.md') + extra);
    assertClean(run(taskDir, repoRoot));
  });
});

describe('Regression f2 / D2: duplicated checked sections', () => {
  test('TC-104 two "## Acceptance criteria" in acceptance.md -> acceptance.md [R5]', () => {
    const { taskDir, repoRoot } = makeTask();
    edit(
      taskDir,
      'acceptance.md',
      '## Final decision',
      '## Acceptance criteria\n| AC | Status | Evidence |\n|---|---|---|\n| AC-2 | failed | `artifacts/logs/cli.log` |\n\n## Final decision',
    );
    assertProblem(run(taskDir, repoRoot), 'acceptance.md', 'R5');
  });

  test('TC-105 two "## Final decision" (blocked, then accepted) -> acceptance.md [R9]', () => {
    const { taskDir, repoRoot } = makeTask();
    edit(taskDir, 'acceptance.md', `## Final decision\n${AC_ACCEPTED}`, `## Final decision\nblocked — wait\n\n## Final decision\n${AC_ACCEPTED}`);
    assertProblem(run(taskDir, repoRoot), 'acceptance.md', 'R9');
  });

  for (const file of ['qa-results.md', 'delivery-report.md']) {
    test(`TC-106 two "## Verification" in ${file} -> ${file} [R7]`, () => {
      const { taskDir, repoRoot } = makeTask();
      write(taskDir, file, read(taskDir, file) + `\n## Verification\n${UNIT_LINE}\n`);
      assertProblem(run(taskDir, repoRoot), file, 'R7');
    });
  }

  test('TC-107 two "## Verdict" in review.md -> review.md [R8]', () => {
    const { taskDir, repoRoot } = makeTask();
    write(taskDir, 'review.md', read(taskDir, 'review.md') + '\n## Verdict\napproved\n');
    assertProblem(run(taskDir, repoRoot), 'review.md', 'R8');
  });
});

describe('Regression f3 / D3: table rows must be contiguous', () => {
  test('TC-108 acceptance.md: blank line before AC-2 row -> acceptance.md [R5]', () => {
    const { taskDir, repoRoot } = makeTask();
    edit(taskDir, 'acceptance.md', '\n| AC-2 |', '\n\n| AC-2 |');
    assertProblem(run(taskDir, repoRoot), 'acceptance.md', 'R5');
  });

  test('TC-109 acceptance.md: blank line before a failed AC-2 + accepted -> [R5] (not silently OK)', () => {
    const { taskDir, repoRoot } = makeTask();
    setAcRow(taskDir, 'acceptance.md', 'AC-2', 'failed', '`artifacts/logs/cli.log`');
    edit(taskDir, 'acceptance.md', '\n| AC-2 |', '\n\n| AC-2 |');
    const problems = run(taskDir, repoRoot);
    assertProblem(problems, 'acceptance.md', 'R5');
  });

  test('TC-110 qa-results.md: text line splitting the AC table -> qa-results.md [R5]', () => {
    const { taskDir, repoRoot } = makeTask();
    edit(taskDir, 'qa-results.md', '\n| AC-2 |', '\nsee below\n| AC-2 |');
    assertProblem(run(taskDir, repoRoot), 'qa-results.md', 'R5');
  });

  test('TC-111 status.md: blank line inside the stage table -> status.md [R2]', () => {
    const { taskDir, repoRoot } = makeTask();
    edit(taskDir, 'status.md', '\n| CODE_REVIEW |', '\n\n| CODE_REVIEW |');
    assertProblem(run(taskDir, repoRoot), 'status.md', 'R2');
  });
});

describe('Regression f4 / D4: struck-through text is removed entirely', () => {
  test('TC-112 verdict "~~approved~~ changes_requested" + accepted -> [R10], no [R8]', () => {
    const { taskDir, repoRoot } = makeTask();
    edit(taskDir, 'review.md', '## Verdict\napproved', '## Verdict\n~~approved~~ changes_requested');
    const problems = run(taskDir, repoRoot);
    assertR10BothFiles(problems);
    assertNoRule(problems, 'R8');
  });

  test('TC-113 decision "~~blocked~~ accepted" with failed AC -> acceptance.md [R10]', () => {
    const { taskDir, repoRoot } = makeTask();
    edit(taskDir, 'delivery-report.md', DR_ACCEPTED, 'blocked — wait');
    edit(taskDir, 'acceptance.md', AC_ACCEPTED, '~~blocked~~ accepted');
    setAcRow(taskDir, 'acceptance.md', 'AC-2', 'failed', '`artifacts/logs/cli.log`');
    assertProblem(run(taskDir, repoRoot), 'acceptance.md', 'R10');
  });

  test('TC-114 verdict "~~approved~~" only, decisions accepted -> review.md [R8] or [R10] (never clean)', () => {
    const { taskDir, repoRoot } = makeTask();
    edit(taskDir, 'review.md', '## Verdict\napproved', '## Verdict\n~~approved~~');
    const problems = run(taskDir, repoRoot);
    assert.ok(
      hasProblem(problems, 'review.md', 'R8') || hasProblem(problems, null, 'R10'),
      `expected [R8] or [R10], got:\n  ${problems.join('\n  ')}`,
    );
  });

  test('TC-115 verdict "approved — no blockers" (explanation after verdict) is clean (R8 clarification)', () => {
    const { taskDir, repoRoot } = makeTask();
    edit(taskDir, 'review.md', '## Verdict\napproved', '## Verdict\napproved — no blockers');
    assertClean(run(taskDir, repoRoot));
  });
});

describe('D5: passed requires at least one existing path token', () => {
  for (const evidence of ['all good, trust me', '`node --test scripts/`', '**TBD**', '_TODO_', 'TBD.', '`pnpm test`', '`unit`']) {
    test(`TC-116 acceptance.md: passed with evidence ${JSON.stringify(evidence)} -> acceptance.md [R5]`, () => {
      const { taskDir, repoRoot } = makeTask();
      setAcRow(taskDir, 'acceptance.md', 'AC-1', 'passed', evidence);
      assertProblem(run(taskDir, repoRoot), 'acceptance.md', 'R5');
    });
  }

  test('TC-117 qa-results.md: passed with free-text evidence -> qa-results.md [R5]', () => {
    const { taskDir, repoRoot } = makeTask();
    setAcRow(taskDir, 'qa-results.md', 'AC-2', 'passed', 'ran it locally');
    assertProblem(run(taskDir, repoRoot), 'qa-results.md', 'R5');
  });

  for (const tail of ['yes', '`none`', '`node --test scripts/`', 'see logs']) {
    for (const file of ['qa-results.md', 'delivery-report.md']) {
      test(`TC-118 ${file}: "- unit: passed — ${tail}" (no path) -> ${file} [R7]`, () => {
        const { taskDir, repoRoot } = makeTask();
        edit(taskDir, file, UNIT_LINE, `- unit: passed — ${tail}`);
        assertProblem(run(taskDir, repoRoot), file, 'R7');
      });
    }
  }
});

describe('D6 / R11: evidence paths must be relative, inside repoRoot, regular files', () => {
  const cases = [
    ['absolute /etc/hosts', '`/etc/hosts`'],
    ['root /', '`/`'],
    ['/dev/null', '`/dev/null`'],
    ['..-escape', '`../../../../../../../../../../../../etc/hosts`'],
    ['directory artifacts/logs/', '`artifacts/logs/`'],
    ['directory artifacts/logs', '`artifacts/logs`'],
  ];
  for (const [name, evidence] of cases) {
    test(`TC-119 acceptance.md AC evidence ${name} -> acceptance.md [R11]`, () => {
      const { taskDir, repoRoot } = makeTask();
      setAcRow(taskDir, 'acceptance.md', 'AC-1', 'passed', evidence);
      assertProblem(run(taskDir, repoRoot), 'acceptance.md', 'R11');
    });
  }

  test('TC-120 Verification evidence absolute path -> qa-results.md [R11]', () => {
    const { taskDir, repoRoot } = makeTask();
    edit(taskDir, 'qa-results.md', UNIT_LINE, '- unit: passed — `/etc/hosts`');
    assertProblem(run(taskDir, repoRoot), 'qa-results.md', 'R11');
  });

  test('TC-121 ..-escape to a file that exists just outside repoRoot -> [R11]', () => {
    const { taskDir, repoRoot } = makeTask();
    fs.writeFileSync(path.join(repoRoot, '..', 'outside.log'), 'outside\n');
    setAcRow(taskDir, 'acceptance.md', 'AC-1', 'passed', '`../../outside.log`');
    assertProblem(run(taskDir, repoRoot), 'acceptance.md', 'R11');
  });

  test('TC-122 ".." that stays inside repoRoot and points to a file is OK (boundary)', () => {
    const { taskDir, repoRoot } = makeTask();
    setAcRow(taskDir, 'acceptance.md', 'AC-1', 'passed', '`../task/artifacts/logs/unit.log`');
    assertClean(run(taskDir, repoRoot));
  });

  test('TC-123 passed stage with artifact `/` -> status.md [R4] or [R11]', () => {
    const { taskDir, repoRoot } = makeTask();
    setStageArtifact(taskDir, 'IMPLEMENTATION', '`/`');
    const problems = run(taskDir, repoRoot);
    assert.ok(
      hasProblem(problems, 'status.md', 'R4') || hasProblem(problems, 'status.md', 'R11'),
      `expected status.md [R4] or [R11], got:\n  ${problems.join('\n  ')}`,
    );
  });
});

describe('D7: unreadable task files / dir -> exit 2 without stack trace', { skip: process.platform === 'win32' || process.getuid?.() === 0 }, () => {
  const STACK = /^\s+at .+:\d+:\d+\)?$/m;

  test('TC-124 chmod 000 status.md -> CLI exit 2, no stack trace', () => {
    const { taskDir, repoRoot } = makeTask();
    const f = path.join(taskDir, 'status.md');
    fs.chmodSync(f, 0o000);
    try {
      const r = cli([taskDir], { cwd: repoRoot });
      assert.equal(r.status, 2, r.stdout + r.stderr);
      assert.doesNotMatch(r.stderr + r.stdout, STACK);
    } finally {
      fs.chmodSync(f, 0o644);
    }
  });

  test('TC-125 chmod 000 task directory -> CLI exit 2, no stack trace', () => {
    const { taskDir, repoRoot } = makeTask();
    fs.chmodSync(taskDir, 0o000);
    try {
      const r = cli([taskDir], { cwd: repoRoot });
      assert.equal(r.status, 2, r.stdout + r.stderr);
      assert.doesNotMatch(r.stderr + r.stdout, STACK);
    } finally {
      fs.chmodSync(taskDir, 0o755);
    }
  });
});

describe('D8: Verification bullets', () => {
  test('TC-126 indented sub-bullets under a check are ignored', () => {
    const { taskDir, repoRoot } = makeTask();
    for (const file of ['qa-results.md', 'delivery-report.md']) {
      edit(
        taskDir,
        file,
        '- e2e: not_run — no UI in this fixture',
        '- e2e: not_run — no UI in this fixture\n  - reason: no Playwright yet\n    - nested: whatever',
      );
    }
    assertClean(run(taskDir, repoRoot));
  });

  test('TC-127 check name containing ":" — "- unit (node:test): passed — `...`" is OK', () => {
    const { taskDir, repoRoot } = makeTask();
    edit(taskDir, 'qa-results.md', UNIT_LINE, '- unit (node:test): passed — `artifacts/logs/unit.log`');
    assertClean(run(taskDir, repoRoot));
  });

  test('TC-128 top-level free-text bullet -> qa-results.md [R7]', () => {
    const { taskDir, repoRoot } = makeTask();
    edit(taskDir, 'qa-results.md', UNIT_LINE, `${UNIT_LINE}\n- logs are in artifacts`);
    assertProblem(run(taskDir, repoRoot), 'qa-results.md', 'R7');
  });

  test('TC-129 empty "## Verification" section -> qa-results.md [R7]', () => {
    const { taskDir, repoRoot } = makeTask();
    const content = read(taskDir, 'qa-results.md');
    const start = content.indexOf('## Verification');
    const end = content.indexOf('## Defects');
    write(taskDir, 'qa-results.md', `${content.slice(0, start)}## Verification\n\n${content.slice(end)}`);
    assertProblem(run(taskDir, repoRoot), 'qa-results.md', 'R7');
  });
});

describe('D9: passed stage needs at least one existing artifact path', () => {
  test('TC-130 passed stage whose Artifact has only a non-path token -> status.md [R4]', () => {
    const { taskDir, repoRoot } = makeTask();
    setStageArtifact(taskDir, 'INTEGRATION', '`merged`');
    assertProblem(run(taskDir, repoRoot), 'status.md', 'R4');
  });

  test('TC-131 non-passed stage with empty Artifact is fine (template honesty, boundary)', () => {
    const { taskDir, repoRoot } = makeTask();
    edit(taskDir, 'acceptance.md', AC_ACCEPTED, 'blocked — in progress');
    edit(taskDir, 'delivery-report.md', DR_ACCEPTED, 'blocked — in progress');
    setStage(taskDir, 'FINAL_ACCEPTANCE', 'pending');
    setStage(taskDir, 'DELIVERY', 'pending');
    setStageArtifact(taskDir, 'DELIVERY', '');
    assertClean(run(taskDir, repoRoot));
  });
});

describe('D10: delivery-report AC table (R5) and qa-results AC in the accepted gate (R10)', () => {
  for (const evidence of ['', 'TBD', 'all fine']) {
    test(`TC-132 delivery-report.md: passed with evidence ${JSON.stringify(evidence)} -> delivery-report.md [R5]`, () => {
      const { taskDir, repoRoot } = makeTask();
      setAcRow(taskDir, 'delivery-report.md', 'AC-1', 'passed', evidence);
      assertProblem(run(taskDir, repoRoot), 'delivery-report.md', 'R5');
    });
  }

  test('TC-133 delivery-report.md: invalid AC status "ok" -> delivery-report.md [R5]', () => {
    const { taskDir, repoRoot } = makeTask();
    setAcRow(taskDir, 'delivery-report.md', 'AC-1', 'ok', '`artifacts/logs/unit.log`');
    assertProblem(run(taskDir, repoRoot), 'delivery-report.md', 'R5');
  });

  test('TC-134 delivery-report.md: missing "## Acceptance criteria" -> delivery-report.md [R5]', () => {
    const { taskDir, repoRoot } = makeTask();
    edit(taskDir, 'delivery-report.md', '## Acceptance criteria', '## AC');
    assertProblem(run(taskDir, repoRoot), 'delivery-report.md', 'R5');
  });

  for (const status of ['failed', 'not_run', 'blocked']) {
    test(`TC-135 accepted with qa-results.md AC "${status}" (acceptance.md all passed) -> [R10] in both accepted files`, () => {
      const { taskDir, repoRoot } = makeTask();
      setAcRow(taskDir, 'qa-results.md', 'AC-2', status, '');
      assertR10BothFiles(run(taskDir, repoRoot));
    });
  }
});

describe('D11: verbatim CLI label and lowercase, case-sensitive keywords', () => {
  test('TC-136 CLI arg with trailing "/" is used verbatim in problem and FAIL lines', () => {
    const { taskDir, repoRoot } = makeTask();
    fs.rmSync(path.join(taskDir, 'request.md'));
    const r = cli(['task/'], { cwd: repoRoot });
    assert.equal(r.status, 1, r.stdout + r.stderr);
    const lines = r.stdout.split('\n');
    assert.ok(lines.some((l) => l.startsWith('task/') && l.includes('request.md:') && l.includes('[R1]')), r.stdout);
    assert.ok(lines.some((l) => l.startsWith('FAIL task/ (')), r.stdout);
  });

  test('TC-137 CLI relative arg "task" -> lines "task/<file>: ..." and "FAIL task (n problems)"', () => {
    const { taskDir, repoRoot } = makeTask();
    fs.rmSync(path.join(taskDir, 'request.md'));
    const r = cli(['task'], { cwd: repoRoot });
    assert.equal(r.status, 1, r.stdout + r.stderr);
    const lines = r.stdout.split('\n');
    assert.ok(lines.some((l) => l.startsWith('task/request.md:')), r.stdout);
    assert.ok(lines.some((l) => /^FAIL task \(\d+ problems?\)\s*$/.test(l)), r.stdout);
  });

  test('TC-138 CLI relative valid arg -> "OK task"', () => {
    const { repoRoot } = makeTask();
    const r = cli(['task'], { cwd: repoRoot });
    assert.equal(r.status, 0, r.stdout + r.stderr);
    assert.ok(r.stdout.split('\n').some((l) => l.trim() === 'OK task'), r.stdout);
  });

  const caseCases = [
    ['acceptance.md AC status "Passed"', (t) => setAcRow(t, 'acceptance.md', 'AC-1', 'Passed', '`artifacts/logs/unit.log`'), 'acceptance.md', 'R5'],
    ['qa-results.md AC status "PASSED"', (t) => setAcRow(t, 'qa-results.md', 'AC-1', 'PASSED', '`artifacts/logs/unit.log`'), 'qa-results.md', 'R5'],
    ['Verification status "Passed"', (t) => edit(t, 'qa-results.md', UNIT_LINE, '- unit: Passed — `artifacts/logs/unit.log`'), 'qa-results.md', 'R7'],
    ['stage status "Passed"', (t) => setStage(t, 'ANALYSIS', 'Passed'), 'status.md', 'R2'],
    ['verdict "Approved"', (t) => edit(t, 'review.md', '## Verdict\napproved', '## Verdict\nApproved'), 'review.md', 'R8'],
    ['decision "Accepted"', (t) => edit(t, 'acceptance.md', AC_ACCEPTED, 'Accepted — all good'), 'acceptance.md', 'R9'],
  ];
  for (const [name, mutate, file, rule] of caseCases) {
    test(`TC-139 ${name} -> ${file} [${rule}]`, () => {
      const { taskDir, repoRoot } = makeTask();
      mutate(taskDir);
      assertProblem(run(taskDir, repoRoot), file, rule);
    });
  }
});

describe('Review f11(d): remaining gaps', () => {
  test('TC-140 R6 also applies to non-passed AC rows: failed with missing path -> [R6]', () => {
    const { taskDir, repoRoot } = makeTask();
    edit(taskDir, 'acceptance.md', AC_ACCEPTED, 'rejected — AC-1 failed');
    edit(taskDir, 'delivery-report.md', DR_ACCEPTED, 'rejected — AC-1 failed');
    setAcRow(taskDir, 'acceptance.md', 'AC-1', 'failed', '`artifacts/logs/failing-run.log`');
    assertProblem(run(taskDir, repoRoot), 'acceptance.md', 'R6');
  });

  for (const suffix of [':12', '#L3']) {
    test(`TC-141 evidence path with "${suffix}" suffix is resolved without it`, () => {
      const { taskDir, repoRoot } = makeTask();
      setAcRow(taskDir, 'acceptance.md', 'AC-1', 'passed', `\`artifacts/logs/unit.log${suffix}\``);
      edit(taskDir, 'qa-results.md', UNIT_LINE, `- unit: passed — \`artifacts/logs/unit.log${suffix}\``);
      assertClean(run(taskDir, repoRoot));
    });
  }

  test('TC-142 misspelled stage name ("INTEGRATON") -> status.md [R2]', () => {
    const { taskDir, repoRoot } = makeTask();
    edit(taskDir, 'status.md', '| INTEGRATION |', '| INTEGRATON |');
    assertProblem(run(taskDir, repoRoot), 'status.md', 'R2');
  });

  test('TC-143 CRLF line endings: valid fixture stays clean', () => {
    const { taskDir, repoRoot } = makeTask();
    for (const file of REQUIRED_FILES) write(taskDir, file, read(taskDir, file).replace(/\n/g, '\r\n'));
    assertClean(run(taskDir, repoRoot));
  });

  test('TC-144 CRLF line endings: failed AC + accepted still -> [R10]', () => {
    const { taskDir, repoRoot } = makeTask();
    setAcRow(taskDir, 'acceptance.md', 'AC-2', 'failed', '`artifacts/logs/cli.log`');
    for (const file of REQUIRED_FILES) write(taskDir, file, read(taskDir, file).replace(/\n/g, '\r\n'));
    assertR10BothFiles(run(taskDir, repoRoot));
  });

  test('TC-145 taskDir path containing spaces: valid -> exit 0, missing file -> exit 1', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'check task spaces '));
    tempRoots.push(tmp);
    const repoRoot = path.join(tmp, 'my repo');
    const taskDir = path.join(repoRoot, 'my task');
    fs.mkdirSync(repoRoot, { recursive: true });
    fs.writeFileSync(path.join(repoRoot, 'AGENTS.md'), '# root\n');
    fs.cpSync(VALID_FIXTURE, taskDir, { recursive: true });
    assertClean(run(taskDir, repoRoot));
    let r = cli([taskDir], { cwd: repoRoot });
    assert.equal(r.status, 0, r.stdout + r.stderr);
    fs.rmSync(path.join(taskDir, 'review.md'));
    r = cli([taskDir], { cwd: repoRoot });
    assert.equal(r.status, 1, r.stdout + r.stderr);
    assert.ok(r.stdout.split('\n').some((l) => l.startsWith(`${taskDir}/review.md:`)), r.stdout);
  });
});

describe('D12: accepted requires >=1 AC, all passed, in qa-results.md AND delivery-report.md', () => {
  for (const file of ['qa-results.md', 'delivery-report.md']) {
    test(`TC-146 accepted + ${file} AC table with zero rows -> [R10] in both accepted files`, () => {
      const { taskDir, repoRoot } = makeTask();
      const content = read(taskDir, file)
        .split('\n')
        .filter((l) => !l.startsWith('| AC-'))
        .join('\n');
      write(taskDir, file, content);
      assertR10BothFiles(run(taskDir, repoRoot));
    });

    for (const status of ['not_run', 'failed']) {
      test(`TC-147 accepted + ${file} AC-1 "${status}" -> [R10] in both accepted files`, () => {
        const { taskDir, repoRoot } = makeTask();
        setAcRow(taskDir, file, 'AC-1', status, '');
        assertR10BothFiles(run(taskDir, repoRoot));
      });
    }

    test(`TC-148 ${file} AC-1 "failed" with decisions blocked -> no [R10] (boundary)`, () => {
      const { taskDir, repoRoot } = makeTask();
      edit(taskDir, 'acceptance.md', AC_ACCEPTED, 'blocked — rework');
      edit(taskDir, 'delivery-report.md', DR_ACCEPTED, 'blocked — rework');
      setAcRow(taskDir, file, 'AC-1', 'failed', '');
      assertNoRule(run(taskDir, repoRoot), 'R10');
    });
  }
});

describe('D13: R11 containment = repo root OR task folder', () => {
  function makeDetached() {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'check-task-d13-'));
    tempRoots.push(tmp);
    const repoRoot = path.join(tmp, 'repo');
    const taskDir = path.join(tmp, 'elsewhere', 'task');
    fs.mkdirSync(repoRoot, { recursive: true });
    fs.cpSync(VALID_FIXTURE, taskDir, { recursive: true });
    return { tmp, repoRoot, taskDir };
  }

  test('TC-149 task folder outside repoRoot, evidence inside the task folder -> clean', () => {
    const { taskDir, repoRoot } = makeDetached();
    assertClean(run(taskDir, repoRoot));
  });

  test('TC-150 task folder outside repoRoot, evidence escaping both via ".." -> acceptance.md [R11]', () => {
    const { tmp, taskDir, repoRoot } = makeDetached();
    fs.writeFileSync(path.join(tmp, 'elsewhere', 'sibling.log'), 'x\n');
    setAcRow(taskDir, 'acceptance.md', 'AC-1', 'passed', '`../sibling.log`');
    assertProblem(run(taskDir, repoRoot), 'acceptance.md', 'R11');
  });
});

// ---------------------------------------------------------------- Rework cycle 2: D14–D16, R2-4

const AC_TABLE_FILES = ['acceptance.md', 'qa-results.md', 'delivery-report.md'];

function dropAcRow(taskDir, file, ac) {
  const before = read(taskDir, file);
  const after = before
    .split('\n')
    .filter((l) => !l.startsWith(`| ${ac} |`))
    .join('\n');
  assert.notEqual(after, before, `test setup: ${ac} row not found in ${file}`);
  write(taskDir, file, after);
}

function addAcRow(taskDir, file, row) {
  // Insert right after the last existing AC row so the table stays contiguous (D3).
  const lines = read(taskDir, file).split('\n');
  let last = -1;
  lines.forEach((l, i) => {
    if (l.startsWith('| AC-')) last = i;
  });
  assert.ok(last >= 0, `test setup: no AC rows in ${file}`);
  lines.splice(last + 1, 0, row);
  write(taskDir, file, lines.join('\n'));
}

describe('D14: AC set comes from specification.md', () => {
  test('TC-151 fixture specification.md lists exactly AC-1, AC-2 as "- **AC-n:**" under "## Acceptance criteria"', () => {
    const spec = read(VALID_FIXTURE, 'specification.md');
    const section = spec.slice(spec.indexOf('## Acceptance criteria'));
    const ids = [...section.matchAll(/^- \*\*(AC-\d+):\*\*/gm)].map((m) => m[1]);
    assert.deepEqual(ids, ['AC-1', 'AC-2']);
  });

  test('TC-152 AC-2 deleted from all three tables while spec defines it + accepted -> [R10] in both accepted files', () => {
    const { taskDir, repoRoot } = makeTask();
    for (const file of AC_TABLE_FILES) dropAcRow(taskDir, file, 'AC-2');
    assertR10BothFiles(run(taskDir, repoRoot));
  });

  for (const file of AC_TABLE_FILES) {
    test(`TC-153 AC-2 deleted only from ${file} + accepted -> [R10]`, () => {
      const { taskDir, repoRoot } = makeTask();
      dropAcRow(taskDir, file, 'AC-2');
      assertR10BothFiles(run(taskDir, repoRoot));
    });
  }

  test('TC-154 spec defines AC-3 that no table lists + accepted -> [R10]', () => {
    const { taskDir, repoRoot } = makeTask();
    edit(taskDir, 'specification.md', '- **AC-2:** Fixture criterion two.', '- **AC-2:** Fixture criterion two.\n- **AC-3:** Fixture criterion three.');
    assertR10BothFiles(run(taskDir, repoRoot));
  });

  test('TC-155 spec "## Acceptance criteria" with no AC items + accepted -> [R10]', () => {
    const { taskDir, repoRoot } = makeTask();
    edit(taskDir, 'specification.md', '- **AC-1:** Fixture criterion one.\n- **AC-2:** Fixture criterion two.', 'nothing defined');
    assertR10BothFiles(run(taskDir, repoRoot));
  });

  test('TC-156 spec without "## Acceptance criteria" heading + accepted -> [R10]', () => {
    const { taskDir, repoRoot } = makeTask();
    edit(taskDir, 'specification.md', '## Acceptance criteria (testable)', '## Criteria');
    assertR10BothFiles(run(taskDir, repoRoot));
  });

  for (const file of AC_TABLE_FILES) {
    test(`TC-157 ${file}: AC-3 row (not in spec) -> ${file} [R5]`, () => {
      const { taskDir, repoRoot } = makeTask();
      addAcRow(taskDir, file, '| AC-3 | passed | `artifacts/logs/unit.log` |');
      assertProblem(run(taskDir, repoRoot), file, 'R5');
    });
  }

  test('TC-158 AC-2 missing from tables but decisions blocked -> no [R10] (boundary)', () => {
    const { taskDir, repoRoot } = makeTask();
    edit(taskDir, 'acceptance.md', AC_ACCEPTED, 'blocked — AC-2 pending');
    edit(taskDir, 'delivery-report.md', DR_ACCEPTED, 'blocked — AC-2 pending');
    for (const file of AC_TABLE_FILES) dropAcRow(taskDir, file, 'AC-2');
    assertNoRule(run(taskDir, repoRoot), 'R10');
  });

  test('TC-159 "- **AC-9:**" under another spec heading is not part of the AC set (boundary)', () => {
    const { taskDir, repoRoot } = makeTask();
    write(taskDir, 'specification.md', read(taskDir, 'specification.md') + '\n## Out of scope\n- **AC-9:** not a real criterion.\n');
    assertClean(run(taskDir, repoRoot));
  });
});

describe('D15: fence/comment detection must not hide visible content', () => {
  const DUP_FAILED =
    '\n## Acceptance criteria\n| AC | Status | Evidence |\n|---|---|---|\n| AC-2 | failed | `artifacts/logs/cli.log` |\n';
  const decoys = [
    ['N1b inline ```code``` at line start', '```node --test``` was run'],
    ['N2b comment opener inside inline code', 'Do not write `<!--` in reports.'],
  ];
  for (const [name, line] of decoys) {
    test(`TC-160 ${name}, then visible duplicate AC section with failed AC -> acceptance.md [R5]`, () => {
      const { taskDir, repoRoot } = makeTask();
      edit(taskDir, 'acceptance.md', 'Fixture scenario walked through.', `Fixture scenario walked through.\n${line}`);
      write(taskDir, 'acceptance.md', read(taskDir, 'acceptance.md') + DUP_FAILED);
      assertProblem(run(taskDir, repoRoot), 'acceptance.md', 'R5');
    });

    test(`TC-161 ${name} alone is harmless -> clean (boundary)`, () => {
      const { taskDir, repoRoot } = makeTask();
      edit(taskDir, 'acceptance.md', 'Fixture scenario walked through.', `Fixture scenario walked through.\n${line}`);
      assertClean(run(taskDir, repoRoot));
    });
  }

  test('TC-162 N2b in review.md above "## Verdict" does not hide the verdict -> clean', () => {
    const { taskDir, repoRoot } = makeTask();
    edit(taskDir, 'review.md', '## Findings', 'Note: the opener `<!--` must be escaped.\n\n## Findings');
    assertClean(run(taskDir, repoRoot));
  });

  const unterminated = [
    ['``` fence', '\n```\nsome code\n'],
    ['~~~ fence', '\n~~~\nsome code\n'],
    ['<!-- comment', '\n<!-- forgot to close\n'],
  ];
  for (const [name, tail] of unterminated) {
    for (const file of ['acceptance.md', 'review.md']) {
      test(`TC-163 unterminated ${name} at EOF of ${file} -> ${file} [R1]`, () => {
        const { taskDir, repoRoot } = makeTask();
        write(taskDir, file, read(taskDir, file) + tail);
        assertProblem(run(taskDir, repoRoot), file, 'R1');
      });
    }
  }
});

describe('D16: struck-through evidence is removed before path search', () => {
  test('TC-164 passed with only ~~`artifacts/logs/unit.log`~~ -> acceptance.md [R5]', () => {
    const { taskDir, repoRoot } = makeTask();
    setAcRow(taskDir, 'acceptance.md', 'AC-1', 'passed', '~~`artifacts/logs/unit.log`~~ not re-run');
    assertProblem(run(taskDir, repoRoot), 'acceptance.md', 'R5');
  });

  test('TC-165 Verification passed with only struck path -> qa-results.md [R7]', () => {
    const { taskDir, repoRoot } = makeTask();
    edit(taskDir, 'qa-results.md', UNIT_LINE, '- unit: passed — ~~`artifacts/logs/unit.log`~~');
    assertProblem(run(taskDir, repoRoot), 'qa-results.md', 'R7');
  });

  test('TC-166 struck missing path + live existing path -> clean (boundary)', () => {
    const { taskDir, repoRoot } = makeTask();
    setAcRow(taskDir, 'acceptance.md', 'AC-1', 'passed', '~~`artifacts/logs/old.log`~~ `artifacts/logs/unit.log`');
    assertClean(run(taskDir, repoRoot));
  });
});

describe('R2-4: absolute path pointing inside the repo is still rejected', () => {
  test('TC-167 AC evidence = absolute path of an existing file inside repoRoot -> acceptance.md [R11]', () => {
    const { taskDir, repoRoot } = makeTask();
    const abs = path.join(taskDir, 'artifacts', 'logs', 'unit.log');
    assert.ok(fs.existsSync(abs) && !abs.includes(' '));
    setAcRow(taskDir, 'acceptance.md', 'AC-1', 'passed', `\`${abs}\``);
    assertProblem(run(taskDir, repoRoot), 'acceptance.md', 'R11');
  });

  test('TC-168 Verification evidence = absolute path inside repoRoot -> qa-results.md [R11]', () => {
    const { taskDir, repoRoot } = makeTask();
    const abs = path.join(taskDir, 'artifacts', 'logs', 'unit.log');
    edit(taskDir, 'qa-results.md', UNIT_LINE, `- unit: passed — \`${abs}\``);
    assertProblem(run(taskDir, repoRoot), 'qa-results.md', 'R11');
  });
});
