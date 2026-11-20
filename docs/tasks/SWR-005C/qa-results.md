# QA results — SWR-005C

QA Lead (qa-lead subagent, 2026-11-20). I wrote `test-cases.md` (EARLY_QA_DESIGN) and wrote no product code or data in
this task. Working tree: `main` @ `c1ace26` + uncommitted SWR-005C files + uncommitted SWR-006 work (out of scope).
Only `qa-results.md` and `artifacts/logs/qa-*.log` were changed. No product file was edited, even temporarily.

## Logs

| Log | Content |
|---|---|
| `artifacts/logs/qa-verify.log` | full `pnpm verify` from the repo root (lint, typecheck, test, build, check:bundle, e2e) → `EXIT=0` |
| `artifacts/logs/qa-platform-rules-kb.log` | `pnpm --filter @bga/platform exec vitest run test/rules-kb --reporter=verbose` → 7 files, 135 tests passed, `EXIT=0` |
| `artifacts/logs/qa-rebellion-knowledge.log` | `pnpm --filter @bga/game-rebellion exec vitest run test/knowledge --reporter=verbose` → 8 files, 96 tests passed, `EXIT=0` |
| `artifacts/logs/qa-process.log` | git checks (PDF, `src/rules` + `src/scenario` diff, task paths, `package.json` diff, forbidden files, AI paths), greps of `rules-kb`, RR glossary vs `sourceSections`, `check-task`, `node --test scripts/` |
| `artifacts/logs/qa-sources.log` | AC-1: RR, FAQ, LTP and the mirror downloaded to a temp dir outside the repo: sha256, Last-Modified, page counts. Official LTP text compared page by page with the mirror. Downloads deleted |
| `artifacts/logs/qa-retest.log` | retest after the QA-2 fix: knowledge vitest 8 files / 96 passed, `prettier --check packages/games/rebellion` clean, `eslint packages/games/rebellion/test/knowledge --max-warnings=0` exit 0, manifest LTP values vs the QA download, `check-task` OK |
| `artifacts/logs/qa-manual.log` | TC-M-01 candidate list (verified entries not in the reviewer sample); every quote checked verbatim on its cited page; paraphrase check (longest word run shared with the cited pages); FAQ p.6–8 citations; `needs-review` list |

`pnpm verify` counts (`qa-verify.log`) compared with the INTEGRATION run (`integration-verify.log`): platform 230 = 230;
rebellion 606 ≥ 604 (+2 from the review fixes); forbidden-stars 5; web 598 = 598; api 604 + 1 skipped = same; e2e
136 passed = 136; `node --test scripts/` 449 pass. No suite lost tests. The `[Nest] ERROR` lines in the api part come from
the negative tests; the suite passed.

## Executed

Test names below are as they appear in the verbose logs. P = `artifacts/logs/qa-platform-rules-kb.log`,
K = `artifacts/logs/qa-rebellion-knowledge.log`.

| TC | Status | Command | Evidence |
|---|---|---|---|
| TC-S-01 | passed | knowledge vitest | K: `validate.test.ts` "describes RR, LTP and FAQ v2.1 with the official URLs, hashes, page counts and retrieval date". I also compared the 3 manifest URLs with `request.md` lines 16–18 by hand: identical |
| TC-S-02 | passed | knowledge vitest | K: "records the LTP mirror and why it was used" (QA-2 fixed: the manifest now records the official hash and keeps the mirror as provenance; retest `artifacts/logs/qa-retest.log`) |
| TC-S-03 | passed | knowledge vitest | K: "excludes the Rise of the Empire pages of the FAQ and ranks RR above LTP" (`excludedPages` [6,7,8], version "2.1 (May 2019)", date 2019-05-09) |
| TC-S-04 | passed | knowledge vitest | K: "is the base game only" |
| TC-S-05 | passed | knowledge vitest | K: same test as TC-S-03 (precedence FAQ 1 < RR 2 < LTP 3; FAQ has `kind: 'faq'`) |
| TC-S-06 | passed | curl + shasum (temp dir) | `artifacts/logs/qa-sources.log`: RR 200, sha256 `0b5af3a2…a35a` = manifest, 16 pages, Last-Modified 2016-03-22; FAQ 200, `0f6cdcbe…d82e` = manifest, 8 pages, 2019-05-09; mirror `e471220f…fe16` = manifest. Official LTP: **HTTP 200** (no 503 this time), sha256 `b26b9813…98fc` ≠ manifest, 20 pages, text identical to the mirror on all 20 pages → QA-2 (fixed; manifest now matches this download, `artifacts/logs/qa-retest.log`) |
| TC-S-07, TC-S-08 | passed | knowledge vitest | K: "rejects an entry of an excluded product or citing an excluded FAQ page (TC-S-07, TC-S-08)" |
| TC-F-01 | passed | platform vitest | P: `validate.test.ts` "the star-forge fixture is valid", "is deterministic and does not mutate the knowledge base" |
| TC-F-02 | passed | platform vitest | P: `search.test.ts` 6 question cases ("Who takes the first turn?" → `star-forge:turn.order` first, …, Russian "строительство", "очерёдность") |
| TC-F-03 | passed | platform vitest | P: `context.test.ts` (9 tests), `render.test.ts` (12 tests) on the fixture |
| TC-F-04 | passed | `grep -rni rebellion packages/platform/src/rules-kb` | `artifacts/logs/qa-process.log`: no match; also P: `boundaries.test.ts` "no game names, node:* or @bga/*" for each of the 10 files |
| TC-F-05 | passed | grep imports; `git diff c1ace26 -- packages/platform/package.json` | `artifacts/logs/qa-process.log`: imports are only `zod` and relative modules; `package.json` diff = only `exports["./rules-kb"]`. The root `packages/platform/src/index.ts` has a SWR-006 change (`./automation`), not SWR-005C. Typecheck of rebellion (which imports the subpath) passed in `qa-verify.log` |
| TC-F-06 | passed | manual read | `docs/game-rules/knowledge-base.md`: sections Manifest, Entry, Coverage and Discrepancies, Проверки, Как добавить новую игру (только данные) |
| TC-R-01 | passed | knowledge vitest | K: "has at least 80 entries, each with id, category, kind, status and a source page" (181 entries; implementation-notes also have a source, C-4 Q-3) |
| TC-R-02 | passed | knowledge vitest | K: "has zero issues with the repository io checks" (`SECTION_NOT_COVERED` is part of it) |
| TC-R-03 | passed | knowledge vitest | K: "lists every RR glossary topic, RR setup, the LTP round/command/refresh/base pages and the first game setup"; "skips the Team Game with a reason and never covers it" |
| TC-R-04 | passed | script: RR index vs `sourceSections` | `artifacts/logs/qa-process.log` addendum: 86 RR index topics, 88 RR sections, 0 unmatched. Coverage is page-level (review F-6, documented limitation) |
| TC-R-05 | passed | knowledge vitest | K: "records exceptions that point to existing entries (TC-R-05)" |
| TC-K-01..TC-K-05 | passed | knowledge vitest | K: "uses all four kinds"; "records the three base game errata as clarifications citing the FAQ and amending an RR rule (TC-K-02)"; "every clarification cites the FAQ and amends an existing entry"; "every interpretation has a rationale and a source; disputed ones are needs-review (TC-K-03)"; "every implementation-note references a discrepancy and an official page (TC-K-04)"; "marks fan-sourced data as needs-review (TC-K-05)" |
| TC-V-01 | passed | platform vitest | P: "the star-forge fixture is valid" |
| TC-V-02 | passed | platform vitest | P: `parse.test.ts` 7 tests "rejects … with SCHEMA_INVALID and a path to the field (TC-V-02)" |
| TC-V-03..TC-V-27 | passed | platform vitest | P: one or more tests per code, see the code → test table below |
| TC-V-28 | passed | platform vitest | P: `validate-io.test.ts` "without io the file checks are skipped, the rest still runs (TC-V-28)" |
| TC-V-29 | passed | platform vitest | P: "collects every issue in a deterministic order (TC-V-29)" |
| TC-V-30 | passed | platform vitest + grep of `issues.ts` | P: "every issue code has a negative test (TC-V-30)"; my independent mapping: 38 codes in `packages/platform/src/rules-kb/issues.ts`, each has ≥ 1 test (table below) |
| TC-V-31 | passed (analogue) | knowledge vitest | Not run as designed: it needs a temporary edit of `entries/*.json`, which is outside my owned files and would have disturbed the parallel `pnpm verify`. Analogue on a copy of the real data: K "reports a dangling related id with the entry path and code (scenario 4)" (`ENTRY_REF_UNKNOWN`, path `entries.0.related.0`); the message names the entry and value: P "messages name the offending entry and value (scenario 4)" |
| TC-C-01 | passed | knowledge vitest | K: "has zero issues with the repository io checks (files, symbols, test names)" |
| TC-C-02 | passed | knowledge vitest | K: "covers every rule, clarification and interpretation of the slice categories (TC-C-02, Q-8)" |
| TC-C-03 | passed | knowledge vitest | K: "is for the core-v1 engine, covers every rule entry and never an implementation-note"; "marks combat and missions as not-implemented with a discrepancy (TC-C-03)" |
| TC-C-04 | passed | knowledge vitest | K: "links activation to activation.ts and activate.test.ts (TC-C-04, scenario 1)" |
| TC-C-05 | passed | knowledge vitest | K: 9 "core-v1 audit mapping" tests R-3 … D-6, plus "every label R-3..R-10 and D-1..D-7 appears in a coverage note or a discrepancy". R-3 is `partial` (review F-2, mission turns missing), not `implemented` as written in my TC; accepted as the more precise value |
| TC-C-06 | passed | manual read + knowledge vitest | `docs/game-rules/rebellion/discrepancies.md` starts with "Вывод аудита…", "Ошибок реализации в рамках среза не найдено" and the list of deviations; K "the discrepancies document carries the audit verdict (AC-6)" |
| TC-C-07, TC-C-08 | passed | knowledge vitest | K: `discrepancies.test.ts` 15 item tests (combat … component limitations), "have sequential DISC-NNN ids and every field filled (TC-C-08)" |
| TC-C-09 | passed | git | `artifacts/logs/qa-process.log`: `git diff --stat c1ace26 -- …/src/rules …/src/scenario` empty; `git status` on the same paths empty |
| TC-C-10 | passed | git | `artifacts/logs/qa-process.log`: `pnpm-lock.yaml`, `pnpm-workspace.yaml` and `packages/games/rebellion/package.json` unchanged. `eslint.config.mjs`, `packages/platform/src/index.ts` and `apps/**` are changed by SWR-006 (none of them mentions `rules-kb`). See defect QA-1 for the two `docs/game-rules/rebellion-*.md` files |
| TC-Q-01..TC-Q-16 | passed | knowledge vitest | K: `search.test.ts`, 16 questions by name (from "Can units leave a system that contains my leader?" to "раскрытие базы") + "has at least 12 typical questions" |
| TC-Q-17..TC-Q-20 | passed | both vitest runs | K: "is deterministic across calls and instances (TC-Q-17)", "applies kind, category, status and limit filters (TC-Q-18)", "returns citations with source and page (TC-Q-19)", "returns nothing for empty or meaningless queries (TC-Q-20)"; P: same cases on the fixture |
| TC-A-01, TC-A-02 | passed | knowledge vitest | K: for rebels and empire: "fits in 6000 characters and contains the required rules", "includes the PASS interpretation and the reveal/victory rules without truncation; no missions", "formats one line per entry with id and page citations; only short text" |
| TC-A-03..TC-A-07 | passed | both vitest runs | K: "is deterministic and independent of the command order", "never exceeds maxChars and drops only whole lines", "marks needs-review entries as unverified", "keeps side-specific entries out of the other side context"; P: "never includes ai: none; include comes first (TC-A-07)", "keeps core entries when truncating", maxChars 0/-1/1.5/NaN → RangeError |
| TC-A-08 | passed | grep | `artifacts/logs/qa-process.log` addendum: no `rules-kb`/`buildRulesContext`/`knowledge/` reference in `apps/**` or `packages/games/rebellion/src/**`. The changes in `apps/api/src/ai/**` and `rebellion/src/ai/**` are SWR-006's. The integration plan is in `docs/architecture/rules-knowledge.md` §4 |
| TC-G-01 | passed | knowledge vitest | K: `generated-docs.test.ts` "rules-index.md / coverage-matrix.md / discrepancies.md is up to date" (byte-for-byte compare) |
| TC-G-02 | passed (code reading) | read `generated-docs.test.ts` | Mutation not run (same reason as TC-V-31). The test compares the file with `toBe(expected)` and the message "`<file>` is stale — run: UPDATE_KB_DOCS=1 …", so any changed line fails with that message |
| TC-G-03 | passed | `pnpm verify` | The test renders twice and compares; the generated md pass `prettier --check .` in `pnpm lint` (`qa-verify.log`: "All matched files use Prettier code style!"). A double `UPDATE_KB_DOCS=1` run was not repeated by QA (it writes into product files) |
| TC-P-01 | passed | git | `artifacts/logs/qa-process.log`: `git ls-files '*.pdf' '*.PDF'` empty, no `.pdf` in `git status`, no PDF under `knowledge/` or `docs/`; K "git tracks no PDF files" |
| TC-P-02, TC-P-03 | passed | both vitest runs | K: "keeps texts within 600 characters and quotes within 25 words and the per-source budget"; P: `QUOTE_BUDGET_EXCEEDED` (> 400 words) and the 400-word boundary. Actual quote words: RR 38, FAQ 20, LTP 0 (`qa-manual.log`) |
| TC-P-04 | passed | script + manual | `artifacts/logs/qa-manual.log`: longest word run shared between an entry text and its cited pages: 154 entries < 10 words, 19 have 10–14, 6 have 15–19, 2 have 20+. The 20+ ones are unit count lists (`units.roster` 29, `setup.standard-imperial-units` 25), which are facts, not prose. The 19 texts in the manual sample are paraphrases. Note: `setup.base-choice` shares 17 words with RR p.15 step 9 (a short procedure; observation only) |
| TC-M-01 | passed | manual against the extracted official texts | 19 verified entries, none of them in the reviewer sample; see "Manual sample" below |
| TC-M-02 | passed | script + read | `artifacts/logs/qa-manual.log`: 10 `needs-review` entries, each has a rationale that names the gap; 6 also link a DISC |
| TC-M-03 | passed | grep + script + vitest | `qa-process.log`: no "Rise of the Empire" / `rise-of-the-empire` in `entries/`; `qa-manual.log`: 0 FAQ citations of pages 6–8; K "never cites Rise of the Empire (TC-M-03)" |
| TC-D-01 | passed | manual read | `docs/architecture/rules-knowledge.md`: §2 functions with signatures, §3 `RulesKnowledgeService`, HTTP endpoints, §4 AI Commander integration, §6 staged plan for Rules Assistant |
| TC-D-02 | passed | read + platform vitest | the names in §2 match `packages/platform/src/rules-kb/index.ts`; P "exports the public API of plan-backend §2" |
| TC-D-03 | passed | `pnpm verify` | `artifacts/logs/qa-verify.log` `EXIT=0`; test counts ≥ baseline (see above) |
| TC-D-04 | passed | `node scripts/check-task.mjs docs/tasks/SWR-005C`; `node --test scripts/` | `artifacts/logs/qa-process.log`: "OK docs/tasks/SWR-005C" `EXIT=0`; 449 pass, 0 fail |
| TC-D-05 | passed | read `delivery-report.md` | Each Verification line has a status and a log path; numbers (platform 230, rebellion 606, web 598, api 604+1, e2e 136) match `artifacts/logs/qa-verify.log`; follow-up "audit SWR-006 AI behaviour … once merged" (A-6) present; QA-1/QA-2 recorded. Open item: the delivery-check.log it cites did not exist yet when read |

### Issue code → negative test (TC-V-30)

Source of the code list: `packages/platform/src/rules-kb/issues.ts` (38 codes). All tests are in P (`validate.test.ts`
unless marked).

| Code | Negative test(s) |
|---|---|
| SCHEMA_INVALID | `parse.test.ts`: rejects formatVersion 2 / unknown entry kind / page of a wrong type / misspelled field / bad sha256 / unknown coverage status / unknown discrepancy decision |
| SOURCE_DUPLICATE | duplicate source id |
| PRODUCT_CONFLICT | product included and excluded |
| CATEGORY_DUPLICATE | duplicate category id |
| CATEGORY_PARENT_UNKNOWN | unknown parent; parent is itself |
| ENTRY_ID_FORMAT | upper-case segment; single segment; empty segment; no game prefix |
| ENTRY_ID_PREFIX | foreign game prefix |
| ENTRY_ID_DUPLICATE | duplicate id (path → second) |
| ENTRY_REF_UNKNOWN | dangling related; dangling amends; dangling exception ruleId |
| ENTRY_PRODUCT_UNKNOWN | excluded product |
| ENTRY_CATEGORY_UNKNOWN | unknown category |
| ENTRY_TEXT_TOO_LONG | text of 601 characters (600 valid) |
| ENTRY_SOURCE_MISSING | no sources |
| ENTRY_RATIONALE_MISSING | interpretation without rationale; with blank rationale |
| ENTRY_CLARIFICATION_NOT_FAQ | clarification cites no faq source |
| ENTRY_DISCREPANCY_MISSING | implementation-note without discrepancy |
| ENTRY_DISCREPANCY_UNKNOWN | unknown entry discrepancy |
| SOURCE_UNKNOWN | unknown source |
| SOURCE_PAGE_OUT_OF_RANGE | page 0; page = pages + 1; exception source page; excluded page outside the source (page 1 and page = pages valid) |
| SOURCE_PAGE_EXCLUDED | excluded page; discrepancy ref to an excluded page |
| QUOTE_TOO_LONG | quote of 26 words (25 valid) |
| QUOTE_BUDGET_EXCEEDED | quotes of one source > 400 words (400 valid) |
| SECTION_NOT_COVERED | section without entry |
| SECTION_SKIP_REASON_MISSING | skip without reason; skip with blank reason |
| COVERAGE_RULE_UNKNOWN | coverage of an unknown entry |
| COVERAGE_RULE_DUPLICATE | rule covered twice |
| COVERAGE_RULE_MISSING | rule without coverage |
| COVERAGE_EVIDENCE_MISSING | implemented without implementation; implemented without tests; partial without implementation; deviation without tests |
| COVERAGE_DISCREPANCY_MISSING | not-implemented / partial / deviation without discrepancy |
| COVERAGE_DISCREPANCY_UNKNOWN | unknown coverage discrepancy |
| COVERAGE_NOTE_MISSING | not-applicable without note (with note valid) |
| DISCREPANCY_ID_FORMAT | bad discrepancy id |
| DISCREPANCY_ID_DUPLICATE | duplicate discrepancy id |
| DISCREPANCY_RULE_UNKNOWN | unknown discrepancy ruleId |
| DISCREPANCY_REF_UNKNOWN | string ref is not an entry id |
| FILE_MISSING | `validate-io.test.ts`: implementation file missing; test file missing |
| SYMBOL_NOT_FOUND | `validate-io.test.ts`: symbol absent; symbol only as a part of a longer identifier |
| TEST_NOT_FOUND | `validate-io.test.ts`: test name absent |

### Manual sample (TC-M-01)

Method: I picked the entries myself (no random seed). The pool was the verified entries that are **not** in the reviewer
sample of `review.md` (pool listed in `qa-manual.log`). I opened each cited page in the extracted official texts
(`sw03_rules_reference_web.txt`, `sw03_faq_v2_1.txt`, `ltp_mirror_1j1ju.txt` in the session scratchpad; the LTP mirror text
equals the official LTP text, see `qa-sources.log`). For each entry I checked that the text matches the page and that the
section name exists on that page. None of the sampled entries has a `quote`. All 5 quotes in the KB were checked by script:
verbatim on the cited page (`qa-manual.log`).

19 entries: 10 RR, 4 LTP (only 2 unreviewed entries cite LTP first, so I also checked the LTP citation of 2 entries that
cite LTP second), 5 FAQ. 11 of them are about activation, movement, reveal or victory.

| # | Entry | Pages checked | Verdict |
|---|---|---|---|
| 1 | `command.move.adjacency` | RR p.9 (Moving Units), RR p.12 (Regions), LTP p.7 | accurate |
| 2 | `command.move.immobile` | RR p.9, RR p.13 (Structures are immobile), RR p.6 (DS Under Construction is immobile) | accurate |
| 3 | `command.transport.capacity` | RR p.9, RR p.14 (one capacity per unit) | accurate |
| 4 | `base.reveal-procedure` | RR p.11, LTP p.12 | accurate |
| 5 | `base.voluntary-reveal` | RR p.11 ("optionally reveal his base at any time during one of his turns") | accurate |
| 6 | `base.after-reveal` | RR p.11 (no deploy/move to the space, placed in the system, resource icons unless Imperial unit/loyalty, cards apply to the system) | accurate |
| 7 | `victory.time-track` | RR p.14 (starts on "1", advances each round, same space as reputation → Rebels win), RR p.12 step 5 | accurate |
| 8 | `command.leader-anywhere-in-system` | RR p.6 | accurate |
| 9 | `refresh.advance-time` | RR p.12 step 5, LTP p.10 | accurate |
| 10 | `setup.base-choice` | RR p.15 step 9, LTP p.5 step 9 | accurate (wording close to RR, see TC-P-04) |
| 11 | `round.structure` (LTP first) | LTP p.6 "Playing the Game", RR p.13, LTP p.20 Round Summary | accurate |
| 12 | `setup.first-game-or-standard` (LTP first) | LTP p.5 step 8, LTP p.18 Advanced Setup, RR p.15 | accurate |
| 13 | `refresh.retrieve-leaders` (LTP second) | RR p.12 step 1 + "Start of Refresh Phase" objective, LTP p.10 step 1 | accurate |
| 14 | `base.move-from-space` (LTP second) | RR p.10, LTP p.12 "Moving To and From the Rebel Base" | accurate |
| 15 | `command.move.rapid-mobilization-locked` | FAQ p.4 ("Friendly leaders in the system prevent…") | accurate |
| 16 | `base.voluntary-reveal-combat` | FAQ p.5 | accurate |
| 17 | `victory.superlaser-hidden-base` | FAQ p.2 "Destroyed Systems", LTP p.11 | accurate |
| 18 | `deathstar.faq` | FAQ p.1 (DS cards vs Under Construction; deploy despite Rebel ground units; no reputation without Plans) | accurate |
| 19 | `command.move.base-space-leader-missions` | FAQ p.1 "Movement" (Lead the Strike Team / Plan the Assault) | accurate |

Result: 19 of 19 accurate; no factual or page error. Together with the reviewer sample (45 verified entries + 11 interpretations), at
least 64 of the 157 verified entries that are not implementation-notes have now been checked by hand.

## Acceptance criteria

| AC | Status | Evidence |
|---|---|---|
| AC-1 | passed | `artifacts/logs/qa-rebellion-knowledge.log` (manifest tests, TC-S-07/08), `artifacts/logs/qa-sources.log` (RR and FAQ sha256, pages and Last-Modified match the manifest; mirror sha256 matches), `artifacts/logs/qa-platform-rules-kb.log` (`ENTRY_PRODUCT_UNKNOWN`, `SOURCE_PAGE_*`). QA-2 fixed and retested: manifest LTP sha256 = official download, mirror kept (`artifacts/logs/qa-retest.log`) |
| AC-2 | passed | `artifacts/logs/qa-platform-rules-kb.log` (star-forge fixture: parse, validate, search, context, render; boundaries), `artifacts/logs/qa-process.log` (no "rebellion", only `zod` + relative imports), `docs/game-rules/knowledge-base.md` |
| AC-3 | passed | `artifacts/logs/qa-rebellion-knowledge.log` (content tests, 181 entries ≥ 80), `artifacts/logs/qa-process.log` (86/86 RR index topics in `sourceSections`), manual sample in this file |
| AC-4 | passed | `artifacts/logs/qa-rebellion-knowledge.log` (kinds tests), `artifacts/logs/qa-manual.log` (needs-review rationales), manual sample in this file |
| AC-5 | passed | `artifacts/logs/qa-rebellion-knowledge.log` (coverage tests, 0 issues with repository io, generated docs up to date) |
| AC-6 | passed | `artifacts/logs/qa-rebellion-knowledge.log` (audit mapping R-3..D-6, audit verdict), `docs/game-rules/rebellion/discrepancies.md` |
| AC-7 | passed | `artifacts/logs/qa-rebellion-knowledge.log` (15 discrepancy item tests, DISC fields), `artifacts/logs/qa-process.log` (no diff in rebellion src/rules and src/scenario) |
| AC-8 | passed | `artifacts/logs/qa-rebellion-knowledge.log` (16 questions in top-3, determinism, filters, citations, empty query), `artifacts/logs/qa-platform-rules-kb.log` |
| AC-9 | passed | `artifacts/logs/qa-rebellion-knowledge.log` (Command Phase context ≤ 6000 for both sides, required rules, determinism, maxChars limit), `artifacts/logs/qa-platform-rules-kb.log`, `artifacts/logs/qa-process.log` (no prompt integration) |
| AC-10 | passed | `artifacts/logs/qa-platform-rules-kb.log` (38/38 codes with negative tests), `artifacts/logs/qa-rebellion-knowledge.log` (Rebellion data: 0 issues), `artifacts/logs/qa-verify.log` (part of `pnpm test`). TC-V-31 / TC-G-02 checked by analogue / code reading, not by mutation |
| AC-11 | passed | `artifacts/logs/qa-process.log` (no PDF tracked or untracked), `artifacts/logs/qa-rebellion-knowledge.log` (text ≤ 600, quote ≤ 25 words, budget ≤ 400), `artifacts/logs/qa-manual.log` (quotes verbatim, paraphrase check) |
| AC-12 | passed | `docs/architecture/rules-knowledge.md` (§2–§6), `artifacts/logs/qa-platform-rules-kb.log` (export test) |
| AC-13 | passed | `artifacts/logs/qa-verify.log` (`pnpm verify` `EXIT=0`), `artifacts/logs/qa-retest.log` (`check-task` OK for the QA part), `delivery-report.md` (read by QA at DELIVERY: every Verification line has a status and points to a real log, numbers match the logs, nothing unrun is marked passed, SWR-006 audit follow-up present). Condition: its line "check-task: passed — delivery-check.log" cites a log the Analyst had not yet created when QA read it; it must exist and show OK |

## Verification

- lint: passed — `artifacts/logs/qa-verify.log` (`eslint . --max-warnings=0` + `prettier --check .`)
- typecheck: passed — `artifacts/logs/qa-verify.log` (`build:packages` + `pnpm -r typecheck` + e2e tsconfig)
- unit: passed — `artifacts/logs/qa-platform-rules-kb.log` (135 tests), `artifacts/logs/qa-verify.log` (platform 230, rebellion 606, forbidden-stars 5, web 598)
- integration: passed — `artifacts/logs/qa-rebellion-knowledge.log` (96 tests), `artifacts/logs/qa-verify.log` (api 604 + 1 skipped)
- build: passed — `artifacts/logs/qa-verify.log` (`pnpm -r build`, `check:bundle` OK)
- e2e: passed — `artifacts/logs/qa-verify.log` (Playwright 136 passed; no UI in this task, regression only)
- process: passed — `artifacts/logs/qa-process.log` (`check-task` OK, `node --test scripts/` 449 pass, no PDF, no diff in rebellion src/rules and src/scenario)
- sources: passed — `artifacts/logs/qa-sources.log` (RR, FAQ, official LTP and mirror downloaded; sha256 values), `artifacts/logs/qa-retest.log` (manifest LTP sha256 `b26b9813…98fc`, date 2016-03-22, 20 pages = QA download; mirror sha256 kept)
- manual review: passed — `artifacts/logs/qa-manual.log` (19-entry sample in this file, quotes, paraphrase check)
- retest (QA-2 fix): passed — `artifacts/logs/qa-retest.log` (knowledge vitest 96 passed, prettier clean, eslint exit 0, check-task OK)
- delivery report: passed — `delivery-report.md` (checked by QA at DELIVERY; condition: its cited delivery-check.log must be created by the Analyst)

## Defects

| # | Severity | Steps | Expected | Actual | Status |
|---|---|---|---|---|---|
| QA-1 | minor | `git diff --stat -- docs/game-rules/rebellion-core-v1.md docs/game-rules/rebellion-reference.md` (`artifacts/logs/qa-process.log`) | `implementation-plan.md` "Ownership" forbids everyone in SWR-005C from changing `docs/game-rules/rebellion-*.md`. If a change is needed, it is approved and recorded (implementation log / delivery report) | Both files have a new 2-line SWR-005C banner ("проверяемая база знаний правил — … При расхождении с этим файлом приоритет у базы знаний"). It is not in the implementation log or any task file. The content is correct and its links resolve, so this is a process / ownership gap, not a content error | closed (accepted) — Analyst: the banners were an Analyst edit; they will be listed in delivery-report "Files changed" |
| QA-2 | minor | Download the official LTP URL from `manifest.json` (`artifacts/logs/qa-sources.log`, 2026-11-20 10:17 UTC) | The manifest describes the official file. `mirror.reason` says the official URL gave HTTP 503 | The official LTP URL now gives HTTP 200: 20 pages, Last-Modified 2016-03-22, sha256 `b26b98139d694e9f42cb36060ec82fdc3000ab753d29809be03b7bc44d8598fc`. The manifest `sha256` holds the mirror's hash (`e471220f…fe16`). Its text is identical to the mirror on all 20 pages, so **no entry or page reference is affected**. The 503 note was true when the data was retrieved | closed (fixed, retested) — W2 set the manifest LTP `sha256` to the official hash, `date` 2016-03-22, kept the mirror (reason updated), updated `audit-summary.md` and the generated `discrepancies.md`; `validate.test.ts:87` asserts the hash. Retest: values match the QA download; knowledge tests, prettier, eslint pass (`artifacts/logs/qa-retest.log`) |

Observations (not defects): `setup.base-choice` text shares a 17-word run with RR p.15 step 9 (procedure wording; below the
25-word quote limit). Review F-7 (open decision for the SWR-006 integration) and F-9 (`limit: NaN`) are still open as the
reviewer recorded them; QA did not re-test them.
