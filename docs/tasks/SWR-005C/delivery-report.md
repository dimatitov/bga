# Delivery Report — SWR-005C Rules Knowledge Foundation

## Scope
**Сделано.**
- Источники проверены 2026-11-20: Rules Reference (2016-03-22, 16 стр.) и FAQ v2.1 (May 2019, 8 стр.; стр. 6–8 — Rise of
  the Empire, исключены) скачаны с CDN FFG по URL PO. Learn to Play: CDN сначала отвечал 503 и был прочитан по зеркалу,
  позже QA скачал официальный файл и сверил: текст совпадает постранично. Хеши, даты и число страниц — в `manifest.json`.
  Более новой версии FAQ не найдено. PDF лежат только во временной папке, в репозиторий не попали.
- Формат базы знаний не зависит от игры: `@bga/platform/rules-kb` — новый аддитивный subpath, только `zod`. В нём схемы,
  `parseKnowledgeBase`, `validateKnowledgeBase` (38 стабильных кодов ошибок, проверки файлов через injected io), BM25-поиск
  `createRulesSearch`, выборка правил для AI `buildRulesContext` с бюджетом символов и рендер markdown-отчётов. Код
  проверен на фикстуре вымышленной второй игры.
- База знаний Rebellion (`packages/games/rebellion/knowledge/`): 181 запись — 126 `rule`, 30 `clarification`,
  11 `interpretation`, 14 `implementation-note`; 171 `verified`, 10 `needs-review`. Все 86 тем глоссария RR покрыты.
  Все тексты — собственный пересказ на английском; в базе 5 коротких цитат.
- Матрица покрытия: 157 пунктов (33 implemented, 14 partial, 11 deviation, 92 not-implemented, 7 not-applicable). Файлы,
  символы и имена тестов проверяются автоматически.
- Аудит среза `core-v1`: **ошибок реализации нет**. Найдено 18 расхождений (DISC-001..018): осознанные упрощения,
  отсутствующие механики, один скрытый пробел (DISC-009 — постоянное условие раскрытия базы) и данные, которые надо
  сверить с коробкой.
- Документы: формат базы для авторов — `docs/game-rules/knowledge-base.md`; сервисный интерфейс, интеграция с AI
  Commander и поэтапный план Rules Assistant — `docs/architecture/rules-knowledge.md`. Сгенерированы
  `docs/game-rules/rebellion/{rules-index,coverage-matrix,discrepancies}.md`.

**Сознательно не сделано** (out of scope): исправление механик, подключение `buildRulesContext` к промпту SWR-006,
HTTP API и UI Rules Assistant (есть только интерфейс и план), Team Game, тексты карт.

## Files changed
- New: `packages/platform/src/rules-kb/**`, `packages/platform/test/rules-kb/**`, `packages/games/rebellion/knowledge/**`,
  `packages/games/rebellion/test/knowledge/**`, `docs/game-rules/knowledge-base.md`, `docs/game-rules/rebellion/*.md`,
  `docs/architecture/rules-knowledge.md`, `docs/tasks/SWR-005C/**`.
- Modified: `packages/platform/package.json` (only `exports["./rules-kb"]`); `docs/game-rules/rebellion-reference.md` and
  `docs/game-rules/rebellion-core-v1.md` (pointer banner to the KB — Analyst edit, QA-1 accepted).
- Not touched: `src/rules`, `src/scenario` (`git diff --stat c1ace26` empty), SWR-006 files, lockfile/workspace, eslint config.

## Acceptance criteria
| AC | Status | Evidence |
|---|---|---|
| AC-1 | passed | `artifacts/logs/qa-sources.log` |
| AC-2 | passed | `artifacts/logs/qa-platform-rules-kb.log` |
| AC-3 | passed | `artifacts/logs/qa-rebellion-knowledge.log` |
| AC-4 | passed | `artifacts/logs/qa-rebellion-knowledge.log` |
| AC-5 | passed | `docs/game-rules/rebellion/coverage-matrix.md` |
| AC-6 | passed | `docs/game-rules/rebellion/discrepancies.md` |
| AC-7 | passed | `artifacts/logs/qa-process.log` |
| AC-8 | passed | `artifacts/logs/qa-rebellion-knowledge.log` |
| AC-9 | passed | `artifacts/logs/business-validation.log` |
| AC-10 | passed | `artifacts/logs/qa-platform-rules-kb.log` |
| AC-11 | passed | `artifacts/logs/qa-manual.log` |
| AC-12 | passed | `docs/architecture/rules-knowledge.md` |
| AC-13 | passed | `artifacts/logs/qa-verify.log` |

## Verification
- lint: passed — `artifacts/logs/qa-verify.log`
- typecheck: passed — `artifacts/logs/qa-verify.log`
- unit/integration: passed — `artifacts/logs/qa-verify.log` (platform 230, rebellion 606, web 598, api 604 + 1 skipped)
- knowledge tests after QA-2 fix: passed — `artifacts/logs/qa-retest.log`
- build + bundle check: passed — `artifacts/logs/qa-verify.log`
- e2e: passed — `artifacts/logs/qa-verify.log` (136/136; no UI changes in this task)
- review: passed — `review.md` (round 2 approved)
- check-task: passed — `artifacts/logs/delivery-check.log`

## QA artifacts
`qa-results.md`; logs in `artifacts/logs/`. Rules accuracy was checked by hand on two separate samples: the reviewer
checked 45 entries and all 18 discrepancies, QA checked 19 different entries. No factual errors were found.

## Known issues / risks
- Data still to check against the box (`needs-review`, DISC-014/016/017/018): Rebel faction sheet values, Mustafar–Utapau
  adjacency, region names, which leaders have no tactic values, and the icon positions on the time track.
- DISC-009: today the engine checks base reveal only at the end of an Imperial activation. That must become a check after
  every state change before loyalty, deployment or missions are added.
- Review F-7 (open decision for the AI integration): `include` cannot pull in `ai: 'none'` entries, so implementation-notes
  such as "no combat in core-v1" never reach the AI context. The command-phase budget has only about 66 characters left.
- F-6: `SECTION_NOT_COVERED` checks at page level only. Topic coverage was checked by hand.
- F-9 (nit): search with `limit: NaN` returns an empty list.
- The full verify ran in a working tree that also holds the uncommitted SWR-006. Both are green together. After SWR-006 is
  merged, the io check will catch drift in the coverage evidence.
- Follow-ups: (1) audit SWR-006 AI behaviour and goal texts against this base once SWR-006 is merged; (2) connect
  `buildRulesContext` to the AI Commander prompt (decide F-7); (3) Rules Assistant phase 1 (`RulesKnowledgeService` and
  the search endpoint), as in `docs/architecture/rules-knowledge.md`.

## Final decision
accepted — AC-1..AC-13 passed, review approved, QA defects QA-1 (accepted) and QA-2 (fixed) closed
