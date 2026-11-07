#!/usr/bin/env node
// Checks a task folder (docs/tasks/<ID>) against the machine-checkable formats of
// docs/process/workflow.md §5. Rules R1–R11 and rework decisions D1–D16:
// docs/tasks/SWR-000/specification.md.
//
// CLI:    node scripts/check-task.mjs <taskDir> [<taskDir> ...]
//         exit 0 = no problems, 1 = problems found, 2 = usage / IO error.
// Module: checkTask(taskDir, { repoRoot }) -> { problems: string[] }
//         Every problem starts with "<file>: [Rn] ...".
//         Throws TaskIoError (code 'ETASKIO') when the task folder or a file in it cannot be read.
// Node 20 built-ins only.

import { existsSync, readdirSync, readFileSync, realpathSync, statSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const REQUIRED_FILES = [
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

export const STAGES = [
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

const STAGE_STATUSES = ['pending', 'in_progress', 'passed', 'failed', 'blocked'];
const CHECK_STATUSES = ['passed', 'failed', 'not_run', 'blocked'];
const VERDICTS = ['approved', 'changes_requested', 'blocked'];
const DECISIONS = ['accepted', 'rejected', 'blocked'];
const PLACEHOLDERS = new Set(['', '-', '—', '–', 'tbd', 'todo', 'n/a']);

export class TaskIoError extends Error {
  constructor(message) {
    super(message);
    this.name = 'TaskIoError';
    this.code = 'ETASKIO';
  }
}

// ---------------------------------------------------------------------------
// Markdown helpers

/**
 * D1/D15: blanks out fenced code blocks (``` / ~~~) and HTML comments, keeping the
 * line count so that line numbers in messages stay correct.
 * - A line opens a fence only if the rest of the line has no closing marker of the same
 *   kind (a backtick fence's info string cannot contain a backtick; a tilde fence's
 *   cannot contain an equally long tilde run) — otherwise it is inline code.
 * - A comment opener inside an inline code span does not open a comment.
 * Returns { lines: string[], unterminated: null | { kind: 'code block' | 'comment', lineNo } }.
 */
export function scanNonLive(content) {
  const lines = content.split(/\r?\n/);
  const out = [];
  let fence = null; // { ch, len, lineNo }
  let comment = null; // { lineNo }
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (fence) {
      const m = /^ {0,3}(`{3,}|~{3,})\s*$/.exec(line);
      if (m && m[1][0] === fence.ch && m[1].length >= fence.len) fence = null;
      out.push('');
      continue;
    }
    if (!comment) {
      const m = /^ {0,3}(`{3,}|~{3,})(.*)$/.exec(line);
      if (m) {
        const ch = m[1][0];
        const len = m[1].length;
        const rest = m[2];
        const closesOnLine = ch === '`' ? rest.includes('`') : new RegExp(`~{${len},}`).test(rest);
        if (!closesOnLine) {
          fence = { ch, len, lineNo: i + 1 };
          out.push('');
          continue;
        }
      }
    }
    let kept = '';
    let pos = 0;
    while (pos < line.length) {
      if (comment) {
        const end = line.indexOf('-->', pos);
        if (end === -1) {
          pos = line.length;
        } else {
          pos = end + 3;
          comment = null;
        }
        continue;
      }
      if (line[pos] === '`') {
        // Inline code span: a run of n backticks closed by a run of exactly n backticks.
        const run = /^`+/.exec(line.slice(pos))[0];
        const closeRe = new RegExp(`(?<!\`)${run}(?!\`)`, 'g');
        closeRe.lastIndex = pos + run.length;
        const close = closeRe.exec(line);
        const end = close ? close.index + run.length : pos + run.length;
        kept += line.slice(pos, end);
        pos = end;
        continue;
      }
      if (line.startsWith('<!--', pos)) {
        comment = { lineNo: i + 1 };
        pos += 4;
        continue;
      }
      kept += line[pos];
      pos++;
    }
    out.push(kept.trim() === '' ? '' : kept);
  }
  let unterminated = null;
  if (fence) unterminated = { kind: 'code block', lineNo: fence.lineNo };
  else if (comment) unterminated = { kind: 'comment', lineNo: comment.lineNo };
  return { lines: out, unterminated };
}

export function stripNonLive(content) {
  return scanNonLive(content).lines;
}

function toLines(rawLines) {
  return rawLines.map((text, i) => ({ text, lineNo: i + 1 }));
}

/** Returns every `## <title>` section as { lines: [{ text, lineNo }], headingLineNo }. */
function findSections(lines, title) {
  const want = title.trim().toLowerCase();
  const sections = [];
  for (let i = 0; i < lines.length; i++) {
    const m = /^##\s+(.+?)\s*#*\s*$/.exec(lines[i].text);
    if (!m || m[1].trim().toLowerCase() !== want) continue;
    const body = [];
    for (let j = i + 1; j < lines.length; j++) {
      if (/^#{1,2}\s/.test(lines[j].text)) break;
      body.push(lines[j]);
    }
    sections.push({ lines: body, headingLineNo: lines[i].lineNo });
  }
  return sections;
}

function isTableLine(text) {
  return text.trim().startsWith('|');
}

function splitRow(text) {
  let s = text.trim();
  if (s.startsWith('|')) s = s.slice(1);
  if (s.endsWith('|')) s = s.slice(0, -1);
  return s.split('|').map((c) => c.trim());
}

function isSeparatorRow(cells) {
  return cells.length > 0 && cells.every((c) => /^:?-+:?$/.test(c));
}

/**
 * Finds the first markdown table in `lines` whose header contains all `requiredCols`
 * (case-insensitive). Returns { header, rows: [{ cells, lineNo }], strayLines } or null.
 * D3: `strayLines` are `|`-lines after the table that are not contiguous with it.
 */
function findTable(lines, requiredCols) {
  for (let i = 0; i < lines.length; i++) {
    if (!isTableLine(lines[i].text)) continue;
    const header = splitRow(lines[i].text).map((h) => h.toLowerCase());
    const next = lines[i + 1];
    if (!next || !isSeparatorRow(splitRow(next.text))) continue;
    if (!requiredCols.every((c) => header.includes(c.toLowerCase()))) continue;
    const rows = [];
    let j = i + 2;
    for (; j < lines.length && isTableLine(lines[j].text); j++) {
      rows.push({ cells: splitRow(lines[j].text), lineNo: lines[j].lineNo });
    }
    const strayLines = lines.slice(j).filter((l) => isTableLine(l.text));
    return { header, rows, strayLines };
  }
  return null;
}

function cell(table, row, col) {
  const idx = table.header.indexOf(col.toLowerCase());
  return idx === -1 ? '' : (row.cells[idx] ?? '').trim();
}

function unwrap(text) {
  return text.replace(/^[*_`]+|[*_`]+$/g, '').trim();
}

/** D4/D16: struck-through text does not count. */
function stripStrike(text) {
  return text.replace(/~~.*?~~/g, ' ');
}

function backtickTokens(text) {
  return [...text.matchAll(/`([^`]+)`/g)].map((m) => m[1].trim());
}

/** R6: path-like = no whitespace, not a URL, and contains "/" or ends with ".<ext>". */
function isPathLike(token) {
  if (!token || /\s/.test(token)) return false;
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(token)) return false;
  return token.includes('/') || /\.[A-Za-z0-9]+$/.test(token);
}

/** D4/D11: first word of a verdict/decision line; struck-through text removed; case kept. */
function leadingWord(text) {
  const noStrike = stripStrike(text);
  const m = /^[\s*_`]*([A-Za-z][A-Za-z_]*[A-Za-z])/.exec(noStrike);
  return m ? m[1] : '';
}

function firstNonEmpty(section) {
  return section.lines.find((l) => l.text.trim() !== '') ?? null;
}

function isPlaceholder(evidence) {
  const e = evidence
    .trim()
    .replace(/^[*_`~\s]+|[*_`~\s.,;!]+$/g, '')
    .toLowerCase();
  return PLACEHOLDERS.has(e);
}

function caseHint(value, allowed) {
  return allowed.includes(value.toLowerCase()) && !allowed.includes(value) ? ' — values are lowercase' : '';
}

function isInside(p, base) {
  const rel = path.relative(base, p);
  return rel === '' || (rel !== '..' && !rel.startsWith(`..${path.sep}`) && !path.isAbsolute(rel));
}

function safeRealpath(p) {
  try {
    return realpathSync(p);
  } catch {
    return path.resolve(p);
  }
}

// ---------------------------------------------------------------------------
// Repo root

export function findRepoRoot(startDir) {
  let dir = path.resolve(startDir);
  for (;;) {
    if (existsSync(path.join(dir, 'AGENTS.md'))) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

// ---------------------------------------------------------------------------
// Checker

export function checkTask(taskDir, { repoRoot } = {}) {
  const dir = path.resolve(taskDir);
  const root = path.resolve(
    repoRoot ?? findRepoRoot(dir) ?? findRepoRoot(process.cwd()) ?? process.cwd(),
  );
  const realDir = safeRealpath(dir);
  const realRoot = safeRealpath(root);
  const problems = [];
  const add = (file, rule, msg, lineNo) =>
    problems.push(`${file}: [${rule}] ${msg}${lineNo ? ` (line ${lineNo})` : ''}`);

  // D7: unreadable task folder is an IO error, not a violation.
  try {
    readdirSync(dir);
  } catch (err) {
    throw new TaskIoError(`cannot read task directory ${taskDir}: ${err.code ?? err.message}`);
  }

  /**
   * D6/R11 path resolution: relative only; candidates are <taskDir>/<p> then <repoRoot>/<p>;
   * the real path must stay inside the repo root (or the task folder) and be a regular file.
   * Returns { kind: 'ok' | 'missing' | 'R11', reason? }.
   */
  const resolveEvidence = (token) => {
    const clean = token.replace(/#.*$/, '').replace(/:\d+(?:[-:]\d+)?$/, '');
    if (!clean) return { kind: 'missing' };
    if (path.isAbsolute(clean) || /^[A-Za-z]:[\\/]/.test(clean) || clean.startsWith('~')) {
      return { kind: 'R11', reason: 'is absolute; use a path relative to the task folder or repo root' };
    }
    const bases = [dir, root];
    const lexicallyInside = bases.some((b) => {
      const abs = path.resolve(b, clean);
      return isInside(abs, dir) || isInside(abs, root);
    });
    if (!lexicallyInside) return { kind: 'R11', reason: 'resolves outside the repo root' };
    let sawOutside = false;
    let sawNonFile = false;
    for (const base of bases) {
      const abs = path.resolve(base, clean);
      if (!existsSync(abs)) continue;
      const real = safeRealpath(abs);
      if (!isInside(real, realRoot) && !isInside(real, realDir)) {
        sawOutside = true;
        continue;
      }
      let st;
      try {
        st = statSync(real);
      } catch {
        continue;
      }
      if (!st.isFile()) {
        sawNonFile = true;
        continue;
      }
      return { kind: 'ok' };
    }
    if (sawOutside) return { kind: 'R11', reason: 'resolves outside the repo root' };
    if (sawNonFile) return { kind: 'R11', reason: 'is not a file' };
    return { kind: 'missing' };
  };

  /**
   * Checks evidence tokens; reports missing ones under `missingRule` and containment under R11.
   * Returns the number of valid (existing, contained) evidence files.
   */
  const checkPaths = (file, tokens, missingRule, label, lineNo) => {
    let valid = 0;
    for (const tok of tokens) {
      const r = resolveEvidence(tok);
      if (r.kind === 'ok') valid++;
      else if (r.kind === 'R11') add(file, 'R11', `${label} path \`${tok}\` ${r.reason}`, lineNo);
      else add(file, missingRule, `${label} path \`${tok}\` does not exist`, lineNo);
    }
    return valid;
  };

  // R1 required files
  const files = {};
  for (const f of REQUIRED_FILES) {
    const p = path.join(dir, f);
    let st;
    try {
      st = statSync(p);
    } catch (err) {
      if (err.code === 'ENOENT' || err.code === 'ENOTDIR') {
        add(f, 'R1', 'required file is missing');
        continue;
      }
      throw new TaskIoError(`cannot access ${path.join(taskDir, f)}: ${err.code ?? err.message}`);
    }
    if (!st.isFile()) {
      add(f, 'R1', 'required file is missing (path exists but is not a regular file)');
      continue;
    }
    let content;
    try {
      content = readFileSync(p, 'utf8');
    } catch (err) {
      throw new TaskIoError(`cannot read ${path.join(taskDir, f)}: ${err.code ?? err.message}`);
    }
    const scanned = scanNonLive(content);
    files[f] = toLines(scanned.lines);
    if (scanned.unterminated) {
      const u = scanned.unterminated;
      add(f, 'R1', `unterminated ${u.kind} (opened here, never closed before end of file)`, u.lineNo);
    }
  }

  // D14: the task's AC set = ids from "- **AC-n:**" items under "## Acceptance criteria…" in specification.md.
  let specAcs = null; // null = specification.md missing
  if (files['specification.md'] !== undefined) {
    specAcs = [];
    const lines = files['specification.md'];
    let inSection = false;
    for (const { text } of lines) {
      const h = /^(#{1,2})\s+(.+?)\s*#*\s*$/.exec(text);
      if (h) {
        inSection = h[1] === '##' && /^acceptance criteria\b/i.test(h[2].trim());
        continue;
      }
      if (!inSection) continue;
      const m = /^\s*[-*+]\s+\*\*\s*(AC-\d+)\s*:?\s*\*\*/.exec(text);
      if (m && !specAcs.includes(m[1])) specAcs.push(m[1]);
    }
  }

  // Returns the single section or null; reports missing (and D2 duplicates) under `rule`.
  const getSection = (f, title, rule) => {
    const sections = findSections(files[f], title);
    if (sections.length === 0) {
      add(f, rule, `section "## ${title}" not found`);
      return null;
    }
    if (sections.length > 1) {
      add(
        f,
        rule,
        `section "## ${title}" appears ${sections.length} times (lines ${sections
          .map((s) => s.headingLineNo)
          .join(', ')}); keep exactly one`,
      );
    }
    return sections[0];
  };

  // R2–R4 status.md
  const stageStatus = new Map();
  if (files['status.md'] !== undefined) {
    const table = findTable(files['status.md'], ['Stage', 'Status', 'Artifact']);
    if (!table) {
      add('status.md', 'R2', 'stage table with columns Stage | Status | Artifact not found');
    } else {
      for (const stray of table.strayLines) {
        add('status.md', 'R2', 'table rows must be contiguous: table row found after a break in the stage table', stray.lineNo);
      }
      const seen = [];
      for (const row of table.rows) {
        const stage = unwrap(cell(table, row, 'Stage'));
        const status = unwrap(cell(table, row, 'Status'));
        if (!STAGES.includes(stage)) {
          add('status.md', 'R2', `unknown stage "${stage}"`, row.lineNo);
          continue;
        }
        if (stageStatus.has(stage)) {
          add('status.md', 'R2', `stage ${stage} is listed more than once`, row.lineNo);
          continue;
        }
        if (!STAGE_STATUSES.includes(status)) {
          add(
            'status.md',
            'R2',
            `stage ${stage} has invalid status "${status}" (allowed: ${STAGE_STATUSES.join(', ')}${caseHint(status, STAGE_STATUSES)})`,
            row.lineNo,
          );
        }
        stageStatus.set(stage, status);
        seen.push({ stage, status, row });
      }
      for (const s of STAGES) {
        if (!stageStatus.has(s)) add('status.md', 'R2', `stage ${s} is missing`);
      }
      for (let i = 1; i < seen.length; i++) {
        if (STAGES.indexOf(seen[i].stage) < STAGES.indexOf(seen[i - 1].stage)) {
          add(
            'status.md',
            'R2',
            `stage ${seen[i].stage} is out of order (must come before ${seen[i - 1].stage})`,
            seen[i].row.lineNo,
          );
        }
      }
      for (const { stage, status, row } of seen) {
        if (status !== 'passed') continue;
        for (const prev of STAGES.slice(0, STAGES.indexOf(stage))) {
          const ps = stageStatus.get(prev);
          if (ps !== 'passed') {
            add('status.md', 'R3', `stage ${stage} is passed but earlier stage ${prev} is ${ps ?? 'missing'}`, row.lineNo);
          }
        }
        const tokens = backtickTokens(stripStrike(cell(table, row, 'Artifact'))).filter((t) => !/\s/.test(t));
        const valid = checkPaths('status.md', tokens, 'R4', `stage ${stage} artifact`, row.lineNo);
        if (valid === 0) {
          add('status.md', 'R4', `stage ${stage} is passed but Artifact has no existing file in backticks`, row.lineNo);
        }
      }
    }
  }

  // R5–R6 AC tables (D10: delivery-report.md too)
  const acStatuses = {};
  for (const f of ['acceptance.md', 'qa-results.md', 'delivery-report.md']) {
    if (files[f] === undefined) continue;
    const section = getSection(f, 'Acceptance criteria', 'R5');
    if (!section) continue;
    const table = findTable(section.lines, ['AC', 'Status', 'Evidence']);
    if (!table) {
      add(f, 'R5', 'table with columns AC | Status | Evidence not found under "## Acceptance criteria"');
      continue;
    }
    for (const stray of table.strayLines) {
      add(f, 'R5', 'table rows must be contiguous: table row found after a break in the AC table', stray.lineNo);
    }
    acStatuses[f] = [];
    for (const row of table.rows) {
      const acCell = cell(table, row, 'AC');
      const id = /\bAC-\d+\b/.exec(acCell)?.[0] ?? null;
      const ac = id ?? (acCell || '(empty AC)');
      const status = unwrap(cell(table, row, 'Status'));
      const evidence = stripStrike(cell(table, row, 'Evidence'));
      acStatuses[f].push({ ac, id, status });
      if (specAcs && (!id || !specAcs.includes(id))) {
        add(f, 'R5', `${ac} is not an AC defined in specification.md (expected one of: ${specAcs.join(', ') || 'none'})`, row.lineNo);
      }
      if (!CHECK_STATUSES.includes(status)) {
        add(
          f,
          'R5',
          `${ac} has invalid status "${status}" (allowed: ${CHECK_STATUSES.join(', ')}${caseHint(status, CHECK_STATUSES)})`,
          row.lineNo,
        );
      }
      const tokens = backtickTokens(evidence).filter(isPathLike);
      const valid = checkPaths(f, tokens, 'R6', `${ac} evidence`, row.lineNo);
      if (status === 'passed') {
        if (isPlaceholder(evidence)) {
          add(f, 'R5', `${ac} is passed but evidence is empty or a placeholder`, row.lineNo);
        } else if (valid === 0) {
          add(f, 'R5', `${ac} is passed but evidence has no existing file path in backticks`, row.lineNo);
        }
      }
    }
  }

  // R7 Verification
  for (const f of ['qa-results.md', 'delivery-report.md']) {
    if (files[f] === undefined) continue;
    const section = getSection(f, 'Verification', 'R7');
    if (!section) continue;
    let entries = 0;
    for (const { text, lineNo } of section.lines) {
      if (!/^[-*+]\s/.test(text)) continue; // D8: nested (indented) bullets are ignored
      entries++;
      const body = text.replace(/^[-*+]\s+/, '');
      // Evidence starts at the first " — " / " – " / " -- " / " - " separator.
      const sep = /\s(?:—|–|--?)(?:\s|$)/.exec(body);
      const head = sep ? body.slice(0, sep.index) : body;
      let evidence = sep ? body.slice(sep.index + sep[0].length).trim() : '';
      const colon = head.lastIndexOf(':');
      const check = colon === -1 ? '' : head.slice(0, colon).trim();
      const statusPart = colon === -1 ? '' : head.slice(colon + 1).trim();
      const sm = /^(\S+)(.*)$/.exec(statusPart);
      if (!check || !sm) {
        add(
          f,
          'R7',
          `top-level bullets under "## Verification" must be "- <check>: <status> — <evidence>" (nest notes with indentation): "${text.trim()}"`,
          lineNo,
        );
        continue;
      }
      const status = unwrap(sm[1]);
      if (sm[2].trim()) evidence = `${sm[2].trim()} ${evidence}`.trim();
      evidence = stripStrike(evidence).trim();
      if (!CHECK_STATUSES.includes(status)) {
        add(
          f,
          'R7',
          `check "${check}" has invalid status "${status}" (allowed: ${CHECK_STATUSES.join(', ')}${caseHint(status, CHECK_STATUSES)})`,
          lineNo,
        );
      }
      const tokens = backtickTokens(evidence).filter(isPathLike);
      const valid = checkPaths(f, tokens, 'R7', `check "${check}" evidence`, lineNo);
      if (status === 'passed') {
        if (isPlaceholder(evidence)) {
          add(f, 'R7', `check "${check}" is passed but has no evidence`, lineNo);
        } else if (valid === 0) {
          add(f, 'R7', `check "${check}" is passed but evidence has no existing file path in backticks`, lineNo);
        }
      }
    }
    if (entries === 0) add(f, 'R7', 'no "- <check>: <status>" entries under "## Verification"');
  }

  // R8 review verdict
  let verdict = null;
  if (files['review.md'] !== undefined) {
    const section = getSection('review.md', 'Verdict', 'R8');
    if (section) {
      const line = firstNonEmpty(section);
      const word = line ? leadingWord(line.text) : '';
      if (!VERDICTS.includes(word)) {
        add(
          'review.md',
          'R8',
          `verdict must start with one of ${VERDICTS.join(', ')} (lowercase), got "${line ? line.text.trim() : ''}"`,
          line?.lineNo,
        );
      } else {
        verdict = word;
      }
    }
  }

  // R9 final decision
  const decisions = {};
  for (const f of ['acceptance.md', 'delivery-report.md']) {
    if (files[f] === undefined) continue;
    const section = getSection(f, 'Final decision', 'R9');
    if (!section) continue;
    const line = firstNonEmpty(section);
    const word = line ? leadingWord(line.text) : '';
    if (!DECISIONS.includes(word)) {
      add(
        f,
        'R9',
        `final decision must start with one of ${DECISIONS.join(', ')} (lowercase), got "${line ? line.text.trim() : ''}"`,
        line?.lineNo,
      );
    } else {
      decisions[f] = word;
    }
  }

  // R10 accepted preconditions
  for (const f of ['acceptance.md', 'delivery-report.md']) {
    if (decisions[f] !== 'accepted') continue;
    // D14: the spec must define >= 1 AC, and each must be passed in all three tables.
    if (!specAcs) {
      add(f, 'R10', 'accepted but specification.md is missing, so the task has no AC set');
    } else if (specAcs.length === 0) {
      add(f, 'R10', 'accepted but specification.md defines no "- **AC-n:**" items under "## Acceptance criteria"');
    } else {
      for (const src of ['acceptance.md', 'qa-results.md', 'delivery-report.md']) {
        const acs = acStatuses[src];
        if (!acs) continue; // reported below
        for (const id of specAcs) {
          if (!acs.some((r) => r.id === id)) {
            add(f, 'R10', `accepted but ${id} (defined in specification.md) is missing from ${src}`);
          }
        }
      }
    }
    // R10 + D10/D12: every AC table must exist, list >= 1 AC, and have all AC passed.
    for (const src of ['acceptance.md', 'qa-results.md', 'delivery-report.md']) {
      const acs = acStatuses[src];
      if (!acs) {
        add(f, 'R10', `accepted but ${src} has no readable AC table`);
      } else if (acs.length === 0) {
        add(f, 'R10', `accepted but ${src} lists no AC`);
      } else {
        for (const { ac, status } of acs) {
          if (status !== 'passed') add(f, 'R10', `accepted but ${ac} in ${src} is ${status || '(empty)'}`);
        }
      }
    }
    if (verdict !== 'approved') {
      add(f, 'R10', `accepted but review.md verdict is ${verdict ?? 'missing/invalid'}, not approved`);
    }
    const fa = stageStatus.get('FINAL_ACCEPTANCE');
    if (fa !== 'passed') {
      add(f, 'R10', `accepted but FINAL_ACCEPTANCE in status.md is ${fa ?? 'missing'}, not passed`);
    }
  }

  return { problems };
}

// ---------------------------------------------------------------------------
// CLI

export function main(argv = process.argv.slice(2)) {
  if (argv.length === 0) {
    console.error('Usage: node scripts/check-task.mjs <taskDir> [<taskDir> ...]');
    return 2;
  }
  let usageError = false;
  for (const d of argv) {
    let ok = false;
    try {
      ok = statSync(d).isDirectory();
    } catch {
      ok = false;
    }
    if (!ok) {
      console.error(`check-task: task directory not found: ${d}`);
      usageError = true;
    }
  }
  if (usageError) return 2;

  let failed = false;
  for (const arg of argv) {
    let problems;
    try {
      ({ problems } = checkTask(arg));
    } catch (err) {
      if (err instanceof TaskIoError) {
        console.error(`check-task: ${err.message}`);
        return 2;
      }
      throw err;
    }
    const prefix = /[\\/]$/.test(arg) ? arg : `${arg}/`; // D11: arg echoed verbatim
    for (const p of problems) console.log(`${prefix}${p}`);
    if (problems.length === 0) {
      console.log(`OK ${arg}`);
    } else {
      failed = true;
      console.log(`FAIL ${arg} (${problems.length} problems)`);
    }
  }
  return failed ? 1 : 0;
}

function isRunDirectly() {
  if (!process.argv[1]) return false;
  try {
    const self = realpathSync(fileURLToPath(import.meta.url));
    const invoked = realpathSync(path.resolve(process.argv[1]));
    return pathToFileURL(self).href === pathToFileURL(invoked).href;
  } catch {
    return false;
  }
}

if (isRunDirectly()) {
  try {
    process.exitCode = main();
  } catch (err) {
    console.error(`check-task: unexpected error: ${err?.message ?? err}`);
    process.exitCode = 2;
  }
}
