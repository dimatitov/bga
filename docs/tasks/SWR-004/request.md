# Request — SWR-004

Источник: сообщение Product Owner в чате, 2026-11-08 («SWR-004 — Game Setup & Factions»), получено во время SWR-003.
Статус: **in analysis** (SWR-003 завершён 2026-11-08).

## Суть
Полноценный сценарий создания и продолжения сессии Star Wars: Rebellion: каталог → страница игры → «Новая партия» →
выбор стороны (противник получает противоположную, сервер вычисляет её сам), тип противника (ai | human; для human — без
сложности, `aiDifficulty = null`, безопасная передача хода без раскрытия скрытой информации), сложность AI (только сохраняется),
`ruleset` (`base`; `rise-of-the-empire` недоступен — сессию с ним создать нельзя), `gameMode` (`digital`; `physical_companion`
не реализуется) → `POST /api/sessions` → `/sessions/:sessionId`; продолжение после перезапуска; список сессий со стороной,
типом противника, статусом и датой.

## Ключевые требования PO (дословные значения)
- Defaults: `{ gameId: "star-wars-rebellion", playerFaction: "rebels", opponentType: "ai", aiFaction: "empire", aiDifficulty: "normal", ruleset: "base", gameMode: "digital" }`.
- Типы: `FactionId = "rebels" | "empire"`, `OpponentType = "ai" | "human"`, `AIDifficulty = "easy" | "normal" | "hard"`,
  `GameRuleset = "base" | "rise-of-the-empire"`, `GameMode = "digital" | "physical_companion"`; типизированный реестр фракций с визуальными метаданными (без бизнес-логики).
- `CreateGameSessionRequest { gameId; playerFaction; opponentType; aiDifficulty?; ruleset; gameMode }`; клиентскому `aiFaction` не доверять.
- `GameSession`: id, gameId, playerFaction, opponentFaction, opponentType, aiDifficulty|null, ruleset, gameMode,
  status `setup|prototype|active|completed`, createdAt, updatedAt — адаптировать к существующим моделям без дублирования;
  разделить метаданные сессии, полное состояние и представление для стороны.
- API: `POST /api/sessions`, `GET /api/sessions`, `GET /api/sessions/:id` — типизированные, машинные коды ошибок + понятные сообщения.
- Скрытая информация: полный state только на сервере; view зависит от стороны; hot-seat — безопасная передача управления; debug-view только в изолированной dev-среде.
- Без OpenAI при создании сессии; не создавать второй AI-клиент.
- UX: страница игры (название, описание, визуал, «Новая партия», «Продолжить», последние сессии); экран новой партии (две карточки фракций,
  переключатель противника, сложность для AI, ruleset, «Начать игру»); блокировка кнопки на время запроса; двойной клик не создаёт две партии;
  desktop-first + узкие экраны; ru по умолчанию; только разрешённые ресурсы.
- Prototype boundary: если полной расстановки нет — сессия явно `prototype`, без выдачи за полноценную партию.

## Acceptance criteria (от PO)
- AC-01 Открытие экрана из каталога; AC-02 Defaults (Повстанцы, AI, Normal, Base, Digital); AC-03 Переключение фракций меняет сторону AI;
  AC-04 Human: сложность скрыта, `aiDifficulty = null`; AC-05 Клиент и сервер отклоняют неподдерживаемые настройки (одинаковые фракции, ruleset);
  AC-06 Уникальный id, сессия в БД; AC-07 Переход на `/sessions/:sessionId`, ошибка — остаёмся на форме с сообщением;
  AC-08 Перезапуск backend + обновление браузера — сессия и параметры доступны; AC-09 Продолжение через страницу игры;
  AC-10 Загрузка/пусто/ошибки; повторное нажатие не дублирует сессию; AC-11 Desktop + узкий viewport, клавиатура;
  AC-12 Игровая логика не зависит от React; новая игра не требует переписывать Session API; AC-13 Прототипное состояние явно обозначено.

## Тесты (от PO)
Unit, Integration, E2E TC-001…TC-006 (стандартная AI-партия, игра за Империю, против человека, восстановление, ошибка сервера, защита от дублирования),
Visual & Accessibility; скриншоты и результаты Playwright.

## Out of scope
Полные правила, AI Commander, стратегия ИИ, боевые карты, миссии/производство, полная расстановка, Rise of the Empire, сетевой мультиплеер,
physical companion-mode, AWS.

## Отметки оркестратора для анализа
- Сейчас фракции называются `empire | rebellion` (SWR-002) → PO требует `rebels | empire`: миграция идентификатора (в данных, контрактах, i18n, сохранённых сессиях).
- Hot-seat с передачей хода — новое требование относительно SWR-002 (там human-соперник не ходил).
