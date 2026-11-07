# Review — SWR-000

Reviewer: reviewer (independent subagent #3, S3; wrote none of the reviewed code)  ·  Author(s) of reviewed code: backend-worker (`scripts/check-task.mjs`), qa-lead (`scripts/check-task.test.mjs`, `scripts/fixtures/**`)

Scope: `scripts/check-task.mjs` and the tests/fixtures, checked against `specification.md` R1–R10 (with Clarifications) and the frozen contract in `implementation-plan.md`.

What I ran (Node v20.19.5; probe copies of `scripts/fixtures/valid-task` in a scratch dir **outside the repo** whose path contains a space: `/private/tmp/claude-501/.../scratchpad/rev/my repo/<case>`, with `AGENTS.md` in `my repo/`):
- `node --test scripts/` gives 111 pass, 0 fail.
- `node scripts/check-task.mjs docs/tasks/SWR-000` gives `OK`, exit 0. `node scripts/check-task.mjs docs/tasks/_template` gives `OK`, exit 0.
- Probe cases P1–P20 are listed in the findings below. The unmodified copy under a path with a space gives `OK`, exit 0, so path quoting is fine. With CRLF line endings everywhere the clean copy gives `OK` and a failed AC still gives [R10], so CRLF is fine. Empty files give 8 clean problems and do not crash. A missing dir gives exit 2. `:12` / `#L3` suffixes are stripped correctly. R6 fires on non-`passed` rows, as the analyst decided. An empty `## Verification` gives [R7]. A `<!-- -->` line placed first under `## Verdict` gives [R8] and [R10] (fail-safe).

## Findings
| # | Severity | File:line | Finding | Recommendation |
|---|---|---|---|---|
| 1 | major | `scripts/check-task.mjs:52-70`, `:91-106` | **False negative: fenced code and HTML comments are parsed as live markdown.** `findSection`/`findTable` take the *first* match anywhere in the file. P2: `acceptance.md` holds a ```` ``` ```` "format reminder" with `## Acceptance criteria` / `AC-1 passed` placed before the real section, the real AC-2 is `failed`, and the decision is `accepted`. Result: `OK fence`, exit 0. P14: `status.md` holds an all-`passed` example table inside `<!-- ... -->` before the real table, where `FINAL_ACCEPTANCE`=`pending`. Result: `OK stfence`, exit 0, so the R10 gate is bypassed. | Before parsing, strip fenced blocks (```` ``` ````/`~~~`) and `<!-- -->` comments, keeping line numbers. Add regression tests for both cases. |
| 2 | major | `scripts/check-task.mjs:52-62` | **False negative: duplicate sections are silently ignored, and only the first one is checked.** P3: `acceptance.md` has two `## Acceptance criteria` sections. The first lists only AC-1 `passed`, the second has AC-2 `failed`, and the decision is `accepted`. Result: `OK dup`, exit 0. Second case (dupfd): `## Final decision` appears twice, first `blocked` then `accepted`, with AC-2 `failed`. Result: `OK dupfd`, so a reader who sees the last `accepted` gets no warning. | Report a duplicated checked heading (`Acceptance criteria`, `Verification`, `Verdict`, `Final decision`) as a violation under that section's rule id. |
| 3 | major | `scripts/check-task.mjs:100` | **False negative: table rows after a blank line or any non-`\|` line are dropped silently.** P4: a blank line inserted before `\| AC-2 \| failed \| ... \|` gives `OK split`, exit 0, even though `accepted` is set. GitHub renders this as two tables, and a human sees AC-2 failed. | In AC sections, treat every `\|`-row in the section (excluding header/separator rows) as an AC row. Or report a second table or stray `\|`-row as [R5]. Same idea for `status.md` (there a dropped row already surfaces as a missing stage under [R2], which is fail-safe). |
| 4 | major | `scripts/check-task.mjs:298`, `:125-127` | **False negative: a struck-through verdict counts.** `normalizeWord` strips leading `~`, so `~~approved~~ changes_requested` reads as `approved`. P5 gives `OK strike`, exit 0, while the human-visible verdict is `changes_requested`. The same applies to `## Final decision` (`~~blocked~~ accepted` reads as `blocked`, which suppresses R10). | Do not strip `~` (or reject a line starting with `~~`). Only `*`, `_` and backticks are reasonable wrappers. |
| 5 | major (spec gap, for Analyst) | `specification.md` R5/R7; `scripts/check-task.mjs:133-136` | **The honesty gate accepts free text as evidence.** P7: `\| AC-1 \| passed \| all good, trust me \|`, `- unit: passed — yes`, `- cli: passed — \`none\`` and `\| AC-2 \| passed \| **TBD** \|` all give `OK free`, exit 0. This conforms to R5 as written, but it contradicts the hard rule in AGENTS.md: "Никогда не писать `passed` без ссылки на реальный лог/тест/файл". | Analyst decision: require at least one existing path-like backtick token for every `passed` AC/Verification row. Minimum code fix: normalize markdown emphasis and trailing punctuation in `isPlaceholder` (`**TBD**`, `_TODO_`, `TBD.`) and consider adding `none`/`нет`. |
| 6 | minor | `scripts/check-task.mjs:163-168` | Evidence or artifact paths may be absolute, escape the repo with `..`, or be directories. P6: evidence `` `/etc/hosts` ``, `` `/` ``, `` `artifacts/` ``, `` `/dev/null` `` passes R6/R7. P13: `` `../../../../../../../../../../../../etc/hosts` `` gives `OK`. P18: a `passed` stage with artifact `` `/` `` gives `OK`. Absolute paths also differ between machines and CI. | Reject absolute paths. Resolve the path and require it to stay inside `repoRoot`. Require a regular file for evidence (R6/R7), or at least a non-empty directory. |
| 7 | minor | `scripts/check-task.mjs:174`, `:400` | Crash path: when a required file is unreadable (P10: `chmod 000 status.md`), Node throws an uncaught `EACCES` with a stack trace and exits **1**. That exit code cannot be told apart from "violations found" (spec: 1 = problems, 2 = usage/IO error). A directory named `status.md` (P11) is reported as "required file is missing", which is misleading but acceptable. | Wrap reads in try/catch. Report `[R1] cannot read file: <code>`, or exit 2 with a clear message. Never exit 1 on a crash. |
| 8 | minor | `scripts/check-task.mjs:287-293`, `:290` | False positives that will annoy humans under `## Verification`. P12: a nested sub-bullet `  - reason: no Playwright yet` gives "invalid status \"no\"", and a free-text bullet note `- logs are in artifacts` gives "malformed". P20: a check name with a colon, `- unit (node:test): passed — ...`, gives `check "unit (node" has invalid status "test"`. | Only consider top-level bullets (no leading indent). Split check and status on the *last* `: <status>` match, or on `:\s*(passed\|failed\|not_run\|blocked)\b`. Keep non-matching top-level bullets as violations if desired, but say so in the error text. |
| 9 | minor (spec gap, for Analyst) | `scripts/check-task.mjs:234-239`; test TC-70 | A `passed` stage with an empty `Artifact` cell is clean. TC-70 asserts this, and the template's IMPLEMENTATION/INTEGRATION rows have no artifact. Combined with finding 6, R4 is easy to satisfy vacuously. | Analyst: decide whether `passed` requires at least one artifact token. If yes, update TC-70. |
| 10 | minor (spec gap, for Analyst) | `scripts/check-task.mjs:244-247`, `:359-379` | The AC table in `delivery-report.md` (present in both template and fixture) is not checked at all, and an `accepted` decision ignores `failed` ACs in `qa-results.md`. Both conform to R5/R10 as written, but `\| AC-1 \| passed \| TBD \|` in the delivery report goes unnoticed. | Extend R5/R6 to `delivery-report.md`'s AC table, or remove that table from the template. |
| 11 | minor | `scripts/check-task.test.mjs:380-447`, `:609-657`, `:602` | **Test gaps: these tests would still pass with a broken implementation.** (a) TC-83…88 pass `file=null` for R10, so the Clarification "R10 is reported with the prefix of the file where `accepted` stands" is untested. (b) TC-31/32/38 accept any `[Rn]`, but the Clarifications now fix them to R5/R7. (c) R8's trailing explanation (`approved — no blockers`) is untested; TC-82 covers only blank lines. (d) Untested: R6 on non-`passed` rows, `:line`/`#anchor` stripping, an empty `## Verification`, an unknown stage name, CRLF input, a taskDir path with spaces, and a relative taskDir label in CLI output. (e) Findings 1–4 have no regression tests. `test-cases.md` §open questions 1, 3, 4 and 6 are stale after the Clarifications. | Tighten the assertions to the clarified rule ids and file prefixes. Add the missing cases, plus negative tests for findings 1–4 once they are fixed. Update the open-questions list in `test-cases.md`. |
| 12 | nit | `scripts/check-task.mjs:399` | The CLI label strips trailing slashes. P16: arg `lab/` prints `lab/request.md: ...` and `FAIL lab`. The spec says lines start with `<taskDir>` "exactly as passed". This is harmless and arguably nicer, but it deviates from the spec. | Either keep the arg verbatim (and avoid `//` when joining) or record the normalization in the spec. |
| 13 | nit | `scripts/check-task.mjs:188`, `:261`, `:297`, `:125-127` | Case handling is inconsistent. AC, Verification and stage statuses are case-sensitive (`Passed` gives [R7], see P20), while verdict and decision are case-insensitive (`Approved` is OK). Separately, `approved-but-…` normalizes to `approved`, which is allowed because R8 permits trailing text. | Pick one policy, preferably case-sensitive everywhere with a hint in the message, and document it in workflow.md §5. |
| 14 | nit | `scripts/check-task.mjs:157` | The repo-root fallback also tries the nearest `AGENTS.md` ancestor of the cwd before falling back to the cwd itself. That step is not in the spec. It is harmless (P19, no `AGENTS.md` ancestor, gives `OK`). | Mention it in the spec Interface, or drop it. |

Positive notes: the contract matches. `checkTask` returns `{ problems }`, every problem is `<file>: [Rn] ...`, importing the module does not run the CLI (TC-59), and exit codes 0/1/2 behave as specified. The parsing is fail-safe for heading-level and casing variants, HTML comments placed as the first line, empty files and missing tables. Line numbers in messages are accurate, which helps humans.

Round-1 verdict (history): changes_requested. Findings 1–4 were code-level major false negatives, and finding 5 needed an Analyst decision.

## Round 2 findings

Re-review of the rework: `scripts/check-task.mjs` rewritten per D1–D13, tests extended to 196, integration log `artifacts/logs/integration-r2.log`. Same reviewer, still not an author.

What I ran (Node v20.19.5):
- `node --test scripts/` gives 196 pass, 0 fail.
- `node scripts/check-task.mjs docs/tasks/SWR-000 docs/tasks/_template` gives `OK` for both, exit 0.
- I re-ran probes P1–P20 on fresh copies of `scripts/fixtures/valid-task` in the same scratch dir outside the repo (`.../scratchpad/rev/my repo/`, path with a space).
- Mutation check: I copied the repo to `.../scratchpad/rev/mut repo/`, reverted each fix in turn, and ran `node --test scripts/` (results below).

**Round-1 findings: re-check results**
- f1: closed. P2 (fenced decoy AC) and P14 (status table inside `<!-- -->`) now give [R10], exit 1.
- f2: closed. P3 gives `[R5] section "## Acceptance criteria" appears 2 times`. dupfd gives the [R9] duplicate.
- f3: closed. P4 gives `[R5] table rows must be contiguous`.
- f4: closed. P5 `~~approved~~ changes_requested` gives [R10] "verdict is changes_requested".
- f5: closed by D5. P7 free text gives `[R5]/[R7] ... no existing file path`, and `**TBD**` is reported as a placeholder.
- f6: closed. P6, P13 and P18 give [R11] (absolute / outside repo / not a file) plus [R5]/[R4].
- f7: closed. P10 `chmod 000 status.md` gives `check-task: cannot read unread/status.md: EACCES`, exit 2, no stack trace.
- f8: closed. P12: nested bullets are ignored, and a top-level free-text bullet is still [R7] per D8. P20: `unit (node:test)` parses.
- f9: closed by D9.
- f10: closed by D10/D12.
- f12: closed. `lab/` is echoed verbatim.
- f13: closed. Statuses are lowercase-only, with a hint in the message.
- f14: kept by decision.
- Also confirmed: CRLF, empty files, the `:12`/`#L3` suffix, and an empty Verification section all behave correctly. A folder without an `AGENTS.md` ancestor gives `OK`.

**Mutation check (does the suite catch the old bugs?)** For each fix reverted, the number of failing tests:

| Fix reverted | Failing tests |
|---|---|
| strip fences/comments (f1) | 4 |
| duplicate-section check (f2) | 5 |
| stray rows (f3) | 3 |
| old tilde-only strike handling (f4) | 3 |
| R5 min-one-path (D5) | 6 |
| R7 min-one-path (D5) | 8 |
| all containment checks (f6) | 3 |
| directories accepted (f6) | 2 |
| R10 reading only acceptance.md (D10/D12) | 9 |
| R10 reported under `status.md` | 5 |
| nested bullets counted again (D8) | 1 |
| empty Artifact accepted (D9) | 1 |

Two mutants survive with 0 failing tests:
- Removing only the lexical containment check. This is redundant with the realpath check, so it is fine.
- Removing the absolute-path rejection. See R2-4.

| # | Severity | File:line | Finding | Recommendation |
|---|---|---|---|---|
| R2-1 | major (spec gap, for Analyst) | `scripts/check-task.mjs:558-581`; `specification.md` R10/D12 | **A dishonest `accepted` still slips through by dropping an AC.** Probe N3: the AC-2 row is deleted from all three AC tables (acceptance, qa-results, delivery-report). `specification.md` still defines AC-1 and AC-2. Result: `OK n3`, exit 0. Every remaining check is satisfied by a strict subset of the ACs. This is not on the "accepted as known limitations" list, and it is the cheapest way to hide a failing AC ("out of scope"). | Analyst: extend R10 so that `accepted` requires every `AC-\d+` id defined under the specification's `## Acceptance criteria` to appear as `passed` in `acceptance.md`, and ideally in `qa-results.md` too. Report missing ids as [R10]. Add a negative test. |
| R2-2 | minor | `scripts/check-task.mjs:72-108` | `stripNonLive` hides content that a human still sees, which re-opens the f1 class in the opposite direction. N1b: a line starting with `` ```node --test``` was run `` is inline code per CommonMark/GFM (a backtick fence's info string cannot contain a backtick), but the checker treats it as an unclosed fence and blanks the rest of the file. N2b: an HTML-comment opener (`<`, `!`, `-`, `-`) written inside inline code opens a "comment" to EOF. Dogfood: the first draft of this very row quoted that opener in backticks, and `check-task` then reported `review.md: [R8] section "## Verdict" not found` for SWR-000, because everything below it, including the Verdict, was blanked. In both probes a human-visible second `## Acceptance criteria` with `AC-3 failed` after that line gives `OK`, exit 0. The control without the hiding line gives the [R5] duplicate. Exploiting it requires an odd line, so it is not blocking. | Do not open a backtick fence when the rest of the line contains a backtick. Ignore a comment opener inside inline code spans, or only honour it at the start of a line. Report a fence or comment still open at EOF as a violation. Add tests for both cases. |
| R2-3 | minor | `scripts/check-task.mjs:456`, `:505` | Struck-through evidence still counts. N5: `\| AC-1 \| passed \| ~~\`artifacts/logs/unit.log\`~~ not re-run \|` gives `OK`. This is inconsistent with D4, which removes struck text from verdicts and decisions. | Remove `~~…~~` from evidence before extracting tokens. |
| R2-4 | minor (test gap) | `scripts/check-task.test.mjs` TC-120…123 | No test uses an absolute path that points *inside* the repo, so the D6 "relative only" rule is untested. The mutant that drops the `path.isAbsolute` rejection still passes 196/196, because every existing test's absolute path is also outside the repo and is caught by containment. | Add a test where evidence is the absolute path of an existing file inside `repoRoot`, expecting [R11]. |
| R2-5 | nit | `scripts/check-task.mjs:267-304` | N4: evidence may be any existing file, e.g. `` `request.md` `` or `` `AGENTS.md` ``, and gives `OK`. This follows from the spec assumption "existence only". | Possible follow-up: disallow the required task docs as AC/Verification evidence, or require evidence under `artifacts/` or a test file. |
| R2-6 | nit | `scripts/check-task.mjs:134-136` | A 4-space-indented (code-block) decoy table before the real one is fail-safe, but noisy. N6 gives 13× `[R2] table rows must be contiguous`, and N7 gives 4× [R5]. The messages point at the real rows, not at the decoy. | Treat lines indented ≥4 spaces outside lists as code (skip them), as CommonMark does. |

Round-2 verdict (history): changes_requested. All round-1 findings were fixed and the suite caught every reverted fix except one minor gap (R2-4). One major item remains: R2-1, where an `accepted` task can omit a failing AC from all tables and still pass. It needs an Analyst decision. If the Analyst extends R10 and it is implemented, or explicitly records R2-1 as an accepted known limitation, this review can be approved, with R2-2…R2-6 deferred to a follow-up.

## Round 3 findings

Re-review of cycle-2 rework (cycle 3/3): D14 derives the AC set from the spec for R10/R5, D15 adds `scanNonLive` (fence and inline-code rules, unterminated block/comment reported as [R1]), D16 ignores struck-through evidence, and an R2-4 test was added. Tests TC-151…168, 225 in total. Same reviewer, not an author.

What I ran (Node v20.19.5):
- `node --test scripts/` gives 225 pass, 0 fail.
- `node scripts/check-task.mjs docs/tasks/SWR-000 docs/tasks/_template` gives `OK` for both, exit 0.
- Probes run on the existing copies in `.../scratchpad/rev/my repo/`.
- Mutation check on a fresh copy in `.../scratchpad/rev/mut repo/`.

**Round-2 findings, re-checked**
- R2-1: closed. N3 (AC-2 dropped from all three tables) gives 6× `[R10] accepted but AC-2 (defined in specification.md) is missing from …`, FAIL.
- R2-2: closed.
  - N1b (a line starting with ```` ```node --test``` ````) and N2b (comment opener inside inline code) now leave the following content live. Both give `[R5] section "## Acceptance criteria" appears 2 times`, which matches the control n0.
  - An unterminated fence gives `[R1] unterminated code block` (probe uf).
- R2-3: closed. N5 (struck-through evidence) gives `[R5] AC-1 is passed but evidence has no existing file path`.
- R2-4: closed. The absolute-path mutant is now killed.
- Round-1 probes still FAIL as expected: fence, dup, split, strike, stfence, free, abs.
- R2-5 (N4) and R2-6 (N6) are unchanged, as expected, because the Analyst moved them to the follow-up list.

**Mutation check on the new branches.** Each mutant reverts one new fix; failing tests out of 225:

| Mutant | Failing tests |
|---|---|
| D14: spec-AC presence check removed | 5 |
| D14: empty spec AC set allowed | 2 |
| D14: AC not in spec allowed | 3 |
| D14: presence checked only in acceptance.md | 2 |
| D15: backtick-in-rest rule removed | 1 |
| D15: inline-code skip removed | 2 |
| D15: unterminated report removed | 6 |
| D15: unterminated comment not tracked | 2 |
| D16: strike not stripped | 5 |
| R2-4: absolute rejection removed | 2 |

No mutant survives. The pristine copy gives 0 failures.

**New slip-through search.** I probed spec-format variants of the AC-2 definition, each with AC-2 also dropped from all three tables:
- `- **AC-2** — …` gives FAIL [R10] (caught).
- `- AC-2: …`, `1. **AC-2:** …`, a non-ASCII hyphen `AC‑2`, and a spec table row `| AC-2 | … |` give `OK`, exit 0.
- Control: with the spec line `- AC-2: …` and the tables kept honest, the result is 3× `[R5] AC-2 is not an AC defined in specification.md`.

So a malformed spec is noisy for an honest task, but it hides a dropped AC from a dishonest one. This is not a real slip-through of a correctly written spec: every SWR spec and the template use `- **AC-n:**`, and the spec is frozen at ANALYSIS, before workers act. It therefore goes to the follow-up list (R3-1).

| # | Severity | File:line | Finding | Recommendation |
|---|---|---|---|---|
| R3-1 | minor (follow-up) | `scripts/check-task.mjs:386-401` | An AC written in the spec in a non-canonical form (`- AC-2:`, `1. **AC-2:**`, a table row, a non-ASCII hyphen) is silently left out of the D14 AC set. A task can then drop that AC from every table and still get `OK`. An honest task gets confusing [R5] "not defined" errors instead. | Under the spec's `## Acceptance criteria`, report any `AC-\d+` mention (with an ASCII or Unicode hyphen) that does not match the canonical `- **AC-n:**` form, e.g. as [R10]/[R5] "unrecognized AC definition". Or accept the common list and table forms. |
| R3-2 | nit (follow-up) | `scripts/check-task.mjs:83-88` | `~~~ example ~~~` is a tilde fence in CommonMark, because a tilde info string may contain tildes, but the checker treats it as live text. In probe tf this was fail-safe: the later closing `~~~` was read as an opener and gave `[R1] unterminated code block`. The error message is confusing, though. | Apply the "rest of line contains the marker" rule only to backtick fences. |
| R3-3 | nit (follow-up) | `scripts/check-task.mjs:624-640` | A single missing AC is reported 6 times (2 decision files × 3 tables), for example in N3. | Report each missing AC once, or once per table. |

## Verdict
approved — every blocking and major finding from rounds 1–2 is fixed and covered by tests that fail when the fix is reverted (mutation check above). No new slip-through of a dishonest `accepted` was found against a correctly written spec. R2-5, R2-6 and R3-1…R3-3 go to the follow-up task.
