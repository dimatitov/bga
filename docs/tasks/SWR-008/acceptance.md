# Acceptance — SWR-008 Rules Integration & Game Integrity

## Pre-QA business validation

Analyst, 2026-11-20. Проверено «глазами PO» на итоговом дереве (`main` `3fe4a66` + незакоммиченная SWR-008 + правки ревью).

1. **Код собирается и проходит все проверки.** `pnpm verify` exit 0 на Node 22.23.5: platform 366, forbidden-stars 5,
   rebellion 875, web 647, api 863 (+2 skipped), e2e 139 — `artifacts/logs/final-verify.log`.
2. **AI Commander реально получает правила (S-1) — реальный прогон OpenAI** (PO-2, лимит $1; dry-run показал худший случай
   $0.2096): `artifacts/logs/bench-real.log`, отчёт `artifacts/benchmark/real-20261120-140206.md` / `.json`.
   - Модель `gpt-6-luna` (роль `tactical`, как у Commander), 14 сценариев × 3 варианта × 3 повтора = 126 решений, 84 вызова.
   - **Потрачено $0.008932**, остановки по лимиту нет; ключи/секреты в логе и отчёте не найдены (grep `sk-`/`Bearer`/`api_key` = 0).
   - Блок правил: в среднем 5249 символов, версия `rebellion@1:55b423d7bfef`, 0 fallback, 100 % валидных решений во всех вариантах.
3. **Влияние Rules Context измерено честно (AC-15).** Парное сравнение по 14 сценариям, 95 % ДИ:
   - качество: goal score 0.774 (с правилами) против 0.845 (без), Δ −0.071, ДИ [−0.178; 0.035] → **измеримого эффекта нет**;
     попадание в ожидаемое действие 73.8 % против 76.2 %, Δ −0.024, ДИ включает 0 → эффекта нет; необоснованных PASS 0 % в обоих.
   - стоимость: +1396 входных токенов на решение (большая часть кэшируется: 63 392 из 95 214), **$0.000116 против $0.000097
     за решение (+19 %, ДИ [7.9; 29.8] µ$ — значимо хуже)**; задержка p50 1414 мс против 1516 мс — эффекта нет.
   - обе OpenAI-версии лучше бесплатного бота (goal 0.845 / 0.774 против 0.643): бот ошибается в emp-03, reb-01, reb-03, reb-04,
     reb-05 (дефекты бота BOT-1..BOT-3 из QD-25 подтверждены реальным прогоном).
   - Сценарии, где правила, похоже, мешают: `emp-05-leader-pin` (0/3 против 1/3), `reb-05-end-of-time-pass` (1/3 против 3/3),
     `reb-06` — кандидаты на доработку текста/отбора правил в следующей задаче. Вывод для PO: Rules Context подключён и безопасен,
     но на текущем срезе core-v1 **не улучшает решения** и стоит ~+19 % за решение; это ожидаемый риск RK-1.
4. **DISC-009 (S-4).** Раскрытие базы — единственная точка `runStateChecks` после каждой команды и при создании; differential-тест
   на 285 seeded-партиях даёт побайтно те же события, что старая логика (наблюдаемое поведение core-v1 не изменилось, A-3);
   искусственные состояния раскрываются в правильный момент, без повторов — `implementation-plan.md` (W2), `review.md`.
5. **Скрытая информация.** Отбор правил идёт только по публичному `rulesQuery`; запросы к модели побайтно совпадают при переносе
   скрытой базы (W4, W10 TC-H-01/03/06), скан 196 запросов AI-Империи без упоминаний базы (W10 TC-H-04) — итог проверяет QA.
6. **Dev-диагностика (S-6).** Панель видна только в dev, при включённом переключателе и в партии с AI; e2e E-1/E-2 и
   `check:bundle` подтверждают отсутствие в production-бандле — визуальная проверка (скриншоты) — на QA.

Найдено и не исправлено в SWR-008 (вне объёма, QD-25): BOT-1 (reb-01 — бот Повстанцев выводит весь гарнизон из раскрытой базы →
мгновенный проигрыш), BOT-2 (reb-04 — не возвращается в пустую базу), BOT-3 (emp-03 — FINISH после ввода одной Звезды Смерти).

Вывод pre-QA: бизнес-сценарии S-1..S-6 проходят; передаётся в QA_EXECUTION.

## Acceptance criteria
| AC | Status | Evidence |
|---|---|---|
| AC-1 | passed | `artifacts/logs/delivery-check.log` |
| AC-2 | passed | `artifacts/logs/qa-platform.log`, `artifacts/logs/qa-api.log` |
| AC-3 | passed | `artifacts/logs/qa-api.log` |
| AC-4 | passed | `artifacts/logs/qa-rebellion.log` |
| AC-5 | passed | `artifacts/logs/qa-rebellion.log`, `artifacts/logs/qa-api.log` |
| AC-6 | passed | `artifacts/logs/prompt-scan.log`, `artifacts/logs/qa-api.log` |
| AC-7 | passed | `artifacts/logs/qa-api.log` |
| AC-8 | passed | `artifacts/logs/qa-rebellion.log` |
| AC-9 | passed | `artifacts/logs/qa-api.log`, `artifacts/logs/qa-rs06-devdb.log` |
| AC-10 | passed | `artifacts/logs/qa-api.log` |
| AC-11 | passed | `artifacts/logs/qa-api.log`, `artifacts/logs/final-verify.log` |
| AC-12 | passed | `artifacts/logs/qa-api.log` |
| AC-13 | passed | `artifacts/logs/qa-web.log`, `artifacts/logs/qa-e2e-diagnostics.log`, `artifacts/logs/qa-browser-diag08.log` |
| AC-14 | passed | `artifacts/logs/qa-rebellion.log`, `artifacts/logs/qa-api.log` |
| AC-15 | passed | `artifacts/benchmark/real-20261120-140206.md`, `artifacts/logs/bench-real.log`, `artifacts/logs/qa-meas.log` |
| AC-16 | not_run | `artifacts/logs/final-verify.log` — локально exit 0; CI на коде SWR-008 не запускался (код не закоммичен) |

## Final decision
blocked — AC-1..AC-15 passed (QA: `qa-results.md`); AC-16 ждёт CI GitHub Actions на коде SWR-008 после коммита/push (нужен OK пользователя)
