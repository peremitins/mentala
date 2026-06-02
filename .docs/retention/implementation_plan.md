# План имплементации long-term retention — пошаговый чеклист

Дата создания: 2026-05-16. Последняя правка: 2026-05-21.

Этот документ — **рабочий чек-лист** для пошаговой реализации long-term retention-стратегии. Содержит конкретные действия, статусы и журнал. Компактный продуктовый контекст живёт в `.docs/retention/retention_long_term_strategy.md`, аудит chat lifecycle — в `.docs/audit_chat_lifecycle.md`.

## Правила работы со списком

- **Один шаг = одна атомарная единица работы.** Делать строго по порядку внутри этапа.
- **После выполнения шага** — заменяем `[ ]` на `[x]` и добавляем краткую пометку в строке «Результат» (commit hash / файл / TODO).
- **Никогда не начинаем следующий этап**, пока текущий не закрыт полностью (если в стратегии явно не сказано иначе).
- Перед началом сессии — открыть этот документ, найти первый незакрытый `[ ]`, оттуда продолжать.
- Если шаг частично выполнен, но обнаружен блокер — оставлять `[ ]` + пометку `BLOCKED: ...`, не закрывать преждевременно.

## Сокращения для статусов

- `[ ]` — не сделано
- `[x]` — сделано
- `[~]` — частично сделано (с пометкой что осталось)
- `[!]` — заблокировано (с пометкой причины)

---

## Этап 0. Контент 30 шагов программы «Спокойствие»

**Статус этапа:** на ответственности контент-команды (Николай). Не блокирует другие этапы, но без него нет смысла запускать новые Сады.

- [x] Финализировать контент первого сада: актуальный эталон — `program_calm_anxiety_30_v5.md`; старые `program_calm_anxiety_30.md` и `program_calm_anxiety_30_v1.md` удалены как архивные дубли.
  - Результат: 2026-05-20. Исторический v4-черновик был переписан как science-backed multi-action: орхидея, 30 шагов, минимум 2 содержательные required practices без mood, ранняя медитация до шага 10, третий PMR-блок, `micro_reflection`/`rating_scale`/`next_route_choice`, прогрессия timed-практик 3 -> 10 минут, отдельная схема онбординг -> первый сад.
  - Уточнение: 2026-05-20. ТЗ дополнительно вычитано как пользовательский контент: убраны неясные формулировки вроде «что сделало тревогу убедительной», «якорь», «комната», «какая часть квадрата»; шаг 8 переведён с hybrid `journal_entry` chips на `micro_reflection`; шаг 13 переведён с `ai_reflection` на `micro_reflection`; добавлены правила `durationSeconds`, `completionDelaySeconds`, `minQualifyingMessages`, journal-форматы, мягкое завершение тяжёлых шагов и reward-layer финала.
  - Уточнение: 2026-05-20. Таблицы приведены к фактической карте: `breathing` 14-16, `quick_help_grounding` 7-9, full chips table для всех `micro_reflection`, split-flow `rating_scale` в шаге 5, oneLine journal в шаге 20, short journal в шаге 25, safe-exit choice внутри `ai_chat_session` шага 25.
  - Уточнение: 2026-05-20. В `StepBlueprintAction` добавлены `scaleMin`/`scaleMax`, `quick_help_breathing` явно оставлен вне `calm_anxiety_30`, а критерии готовности заменены на конкретную сверку связанных docs.
  - Уточнение: 2026-05-21. Подготовлено финальное target-ТЗ v5 в `.docs/content/program_calm_anxiety_30_v5.md`: исправлены противоречия про статус текстов, action-модель приведена к runtime-совместимой схеме, добавлены `structured_form`/`guided_steps`/`weekly_check`, сохранён обязательный practice-костяк текущего сада (`breathing`, `meditation`, `quick_help_grounding`, `quick_help_tension`, `ai_chat_session`) с прогрессией длительности, встроены weekly-check после шагов 7/14/21/30, добавлены медицинские caveat-тексты, расчёт времени по фактическим actions и асинхронный сценарий поведенческого эксперимента между шагами 24-25.
  - Результат: 2026-05-21. v5 перенесён в runtime blueprint `calm_anxiety_30`: 30 explicit multi-action шагов, без шаблонного `mood_checkin`, с сохранением старых action-типов и JSONB-модели actions.
- [x] Перенести фактический контент в code blueprint без миграции БД.
  - Результат: 2026-05-21. `server/application/programs/retention-program.service.ts` использует v5-сетку из `.docs/content/program_calm_anxiety_30_v5.md`; схема БД не менялась.
- [x] Сверить, что `STEP_BLUEPRINTS` в `server/application/programs/retention-program.service.ts` соответствует новой композиционной модели.
  - Результат: 2026-05-21. Добавлены регрессионные тесты exact action-grid для всех 30 шагов, counts, weekly-check placements, AI-chat eligibility и сценарий 24-25.
- [x] Расширить `StepBlueprint` до массива `actions` и убрать зависимость шага от одного `kind`.
  - Результат: explicit `actions[]` используется для `calm_anxiety_30`; legacy `kind` оставлен для `self_kindness_21` и backward-compatible генерации старых blueprint'ов.
- [x] Добавить/доработать action-типы v5 в DTO/UI: `structured_form`, `guided_steps`, `weekly_check`; существующие `micro_reflection`, `rating_scale`, `next_route_choice` сохранить как базовые lightweight actions. Roadmap ещё не выпускался в production mobile-сборках, поэтому backward compatibility по Roadmap сейчас не ограничивает модель.
  - Результат: 2026-05-21. DTO/UI поддерживают `structured_form`, `guided_steps`, `weekly_check`, `experiment_status`, draft resume из `action.output`; неизвестные future action-типы остаются в backward-compatible fallback. `introText`/`miniArticle` добавлены как optional поля `ProgramStepDto` через metadata шага. Уточнение: 2026-05-22. В `calm_anxiety_30` intro дополнительно рендерится первым `guided_steps` action с `formKind: 'step_intro'`, чтобы это был отдельный экран прогресса.
- [x] Убрать глобальную optional-логику для primary `thought_dump`, safety-plan и финальных записей; при этом поддержать optional `journal_entry` там, где ТЗ v4 снижает письменную нагрузку.
  - Результат: 2026-05-22 (проверено в ревью). В `retention-program.service.ts` нет глобального `required: false` для primary `thought_dump`. Каждый action в blueprint v5 имеет explicit `required` (true по умолчанию, false только для optional weekly-check'ов и нескольких журнальных полей). Все три места использования `thoughtDumpAction` (lines 916, 1149, 1716) идут как обязательные primary practices. `safety-plan` структурирован через `structuredFormAction` с required-полями в шаге «План на трудный день».
- [x] Настроить целевой баланс первого сада по v5: `breathing` 14 появлений, `meditation` 9, `quick_help_grounding` 7, `quick_help_tension` 3, `ai_chat_session` 7, `thought_dump` 3, `structured_form` 10, `weekly_check` 4.
  - Результат: 2026-05-21. Баланс закреплён в `tests/calm-anxiety-blueprint.test.ts`; `journal_entry` оставлен только там, где он нужен для закрепления, без ежедневной письменной нагрузки.
- [x] Исправить chips, шкалы и structured forms согласно `.docs/content/program_calm_anxiety_30_v5.md`.
  - Результат: 2026-05-21. Шаг 1 начинается с вводного состояния `Как ты сейчас?`, а не с дыхания; все 30 шагов получают вводный текст, 24 шага получают мини-статью из v5 ТЗ. Шаг 5 использует split-flow шкала до/дыхание/шкала после; шаги 24-25 используют `experiment_status`. Уточнение: 2026-05-22. Вводный текст вынесен в отдельный intro-action перед вопросом, а safety-чипы больше не раскрывают отдельную панель помощи.
- [x] Проверить, что `mood_checkin` не считается обязательной содержательной practice и не делает шаг формально заполненным.
  - Результат: 2026-05-21. `calm_anxiety_30` v5 не содержит `mood_checkin` в runtime actions; тесты проверяют отсутствие шаблонного mood-action во всех 30 шагах.
- [x] Добавить safety-контур для шагов 16, 25 и финальный next-route после шага 30.
  - Результат: 2026-05-21. Шаг 25 содержит `ai_chat_session.stopCondition` с safe-exit и пропуском оставшихся required actions; шаг 30 содержит `next_route_choice` и финальный `weekly_check` перед completion. Уточнение: 2026-05-22. Proactive панели помощи в lightweight actions убраны; общий SOS/чат-сценарий не удалялся.
- [x] Реализовать weekly-check после шагов 7, 14, 21 и 30 с мягкой рекомендацией живой поддержки при ухудшении.
  - Результат: 2026-05-21. `weekly_check` стоит после 7/14/21 как optional `after_completion` и перед финальным completion шага 30 как required. Уточнение: 2026-05-22. Ответы weekly-check сохраняются без автоматической панели помощи внутри шага.
- [x] Реализовать асинхронный сценарий поведенческого эксперимента между шагами 24 и 25: `done`, `partly`, `planned_later`, `need_smaller`, `not_yet`.
  - Результат: 2026-05-22 (проверено в ревью). DTO: `'experiment_status'` добавлен в enum `ProgramStructuredFormFieldDto.type` (`shared/dto/retention.ts:70`). Blueprint: шаг 24 (`structuredFormAction` с `done_status` поля типа `experiment_status`) и шаг 25 (тот же тип поля в `prediction_fact_check` форме) в `retention-program.service.ts:1963, 2020`. UI: `ProgramStructuredFormAction.vue:2883` рендерит чипы с пятью вариантами по умолчанию (`done`, `partly`, `planned_later`, `need_smaller`, `not_yet`), плюс шаг 25 имеет AI-chat «Проверка прогноза» с topicPrompt про мягкий разбор без давления.

---

## Этап 1. Аудит lifecycle чата (БЛОКИРУЮЩЕЕ для Этапа 4)

**Статус этапа:** ЗАКРЫТ.

- [x] Прочитать `app/pages/chat.vue` (1753 строки) и связанные composables / plugins.
  - Результат: проведено 2026-05-16.
- [x] Составить аудит в виде отдельного markdown.
  - Результат: `.docs/audit_chat_lifecycle.md` создан 2026-05-16.
- [x] Зафиксировать чек-лист обязательных triggers для `useChatSession()`.
  - Результат: п. 6 аудита.

---

## Этап 2. Backend под multi-Сад

**Зависимости:** Этап 1 не обязателен, но изменения схемы лучше делать пораньше, чтобы Frontend не упирался в DTO.

### 2.1. Расширение модели программ

- [x] Добавить колонки в `programs` (миграция через `pnpm db:generate`):
  - `plant_set_slug VARCHAR` — слаг растения (например `'sunflower'`, `'rose'`, `'orchid'`).
  - `difficulty ENUM('gentle','standard','deep')` (опционально).
  - `summary_text TEXT` — лор-текст для оранжереи.
  - `unlock_rule JSONB` — `{ kind: 'always' | 'after_n_completed', n?: number }`.
  - Результат: 2026-05-16. `server/infrastructure/db/schema.ts:671-718` + `server/infrastructure/db/migrations/0087_fantastic_manta.sql`. БД локально не запущена — миграция применится при следующем `pnpm db:migrate`.
- [x] Заполнить значения для существующей `calm_anxiety_30` (orchid, always).
  - Результат: 2026-05-16, актуализировано 2026-05-20. `PROGRAM_BOOTSTRAP['calm_anxiety_30']` использует `plantSetSlug='orchid'`, потому что готовые ассеты лежат в `public/retention/plant/states/orchid/`. `ensureProgramBySlug` использует `onConflictDoUpdate`, поэтому значения подтянутся для уже существующей записи.
- [x] Создать seed/migration с записями программ #2-#12 из таблицы стратегии п. 3.2 (минимум name + slug + plant_set_slug + unlock_rule, контент пока пустой).
  - Результат: 2026-05-19. `SILHOUETTE_PROGRAMS` массив + `ensureSilhouetteSeed()` в `server/application/programs/retention-program.service.ts`. Вызывается из `getGardenForUser` при первом запросе Оранжереи (идемпотентно через `onConflictDoUpdate`). Силуэты 11 программ (#2..#12) с заданными `plant_set_slug`, `unlock_rule: { kind: 'after_n_completed', n: 1..11 }`. Защита от старта силуэта: `getStepBlueprintsForSlug` бросает `E_CONTENT_PENDING` → HTTP 503 user-friendly в `start.post.ts`.

### 2.2. Разнести `STEP_BLUEPRINTS` по slug-Map

- [x] В `server/application/programs/retention-program.service.ts` превратить `STEP_BLUEPRINTS` из массива в `Map<programSlug, StepBlueprint[]>`.
  - Результат: 2026-05-16. `STEP_BLUEPRINTS_BY_SLUG` + helper `getStepBlueprintsForSlug` в `retention-program.service.ts`. Массив переименован в `STEP_BLUEPRINTS_CALM_ANXIETY_30`.
- [x] Удалить хардкод `DEFAULT_RETENTION_PROGRAM_SLUG = 'calm_anxiety_30'` там, где он используется для универсальной логики. Оставить только в onboarding (первая программа нового юзера).
  - Результат: 2026-05-16. `ensureDefaultProgram` → `ensureProgramBySlug(slug)`. В `startProgramStep` убрана проверка `slug !== DEFAULT`. В `completeProgramStep` `program` теперь читается прямо по `stepTemplate.programId`. `getOrCreateProgramOverview` принимает произвольный slug.
- [ ] Адаптировать `getRetentionPlantStateIndex` под произвольный `totalSteps` (уже частично есть — проверить).
  - Результат: уже работает для произвольных totalSteps (см. `retention/retention_long_term_strategy.md`). Дополнительная проверка через unit-test остаётся в Этапе 6 при подключении второго Сада.

### 2.3. Таблица `user_plants` (коллекция растений)

- [x] Создать миграцию `user_plants`:
  - `user_id INT REFERENCES users(id)`
  - `program_slug VARCHAR`
  - `plant_set_slug VARCHAR`
  - `state_index SMALLINT` (финальная стадия)
  - `completed_at TIMESTAMP`
  - `user_summary TEXT` (лор-текст с AI fallback)
  - `saved_thoughts JSONB`
  - Уникальный индекс `(user_id, program_id)`.
  - Результат: 2026-05-16. `server/infrastructure/db/schema.ts:891-934`, миграция `0087_fantastic_manta.sql`. Уникальность взята по `(user_id, program_id)` (а не `program_slug`) — стабильнее при переименовании slug'ов в будущем.
- [x] Сервис `garden.service.ts` в `server/application/garden/` — создание записи `user_plants` при completion программы.
  - Результат: 2026-05-16. `server/application/garden/garden.service.ts` — `getGardenForUser`, `assertProgramUnlocked`. Сам INSERT user_plants на completion живёт **внутри транзакции** `completeProgramStep` в `retention-program.service.ts` для атомарности — это правильнее, чем выносить в отдельный сервис, потому что ключевой инвариант: `userPrograms.status='completed'` и `userPlants` создаются вместе или никак.
- [x] Хук в существующем `completeProgramStep` — если шаг последний, триггерим создание `user_plants` запись.
  - Результат: 2026-05-16. `retention-program.service.ts:1693-1721`. INSERT ... ON CONFLICT DO NOTHING — идемпотентность по `(user_id, program_id)`.

### 2.4. API endpoints

- [x] `GET /api/garden` — `GardenResponseDto { active, completed[], available[], lockedSilhouettes[] }`.
  - Результат: 2026-05-16. `server/api/garden.get.ts`.
- [x] `POST /api/garden/start` — выбор следующей программы из доступных. Проверка `unlock_rule`.
  - Результат: 2026-05-16. `server/api/garden/start.post.ts`. Возвращает 403 E_FORBIDDEN при не-открытом саде, 404 при unknown slug.
- [x] `GET /api/programs` — список всех программ для оранжереи (включая силуэты).
  - Результат: 2026-05-16. `server/api/programs/index.get.ts` — возвращает `ProgramListResponseDto` с пометками `unlocked` / `completedAt` для текущего юзера.
- [x] DTO в `shared/dto/garden.ts` через Zod. Обязательно — обратная совместимость со старыми клиентами.
  - Результат: 2026-05-16. `shared/dto/garden.ts` + `shared/dto/index.ts` re-export.

### 2.5. Daily limit (2 шага в день)

- [x] Middleware/проверка в `startProgramStep`:
  ```
  if (dailyCompletedSteps >= 2) throw HttpError(409, 'E_DAILY_LIMIT', { nextResetAt })
  ```
  Расчёт по локальному дню пользователя (timezone из `users.timezone` или `user_preferences`).
  - Результат: 2026-05-16. Константа `DAILY_STEP_LIMIT=2`, helper `countCompletedProgramStepsForDate`, helper `nextLocalMidnight` в `retention-program.service.ts`. Проверка в `startProgramStep` срабатывает только для **новых** шагов (replay и продолжение начатого не ограничиваются). Error.code='E_DAILY_LIMIT' → endpoint `start.post.ts` возвращает HTTP 409 + структурированный data.
- [x] Endpoint `GET /api/today` обогатить полями `stepsDoneToday` + `nextStepUnlocksAt`.
  - Результат: 2026-05-16. Поле `programDailyLimit: { dailyStepLimit, stepsDoneToday, nextResetAt }` в `TodayResponseDto` (optional для backward compat). `server/api/today.get.ts` заполняет.
- [x] Unit-тесты для timezone-aware подсчёта.
  - Результат: 2026-05-16. `tests/retention-timezone.test.ts` — 18 тестов, все прошли. Чистые timezone-функции вынесены в `server/application/programs/retention-timezone.ts` (без БД-зависимостей), чтобы vitest мог импортировать без mock'ов. Покрыто: `getLocalDateKey` (Moscow/UTC/NY DST/null fallback), `shiftDateKey` (границы месяца/года/leap year/отрицательное смещение), `nextLocalMidnight` (Europe/Moscow +3, UTC, Asia/Yangon +6:30, Asia/Kolkata +5:30, Pacific/Chatham +12:45, NY DST лето +/− зима, sanity-проверка future-direction, fallback на пустую timezone). `retention-program.service.ts` теперь re-export'ит timezone-функции из нового модуля.

### 2.6. Свободные практики капают

- [x] Расширить `energy_events.source` enum: `'breath_practice_completed' | 'meditation_completed' | 'gratitude_entry_saved' | 'thought_dump_saved'`.
  - Результат: 2026-05-16. `energy_events.source` это `varchar(40)`, не enum — расширения миграций не требует. Канонический список значений зафиксирован в `FREE_PRACTICE_SOURCES` в `server/application/energy/free-practice-energy.service.ts` и `FreePracticeSourceEnum` в `shared/dto/retention.ts`.
- [x] Rate-limit «3 капли/день из свободных практик» на уровне сервиса energy events.
  - Результат: 2026-05-16. `tryAwardFreePracticeEnergy` в `server/application/energy/free-practice-energy.service.ts`. Идемпотентность по `(userId, source, sourceId)` + лимит 3/день. Endpoint `POST /api/energy/free-practice` (`server/api/energy/free-practice.post.ts`).
- [x] Триггеры из соответствующих completion-сервисов (breath, meditation, gratitude, thought-dump).
  - Результат: закрыто в Этап 7 (см. ниже). Composable `useFreePracticeEnergy` подключён во все 4 точки completion'а.

---

## Этап 3. Frontend под коллекцию (Оранжерея)

**Зависимости:** Этап 2.

### 3.1. Маршрут и базовая страница

- [x] `app/pages/garden.vue` — пустая обёртка с PageHeader.
  - Результат: 2026-05-16. `app/pages/garden.vue` — minimal P1 версия с PageHeader, активный сад, коллекция, available seeds, locked silhouettes. Лор-карточка растения с AI-цитатой пока не сделана — отложено в 3.2.
- [x] Composable `useGarden()` — fetch `/api/garden`, кэширование, реактивность.
  - Результат: 2026-05-16. `app/composables/useGarden.ts` — `load()`, `startProgram(slug)`, computed `activePlant`/`completedPlants`/`availableSeeds`/`lockedSilhouettes`/`hasAnyContent`.
- [x] Точка входа: тап по растению на `HomeEnergyPlantCard` → `router.push('/garden')`.
  - Результат: 2026-05-16. `HomeEnergyPlantCard.vue` — `@click.stop="openGarden"` (`navigateTo('/garden')`). PhotoSwipe zoom удалён из этого места (перенесён на лор-карточку внутри `/garden` — Этап 3.2).

### 3.2. UI оранжереи

- [x] Компонент `GardenActiveCard.vue` — активное растение (текущая стадия + кнопка «Открыть Сад»).
  - Результат: 2026-05-16. `app/components/garden/GardenActiveCard.vue` — pure presentation, принимает `GardenPlantItemDto`. NuxtLink «Продолжить путь →» ведёт на `/programs/{slug}/map`.
- [x] Компонент `GardenCollection.vue` — grid коллекция завершённых растений в bloom-состоянии.
  - Результат: 2026-05-16. `GardenCompletedCollection.vue` — grid 2 cols, превью растения через `getRetentionPlantImageSrc(stateIndex-1)` с safe clamp (защита от out-of-bounds). Каждая карточка кликабельная, emit `select(plant)` родителю для открытия lore-карточки. Pluralize заголовка («1 сад / 2 сада / 5 садов») реализован вручную.
- [x] Компонент `GardenPlantLoreCard.vue` — открывается тапом по растению.
  - Результат: 2026-05-16. `GardenPlantLoreCard.vue` — Dialog с большим растением (PhotoSwipe pinch-to-zoom через `usePhotoSwipe`), название Сада, дата завершения, summaryText. **Сохранённые мысли периода**: показывается секция с countом мыслей и ссылкой `/thoughts` если `plant.savedThoughtIds.length > 0`. AI-сгенерированная итоговая цитата отложена до stabilization первой коллекции — нужен fetch текстов мыслей через дополнительный endpoint.
- [x] Компонент `GardenLockedSilhouette.vue` — красивый силуэт + подпись «Откроется когда завершишь ещё N садов».
  - Результат: 2026-05-16. `GardenLockedSilhouettes.vue` — список силуэтов с пунктирной рамкой, текст `unlockHint` уже отдаёт сервер.
- [x] Компонент `GardenAvailableSeeds.vue` — доступные программы для следующего старта.
  - Результат: 2026-05-16. `GardenAvailableSeeds.vue` — выделен из inline-блока в garden.vue. Принимает `seeds` + `startingSlug` (для disable + label «Стартуем…»). Emit `start(programSlug)` родителю — error handling 403/404 живёт в garden.vue.

### 3.3. Сценарий «Пересадка» после завершения программы

- [x] Расширить success-анимацию финального шага (`retention/retention_long_term_strategy.md`) — финальная стадия удерживается дольше, добавляется текст.
  - Результат: 2026-05-19. `ProgramStepPlantReward.vue` — новый prop `isFinalStep`. При `true`: длительность flyout увеличена с 11s до 14s (медленнее раскрытие финального bloom'а), вокруг карточки добавлен мягкий цветочный glow (`plant-reward-final` + `plant-reward-final__bloom` с pulse-анимацией 6s loop). В `[step].vue` для `isProgramJustCompleted` success-экрана передаётся `is-final-step`.
- [x] Экран `/garden/transplant` или модалка «Орхидея переехала в Оранжерею. Следующий сад готов».
  - Результат: 2026-05-16. Без отдельного route'а — расширил success-экран в `pages/programs/[slug]/steps/[step].vue` (новый `isProgramJustCompleted` computed) с другим заголовком «Сад завершён», текстом про переезд в Оранжерею и двумя CTA «В Оранжерею» / «На главную». При повторном открытии экрана пользователь возвращается из Оранжереи.
- [x] При подтверждении ближайшей доступной программы: `POST /api/garden/start { programSlug }` → router.push на карту нового сада.
  - Результат: 2026-05-16. `pages/garden.vue:handleStartProgram` — `useGarden.startProgram(slug)` (POST /api/garden/start) с тостами для 403/404, после успеха `router.push('/programs/{slug}/map')`. Кнопка «Начать» рендерится в секции «Можно посадить» для каждой available программы.

### 3.4. UX лимита 2 шага в день

- [x] `HomeRoadmapCard.vue` — кнопка «Начать шаг» меняется на счётчик `Следующий шаг через 8ч 23м` когда лимит достигнут.
  - Результат: 2026-05-16. `HomeRoadmapCard.vue` — новый блок `isDailyLimitReached` с IconClock и 30-секундным тикером для countdown'а. Принимает prop `dailyLimit?: ProgramDailyLimitDto` из `/api/today`. `app/pages/index.vue:121-124` прокидывает `today.programDailyLimit`.
- [x] Тон сообщений: позитивный, без guilt (см. п. 2.4 стратегии).
  - Результат: 2026-05-16. Тексты: «Следующий шаг через …», «Ты прошёл свою норму на сегодня. Пауза помогает навыкам закрепиться». Никаких «исчерпал лимит» / «доступ закрыт».
- [x] Bottom sheet на карте пути — при тапе на «закрытый» шаг показывает альтернативы (свободные практики).
  - Результат: 2026-05-19. Новый компонент `app/components/programs/LockedStepBottomSheet.vue` — показывает название/описание шага + 4 альтернативы (дыхательные практики, медитация, дневник, AI-чат) с навигацией на соответствующие страницы. В `map.vue` при тапе на available/locked открывается этот sheet, а не `DailyLimitInfoDialog` (она остаётся для case «active + лимит достигнут»).
- [x] Обработать `E_DAILY_LIMIT` (HTTP 409) в `useAPI` или вызывающем месте — toast/sheet вместо общей ошибки.
  - Результат: 2026-05-16. `pages/programs/[slug]/steps/[step].vue:onMounted` ловит `error.data.error.code === 'E_DAILY_LIMIT'` после `startStep()` → toast «Ты прошёл свою норму на сегодня» + `navigateTo('/')` (там пользователь увидит счётчик). Защищает от гонки, если пользователь успел нажать «Начать» до того, как HomeRoadmapCard получил `programDailyLimit` из /api/today.

### 3.5. Inline-прогресс внутри шага (см. п. 2.9 стратегии)

- [x] Компонент `ProgramStepProgressIndicator.vue` — «Шаг 7 · Выполнено 2 из 4». Рендерится в `/programs/[slug]/steps/[step]`.
  - Результат: 2026-05-16. `app/components/programs/ProgramStepActionIndicator.vue` — рендерит «Выполнено N из M» + ряд bubble-индикаторов для каждого action (active/completed/pending). Использует `transientlyCompletedIds` для случая когда практика подошла к концу, но статус ещё не сохранён сервером. Подключён в `[step].vue` сразу после `ProgramStepHeader`.
- [x] Корректный resume: при повторном входе попадаем на первый незавершённый action.
  - Результат: 2026-05-16. `startStep()` находит `firstPendingIndex` через `actions.findIndex(a => a.status !== 'completed')`, выставляет `actionIndex.value`. Если все actions завершены — встаём на последний.
- [x] Кнопка «Пропустить» для optional actions.
  - Результат: уже работало через `primaryButtonLabel` (показывает «Пропустить» если `required === false` и нет input). Поведение сохранено, дополнительно добавлена кнопка «Назад» рядом с primary CTA для возврата к предыдущему action внутри шага.
- [x] Анимация галочки на индикаторе при завершении каждого action.
  - Результат: 2026-05-16. `<Transition name="indicator-check">` на bubble — scale + opacity при появлении галочки (180ms ease). Также transition для resume-hint (220ms).

---

## Этап 4. Рефактор чата под переиспользование (ИСПОЛЬЗУЕТ Этап 1)

**Зависимости:** Этап 1 завершён. Изоляция: можно начинать **сразу** даже до Этапов 2-3.

### 4.1. Извлечение composable'ов

- [x] Создать `app/composables/useChatSession.ts` со всеми lifecycle из аудита п. 6:
  - `startSession()` (lazy),
  - `finalize({ reason })` где `reason ∈ 'manual_summary' | 'roadmap_next' | 'unmount' | 'logout'`,
  - eligibility getter с тикером 1s,
  - `dispose()` собирает `stopChatStream + stopTTS + stopMic + subscriptionStore.invalidateCache`.
  - На `onScopeDispose` defensively вызвать `finalize({ reason: 'unmount' })`.
  - Глобальные слушатели (visibilitychange/pagehide/Capacitor) **НЕ регистрировать** — они уже в `session-finish.client.ts`.
  - Результат: 2026-05-16. `app/composables/useChatSession.ts`. `chat.vue` мигрирован на использование composable: ticker / formattedDuration / isEligible / handleFinishSession.finalize / unmount хук переведены. Page-level `tickerInterval` + дублирующая computed eligibility удалены, осталось ~50 строк меньше в chat.vue.
- [x] Создать `app/composables/useChatEligibility.ts` (или оставить внутри `useChatSession`, если получается компактно).
  - Результат: оставлено внутри `useChatSession` — eligibility + thresholds компактны, отдельный composable не оправдан.

### 4.2. Компонент `ChatRoom.vue`

- [x] Создать `app/components/chat/ChatRoom.vue` — UI без PageHeader. Использует `useChatSession`, `useVoiceDictationInput`, `useRealtimeVoiceSession`.
  - Принимает props: `mode: 'page' | 'embedded'`, опционально `topicPrompt`, `goalHint`.
  - Emit'ит `done` (для embedded-режима в Roadmap).
  - Результат: 2026-05-16. `app/components/chat/ChatRoom.vue` — 1100 строк, весь template/script/style из chat.vue. `useChatSession` принимает `{ skipDisposeFinalize }` — в embedded-режиме unmount не финализирует сессию (родитель ProgramAiChatAction вызывает `finalizeForRoadmapNext()` при нажатии «Дальше»). Через `defineExpose` родителю доступны `isEligible`, `eligibilityProgress`, `finalize`.
- [x] Прогресс-индикатор eligibility — видимый по умолчанию (не dev-only), как в стратегии п. 5.4.
  - Результат: 2026-05-16. Реализован в `ProgramAiChatAction.vue` (видим только в embedded-режиме). В `ChatRoom.vue` (page-режим) dev-only прогресс сохранён как раньше — текущий UX страницы `/chat` сохраняется неизменным, чтобы не отвлекать end-user'а на странице «обычного» чата.

### 4.3. Перевести `app/pages/chat.vue` на тонкую обёртку

- [x] Удалить из `chat.vue` всё, что переехало в `ChatRoom`. Должно остаться ~50 строк: PageHeader + `<ChatRoom mode="page" />`.
  - Результат: 2026-05-16. `chat.vue` теперь 33 строки. Содержит только PageHeader (с brand-иконкой и заголовком «Ассистент») + `<ChatRoom mode="page" />` + `goBackToHome`.
- [x] Проверить, что глобальный плагин `session-finish.client.ts` НЕ сломан (не зависит от новой обёртки).
  - Результат: глобальный плагин работает с `useChatStore()` напрямую, не зависит от страницы/компонента. Подтверждено через прохождение всех retention/chat-тестов.

### 4.4. QA-чеклист lifecycle (БЛОКИРУЕТ мерж в main)

См. п. 6.6 стратегии. Каждая ячейка таблицы — отдельная проверка с записью в логах «session X finalized, reason Y, duration Z, no leaks».

- [ ] /chat — отправил 3 сообщения, нажал «Подвести итог». Web.
- [ ] /chat — отправил 3 сообщения, перешёл на /home. Web.
- [ ] /chat — отправил сообщение, свернул вкладку. Web.
- [ ] /chat — отправил сообщение, закрыл вкладку. Web.
- [ ] /chat — отправил сообщение, свернул приложение. iOS Native.
- [ ] /chat — отправил сообщение, killed app. iOS Native.
- [ ] /chat — отправил сообщение, свернул приложение. Android Native.
- [ ] /chat — отправил сообщение, killed app. Android Native.
- [ ] Voice dictation: автостоп по тишине → uchat unmount → scene audio освобождён.
- [ ] Realtime voice: handoff → text → следующее сообщение открывает новую therapy_session.

(Аналогичный набор после Этапа 5 — для Roadmap-шага.)

---

## Этап 5. AI-chat как тип шага Roadmap

**Зависимости:** Этап 4 завершён + Этап 2.4 (для нового action-типа в DTO).

### 5.1. DTO и backend

- [x] Добавить `'ai_chat_session'` в `ProgramStepActionTypeEnum` (`shared/dto/retention.ts`).
  - Результат: 2026-05-16. `shared/dto/retention.ts` + зеркальный type `ProgramStepAction` в `server/infrastructure/db/schema.ts`.
- [x] Добавить поля в `ProgramStepActionDto`: `topicPrompt?`, `goalHint?`, `minQualifyingMessages?`, `minDurationSec?`.
  - Результат: 2026-05-16. Все 4 поля optional с границами (max 1000/500/20/3600).
- [x] Расширить blueprint-формат, чтобы один blueprint мог нести `ai_chat_session` action.
  - Результат: 2026-05-16. `StepBlueprint` тип в `retention-program.service.ts` получил `kind='ai_chat_session'` + соответствующие поля. `buildPrimaryPracticeAction` имеет case для ai_chat_session. Контент blueprint'а под Сад Спокойствия пока не подключён — см. 5.4.

### 5.2. Frontend embedded компонент

- [x] `app/components/programs/ProgramAiChatAction.vue` — оборачивает `ChatRoom mode="embedded"`. Передаёт `topicPrompt`. Слушает `@done` → emit вверх.
  - Результат: 2026-05-16. `ProgramAiChatAction.vue` — обёртка над ChatRoom + блок «Тема разговора» (`topicPrompt`/`goalHint`) + прогресс-индикатор eligibility (две точки: содержательные сообщения, время в разговоре).
- [x] CTA «Дальше» в step runner залочен пока `eligibility.canFinish === false`. Над CTA — прогресс-индикатор условий.
  - Результат: 2026-05-16. `[step].vue:nextDisabled` для ai_chat_session проверяет `aiChatActionRef.value?.isEligible.value`. `primaryButtonLabel` показывает «Продолжи разговор» когда disabled. Прогресс-индикатор сверху от CTA внутри `ProgramAiChatAction`.
- [x] При нажатии «Дальше» — `useChatSession.finalize({ reason: 'roadmap_next' })`, дожидаемся ответа, помечаем action `completed`, переходим к следующему action / completion-экрану.
  - Результат: 2026-05-16. `[step].vue:completeCurrentAction` для ai_chat_session вызывает `aiChatActionRef.value?.finalizeForRoadmapNext()` → ChatRoom → `chatSession.finalize({reason:'roadmap_next'})`. `output = { type, eligible, triggered, completedAt }` сохраняется в attempt.actions через стандартный PATCH.
- [x] Альтернативный путь: кнопка «Подвести итог» в шапке embedded-чата тоже завершает action.
  - Результат: 2026-05-16. В embedded-режиме `mode === 'embedded'` скрывает sticky-кнопку «Подвести итог» в шапке ChatRoom (CTA «Дальше» от step runner — единственный путь финализации). Если sticky-кнопка случайно нажата в будущем, ChatRoom emit'ит `done` → `ProgramAiChatAction` → `complete` для step runner.

### 5.3. Backward compatibility для старых клиентов

- [x] В step runner — fallback для незнакомого action-типа: показать кнопку «Открыть в чате» с deeplink `/chat?topic=...`.
  - Результат: 2026-05-16. Добавлен явный `<div v-else>` fallback с CTA «Открыть в чате». `KNOWN_ACTION_TYPES` массив + `isUnknownAction` computed + `unknownActionDeeplink` computed. `nextDisabled` для неизвестного action = false (нельзя залипнуть). `output = { skipped: true, fallback: true }` при completion.

### 5.4. Контентная интеграция

- [x] В Саду «Спокойствие» — шаг 17 (Разговор с тревогой) перевести с `reflection` на `ai_chat_session`.
  - Результат: 2026-05-16. Blueprint шага 17 в `retention-program.service.ts:232-250` теперь имеет `kind: 'ai_chat_session'` + `topicPrompt` («Расскажи о ситуации последних дней, в которой тревога звучала особенно громко…»), `goalHint` («Цель — назвать одно конкретное наблюдение или вопрос о своей тревоге.»), `minQualifyingMessages: 3`, `minDurationSec: 180`. `buildActions` для `kind === 'ai_chat_session'` пропускает блок «Как прошло?» reflection после практики (он уже был частью разговора), сохраняет mood + ai_chat_session + journal с переписанным prompt'ом «Какую одну мысль из разговора хочешь оставить себе?». При следующем `/api/today` `stepTemplateNeedsRefresh` обновит record в БД (JSON-сравнение по actions/metadata).
- [x] Финальный шаг каждого Сада (по мере появления) — `ai_chat_session` «Подведём итоги».
  - Результат: 2026-05-22 (проверено в ревью). Финальный шаг 30 в `calm_anxiety_30` содержит `aiChatAction` «Итог программы» (`retention-program.service.ts:2324-2331`) с `topicPrompt` про итог программы и `goalHint` про следующий фокус, `minDurationSec: 240`, `minQualifyingMessages: 4`. Финальный шаг 21 в `self_kindness_21` тоже содержит AI-chat «Что я говорю себе теперь» (intergration session по сессии 22 журнала). Оба финала также включают `nextRouteChoiceAction` и `weeklyCheckAction` с `placement: 'before_final_completion'`.

### 5.5. QA-чеклист для Roadmap embedded чата

- [ ] Roadmap-шаг с AI-чатом, отправил 3 сообщения, нажал «Дальше». Web.
- [ ] Roadmap-шаг — переход на /home через bottom nav. Web.
- [ ] Roadmap-шаг — свернул приложение. iOS / Android.
- [ ] Roadmap-шаг — «Назад» в браузере. Web.
- [ ] Roadmap-шаг — voice-input → автостоп → unmount. Все платформы.
- [ ] Roadmap-шаг — открыл другое приложение поверх. iOS / Android.

---

## Этап 6. Контент остальных Садов

**Зависимости:** Этапы 2-5 (без них новые Сады некуда подключать).

**Текущий P1.5-путь из `retention/retention_long_term_strategy.md`:** в первую итерацию идут два сада — `calm_anxiety_30` (Orchid, готов и является runtime-эталоном) и `self_kindness_21` (Peony, готов к релизу). Остальные Сады видимы в Оранжерее как заблокированный roadmap/backlog и добавляются по мере готовности контента.

- [x] Спроектировать `self_kindness_21` (Пион, plant_set_slug=`peony`) — 21 шаг. Ассеты × 15 стадий готовы в `public/retention/plant/states/peony/`.
  - Результат: 2026-05-31. Blueprint `STEP_BLUEPRINTS_SELF_KINDNESS_21` (21 шаг) реализован по v5 multi-action модели: explicit `actions[]`, `introText`, `miniArticle`, `durationMin`, `weekly_check` после шагов 7/14/21, `breathing` + `meditation` + `ai_chat` + `structured_form` + `micro_reflection` + `rating_scale` + `journal`. Методическая база: Neff (Self-Compassion), ACT (Hayes), CFT (Gilbert), LKM (Salzberg). Все 8 тестов `tests/peony-blueprint.test.ts` проходят. Сад готов к production-релизу.
- [!] Спроектировать `relationships_21` (Цикламен персидский, plant_set_slug=`cyclamen`) — 21 шаг. Ассеты × 15 стадий уже готовы в `public/retention/plant/states/cyclamen/`; нужен контент.
- [!] Спроектировать `emotion_regulation_21` (Георгин или Тюльпан) — 21 шаг. Отложено вне P1.5 (нет ассетов).
- [!] Спроектировать `inner_quiet_21` (Голубой лотос) — 21 шаг. Отложено вне P1.5 (нет ассетов).
- [!] Спроектировать `sustainable_habits_21` (Ландыш) — 21 шаг. Отложено вне P1.5 (нет ассетов).
- [!] Сгенерировать ассеты × 15 стадий для каждого нового растения. Готовы orchid, peony и cyclamen; дальше — azalea (Сад #4) и остальные.
- [x] Загрузить ассеты в `public/retention/plant/<plantSetSlug>/states/*.webp`. Готовы 3 сада: `orchid/` (15 файлов), `peony/` (15 файлов) и `cyclamen/` (15 файлов).
- [~] Тестовый прогон на staging. Готовы 2 сада к выкатке. Прогон по `.docs/QA_retention_chat_lifecycle.md` остаётся за тестером.

---

## Этап 7. Финализация капель за свободные практики

**Зависимости:** Этап 2.6.

- [x] Frontend: подсветка «+1 капля» на success-экране breath / meditation / gratitude / thought dump.
  - Результат: 2026-05-16. `app/composables/useFreePracticeEnergy.ts` — единый wrapper над `POST /api/energy/free-practice` с toast «+1 капля» при rewardGranted=true и silent режимом при rate-limit. Подключено в 4 точках:
    - **Breath**: `pages/breath-practices/[slug].vue:@complete="onPracticeComplete"`, sourceId = `breath:{slug}:{localDate}`.
    - **Meditation**: `pages/meditations/index.vue` через `watch([sessionEnded, currentTrack])` — сработка только при реальном завершении трека. sourceId = `meditation:{track.id}:{localDate}`. `lastAwardedMeditationKey` защищает от двойного watch trigger.
    - **Gratitude diary**: `pages/practices/gratitude-diary/editor.vue` — только в new-path (POST), не в edit (PATCH). sourceId = `gratitude:{entry.id}` — backend идемпотентен.
    - **Thought dump**: `pages/quick-help/thought-dump.vue` — в обоих exit-сценариях (`clearThoughts` и `handoffToChat`). sourceId = `thoughtdump:{localDate}` (одна капля в день, независимо от пути выхода).
- [x] Проверить, что rate-limit «3/день» корректно работает и UI показывает «Сегодня свободные практики капают завтра» при достижении лимита.
  - Результат: 2026-05-16. Backend проверка работает (см. `tryAwardFreePracticeEnergy` в `server/application/energy/free-practice-energy.service.ts`). Frontend silent-режим описан там же. 2026-05-19 (сессия 20): добавлен явный toast «Свободные капли на сегодня закончились» в `useFreePracticeEnergy.ts` — показывается один раз за сессию через флаг модуля `rateLimitToastShown` (без спама на каждой завершённой практике).

---

## Этап 8. Карта пути (Этап A — косметика)

**Зависимости:** независимый, можно делать параллельно с любым этапом.

- [x] Заменить grid на flex+wrap в `ProgramChapterSection.vue` (или эквиваленте).
  - Результат: 2026-05-16. `pages/programs/[slug]/map.vue` — `grid grid-cols-5/7` заменён на `.chapter-path { display: flex; flex-wrap: wrap; gap: 16px 20px; }`. Каждый шаг фикс-ширины 44px, wrap создаёт «змейку» в пределах главы.
- [x] SVG-коннекторы между кружками шагов внутри одной строки.
  - Результат: 2026-05-16. Реализовано через CSS-pseudo `::after` (не SVG — для P1 этого достаточно, рендер дешевле, поддержка lifecycle компонента не требуется). Коннектор 16×2px между соседними bubbles в одной строке. Для шагов в статусе `completed` коннектор окрашивается мягким emerald'ом. Полноценный SVG-path с pinned-coordinates — Этап 10.
- [x] Декоративные «вешки» начала / конца главы.
  - Результат: 2026-05-16. Span `.chapter-marker-start` (dot) и `.chapter-marker-end` (dot в незавершённом состоянии / `IconFlag` emerald-цветом когда вся глава пройдена). Создают визуальную точку входа/выхода для главы.

---

## Этап 9. Сезонные мини-челленджи

**Зависимости:** Этап 2 (нужна модель программ с разными типами).

- [~] Добавить поле `programs.kind ENUM('regular','mini')`.
  - Результат: 2026-05-19 (сессия 22). `programs.kind: varchar(16)` с default `'regular'` в schema. Миграция `server/infrastructure/db/migrations/0088_wide_radioactive_man.sql`. **UI mini-челленджей отложен вне P1.5 — функциональность не подключена.**
- [~] Сервис генерации mini-программ (7-14 шагов).
  - Результат: 2026-05-19 (сессия 22). `server/application/programs/mini-program.service.ts` существует как **skeleton без UI-входной точки**. `generateMiniProgram({ userId, theme })` с тремя темами (breath_week / morning_focus / gratitude_3d). **Не вызывается из UI** — оставлен как фундамент на будущее. Этап целиком отложен вне P1.5.
- [!] Награда mini: декор / резервный цветок, не основной plant_set. **Отложено вне P1.5** — требует визуала декор-предметов.

---

## Этап 11. Чекпоинт-отчёты (Reports) — пост-плановый блок

**Статус этапа:** реализован после написания этого плана, ниже зафиксировано постфактум по итогам ревью 2026-05-22. Документация — `.docs/arch_ui_features.md` раздел «Отчёты по программе (Сад)».

- [x] Новая таблица `user_program_checkpoint_summaries` для промежуточных и финального AI-отчёта.
  - Результат: миграция `0089_light_colleen_wing.sql` (CREATE TABLE) + `0090_yellow_ted_forrester.sql` (`viewed_at`, `push_sent_at`, индекс `idx_checkpoint_summaries_user_pending`). Уникальность `(user_program_id, checkpoint_step)`.
- [x] Сервис генерации финального отчёта (9 секций, 4000-6000 символов).
  - Результат: `server/application/garden/garden-summary.service.ts` — используется на шаге 30. Хранится в `user_plants.user_summary` и дублируется в `user_program_checkpoint_summaries` (kind='final').
- [x] Сервис генерации промежуточных отчётов (5 секций, 1500-2500 символов) для шагов 7/14/21.
  - Результат: `server/application/garden/garden-checkpoint-summary.service.ts`. Накопленный анализ: данные с начала программы, акцент на динамике с предыдущей точки. Стиль промптов запрещает длинные тире, эмоджи, лозунги «ты молодец», англицизмы и привязку к календарю.
- [x] Push про готовый отчёт + pending-уведомление на главной.
  - Результат: `server/application/garden/garden-report-push.service.ts` + `PendingReportNotificationModal.vue` (подключён в `app/layouts/default.vue`).
- [x] API: `POST /api/programs/:slug/checkpoint-summary`, `GET /api/programs/:slug/checkpoint-summary/:step`, `GET /api/programs/:slug/timeline`, `GET /api/garden/plants/:id/timeline`, `GET /api/garden/plants/:id/summary-status`, `POST /api/garden/plants/:id/refresh-summary`, `POST /api/garden/plants/by-slug/:slug/refresh-summary`.
- [x] UI компоненты: `ProgramCheckpointReportPreparing.vue` (polling overlay), `ProgramFinalReportPreparing.vue`, `GardenReportsTimeline.vue` (4 точки), `MoodAnxietyChart.vue` (ApexCharts area chart), плашка «N отчётов о твоём пути» в `GardenActiveCard.vue`, `GardenPlantReportSheet.vue` с timeline-переключателем.
- [x] Интеграция в step runner: `app/pages/programs/[slug]/steps/[step].vue` через `watch(isCompleted)` после шагов с `weekly_check` action триггерит preparing → sheet.
- [x] Метрики через `garden-metrics.service.ts`.

## Этап 10. Карта пути Этап B + Duolingo-path (поздний)

- [x] Полноценная карта пути в стиле Duolingo — точки на sin-волне с
      banner-разделителями глав, без соединительных линий.
  - Результат: 2026-05-25. Новые компоненты `app/components/programs/roadmap/`:
    - `ProgramRoadmapPath.vue` — корневой контейнер; рассчитывает геометрию
      через `useRoadmapLayout` + `useElementSize`, рендерит узлы и banner'ы
      глав. defineExpose: `activeStep`, `activeNodeVisible`, `scrollToActive`.
    - `ProgramRoadmapNode.vue` — узел шага. GSAP-pulse «дыхание»
      (scale 1→1.04, sine.inOut, 2.4s, repeat -1) для активного узла,
      кратное `useReducedMotion`. Touch-target 48×48, aria-label.
    - `ProgramRoadmapContinueCTA.vue` — sticky bottom-bar над BottomNav.
      Появляется когда активный узел вне viewport; tap → scroll к узлу +
      open `ProgramStepBottomSheet`. Vue `<Transition>` slide-from-bottom
      с iOS-spring easing.
  - Composables: `useRoadmapLayout.ts` (геометрия sin-волны 0.16↔0.84,
    период 8, симметричный gap вокруг banner'а; адаптив 320→768px),
    `useRoadmapHaptics.ts` (5 интенсивностей, Capacitor Haptics + web
    fallback), `useReducedMotion.ts` (единый источник правды).
  - Сценарии: tap по узлу → haptic по статусу + open sheet; завершение
    шага (active→completed в обновлённом overview) → success haptic +
    bounce-анимация узла; завершение главы → chapter haptic с задержкой
    180ms.
  - Routing разделён: `/programs/index.vue` — список всех садов
    (accordion), `/programs/[slug]/map.vue` — полноэкранная карта одного
    сада с auto-scroll к активному узлу при mount. Backward compat URL'ов
    сохранён.
  - Bottom sheets полированы: `data-[state=open]:duration-500 ease-[cubic-bezier(0.32,0.72,0,1)]`
    для open, более быстрый ease для close. Описания альтернатив в
    `LockedStepBottomSheet` убраны — только заголовки.
  - Unit-тест: `tests/roadmap-layout.test.ts` — 8 ассертов на пустой
    случай, монотонность cy, sin-центр, edge-padding, chapter-labels,
    симметричный gap, адаптив, active radius.
- [ ] Карта Садов в оранжерее (вьющаяся тропа между растениями).

---

## Метрики, которые надо начать собирать (параллельно с Этапами 2-5)

Сырые события идут через Sentry breadcrumbs (`server/application/analytics/retention-events.service.ts`, добавлено 2026-05-19). Агрегация в `retention_metrics_daily` — отдельная job, делается когда станет нужно собрать когорты.

- [~] D7 / D30 retention cohort.
  - Результат: 2026-05-19. Сырые события `program_started`, `program_step_started`, `program_step_completed`, `program_completed` идут через `trackRetentionEvent`. Cohort-агрегация поверх — отдельная BullMQ-job (не в P1.5).
- [~] Average programs completed per user.
  - Результат: 2026-05-19. Источник — `user_plants` + `program_completed` event. Считается ad-hoc запросом.
- [x] Garden visit rate среди пользователей с ≥1 завершённой программой.
  - Результат: 2026-05-19. Событие `garden_visited` пишется в `getGardenForUser` при каждом запросе `/api/garden`.
- [x] AI-chat step completion rate vs остальные типы.
  - Результат: 2026-05-19. События `ai_chat_step_started` (в `startProgramStep` если шаг имеет `ai_chat_session` action) и `ai_chat_step_completed` (в `completeProgramStep`). Метрика = completed / started.
- [~] Captured thoughts per program.
  - Результат: 2026-05-19. Источник — `user_plants.savedThoughts.ids` + `dailyThoughts` за период программы. Считается ad-hoc.
- [x] **Chat finalization integrity** — % сессий, у которых finalize дошёл до сервера (целевое 99.5%+). Критично для Этапа 4.
  - Результат: 2026-05-19. Событие `chat_session_finalized` пишется в `POST /api/therapy/session/end`. Метрика = `chat_session_finalized` / `therapy_sessions.created`. QA-чеклист `QA_retention_chat_lifecycle.md` проверяет lifecycle перед мержем в main.
- [~] Median steps per active day.
  - Результат: 2026-05-19. Источник — `program_step_completed` events, агрегация ad-hoc по дням.

---

