# Implementation plan — SWR-005C

Детальный план и публичный API библиотеки: [`plan-backend.md`](plan-backend.md); тест-дизайн — [`test-cases.md`](test-cases.md).
Приоритет при расхождении: `specification.md` (Contract C-1..C-4) → этот файл → `plan-backend.md`.
Задача — данные + библиотека + документы: без API, БД, UI, новых пакетов и зависимостей.

## Roles involved
| Role | Executor | Why |
|---|---|---|
| analyst / orchestrator | main session | spec, ответы на Q-BE, dispatch, BV, приёмка, delivery-report |
| backend-lead | subagent | план, интеграция |
| qa-lead | subagent | test-cases, QA execution |
| backend-worker W1 | subagent | библиотека `@bga/platform/rules-kb` + тесты формата |
| backend-worker W2 | subagent | данные Rebellion, тесты данных, документы, аудит/расхождения |
| reviewer | subagent | контракт, честность источников, отсутствие полных текстов, границы пакетов |

## Ownership (одно рабочее дерево; файлы зон не пересекаются)
| Зона | Владелец | Файлы |
|---|---|---|
| Библиотека | W1 | `packages/platform/src/rules-kb/**`, `packages/platform/test/rules-kb/**`, `packages/platform/package.json` — **только** добавление `exports["./rules-kb"]` |
| Данные и документы | W2 | `packages/games/rebellion/knowledge/**`, `packages/games/rebellion/test/knowledge/**`, `docs/game-rules/rebellion/**`, `docs/game-rules/knowledge-base.md`, `docs/architecture/rules-knowledge.md` |
| Интеграция | backend-lead | этот файл (Implementation log), `artifacts/logs/integration.log` |

**Запрещено всем** (SWR-006/SWR-007 в полёте): `packages/platform/src/index.ts`, `eslint.config.mjs`,
`packages/games/rebellion/src/**` (в т.ч. `src/rules`, `src/scenario` — AC-7), `packages/games/rebellion/package.json`,
`apps/**`, `pnpm-workspace.yaml`, `pnpm-lock.yaml`, любые `dependencies`/`devDependencies`, `docs/game-rules/rebellion-*.md`.

## Order
```text
Фаза 0: backend-lead (этот план) ‖ qa-lead (test-cases.md)
Фаза 1: W1 (библиотека + тесты платформы) ‖ W2 (JSON-данные, docs/*.md, тесты данных — пишутся по API из plan-backend §2, НЕ запускаются)
Фаза 2: W2 после сдачи W1 — запуск тестов данных, правка данных до 0 issues, UPDATE_KB_DOCS=1 → генерация md, prettier для JSON
         (несоответствие API → стоп, отчёт лиду; W2 не правит platform, W1 не правит данные)
INTEGRATION: backend-lead — команды §Verification, проверка git diff на запрещённые файлы; REVIEW; BV; QA_EXECUTION; ACCEPTANCE; DELIVERY
```

## Verification (реальный результат — в Implementation log; не запускалось → `not_run`)
| Зона | Команды |
|---|---|
| W1 | `pnpm --filter @bga/platform test`; `pnpm --filter @bga/platform typecheck`; `pnpm --filter @bga/platform lint`; `pnpm build:packages` + `node -e "console.log(Object.keys(require('@bga/platform/rules-kb')))"` из `packages/games/rebellion` |
| W2 | `pnpm --filter @bga/game-rebellion exec vitest run test/knowledge`; `pnpm --filter @bga/game-rebellion typecheck`; `pnpm exec prettier --check packages/games/rebellion/knowledge`; `git ls-files '*.pdf'` пусто |
| Lead | `pnpm lint`; `pnpm typecheck`; `pnpm test`; `pnpm build`; `git diff --stat c1ace26 -- packages/games/rebellion/src/rules packages/games/rebellion/src/scenario` пусто (C-4 Q-7); `pnpm-lock.yaml`, `pnpm-workspace.yaml` не изменены; SWR-005C не трогала `apps/**`, `eslint.config.mjs`, `packages/platform/src/index.ts`, остальной `rebellion/src` (сверка списка изменённых файлов воркеров); `node scripts/check-task.mjs docs/tasks/SWR-005C` |

`pnpm verify` (включая e2e) — на INTEGRATION; падения, вызванные незакоммиченной SWR-006, фиксируются отдельно, не чинятся.

## Implementation log (filled by workers)
| Subtask | Changed files | Tests run (command → result) | Limitations |
|---|---|---|---|
| W1 — `@bga/platform/rules-kb` (backend-worker, 2026-11-20) | new `packages/platform/src/rules-kb/{schema,issues,parse,validate,validate-io,text,search,context,render,index}.ts`; new `packages/platform/test/rules-kb/{fixture.ts,parse,validate,validate-io,search,context,render,boundaries}.test.ts`; `packages/platform/package.json` — only `exports["./rules-kb"]` | `pnpm --filter @bga/platform test` → 13 files, 230 tests passed; `pnpm --filter @bga/platform typecheck` → exit 0; `pnpm build:packages` → exit 0; `node -e "…require('./packages/platform/dist/rules-kb/index.js')"` → 33 exports (API §2 + enum schemas); `require('@bga/platform/rules-kb')` from `packages/games/rebellion` → 33 exports; `pnpm exec eslint packages/platform --max-warnings=0` → exit 0; `pnpm exec prettier --check packages/platform` → clean | Additive exports beyond §2: enum schemas (`KbEntryKindSchema`, …), `KbDiscrepancyRefSchema`, `Kb*Input` types. `include` in `buildRulesContext` does not override `ai: 'none'` (literal reading of §2.2). Empty filter arrays in search = no filter. IDF is computed over the whole KB (filters do not change scores). Stemming is a light English suffix stripper; Russian keywords match only by exact word form. `QUOTE_BUDGET_EXCEEDED` is reported once per source, at the quote that crosses 400 words. |
| W2 — Rebellion KB data, tests, docs (backend-worker, 2026-11-20) | new `packages/games/rebellion/knowledge/{manifest.json,coverage.json,discrepancies.json,audit-summary.md}`, `knowledge/entries/{general,round-command,movement,rebel-base,victory,refresh,components,missions-cards,combat,setup,implementation-notes}.json` (181 entries: 126 rule, 30 clarification, 11 interpretation, 14 implementation-note; 10 needs-review; 18 DISC; 134 sourceSections incl. all 86 RR index topics); new `packages/games/rebellion/test/knowledge/{load-kb.ts,validate,content,coverage,discrepancies,search,context,no-full-texts,generated-docs}.test.ts`; generated `docs/game-rules/rebellion/{rules-index,coverage-matrix,discrepancies}.md`; new `docs/game-rules/knowledge-base.md`, `docs/architecture/rules-knowledge.md` | `pnpm --filter @bga/game-rebellion exec vitest run test/knowledge` → 8 files, 92 tests passed (0 validation issues with `nodeIo`); `UPDATE_KB_DOCS=1 … vitest run test/knowledge/generated-docs.test.ts` → 4 passed (docs written), then without the flag → up to date; `pnpm --filter @bga/game-rebellion test` → 66 files, 602 tests passed; `pnpm --filter @bga/game-rebellion typecheck` → exit 0; `pnpm exec eslint packages/games/rebellion/test/knowledge --max-warnings=0` → exit 0; `pnpm exec prettier --check packages/games/rebellion/knowledge packages/games/rebellion/test/knowledge` → clean; `git ls-files '*.pdf' '*.PDF'` → empty | Texts paraphrased from the PDF text layer read 2026-11-20 (LTP via mirror). Faction sheet numbers, leader tactic values, time track icons, region names, Mustafar–Utapau are not in the text layer → needs-review + DISC-014/016/017/018. FAQ card-specific answers (pp.3–5: Millennium Falcon, It Is Your Destiny, etc.) are not individual entries (pages covered by other FAQ entries). LTP `date` is `"2016"` (no exact date; official file not downloadable). Search: implementation-notes can rank in top-3 for generic questions (filter by `kinds` in the Assistant). Analyst Q-1 follow-up: `appliesTo` removed from mission entries and from core-v1-absent mechanics (combat trigger, voluntary reveal, Rebel Base space moves), `pass-is-not-action` untagged, 12 core/command texts tightened → Command Phase context (6000) is untruncated: rebels 5932 chars / 22 entries, empire 5934 / 22 (margin ~66 chars; adding tagged entries will truncate). Rerun: knowledge tests 8 files, 94 passed; docs regenerated; prettier/eslint/typecheck clean. Review fixes: F-1 coverage now 157 items = all 126 rules + all 31 slice clarifications/interpretations (C-4 Q-8; slice = round, command, activation, movement, transport, rebel-base, victory, refresh, setup, map, units, leaders + sub-categories), coverage.test.ts asserts it; F-2 `units.ships`/`command.turn-order` → partial (DISC-001/DISC-002); F-3 `combat.trigger` text (RR p.2 step 4); F-4 `base.death-star-does-not-reveal` mentions loyalty; F-5/F-6 knowledge-base.md wording + page-level limitation; F-7 open question noted in rules-knowledge.md §4; F-8 LTP `notes` state sha256 = mirror (schema requires a hash). Context unchanged: rebels 5932 / empire 5934, untruncated. Rerun: knowledge tests 8 files, 96 passed; docs regenerated; prettier/eslint/typecheck clean. |
