Ниже — обновленное ТЗ на удаление функционала выбора режимов (therapy/habits/talk) и упрощение welcome‑экрана с учетом новых решений.

## ТЗ (финал)

### Решения (зафиксировано)

- Базовый профиль ассистента: **терапевтический**, отдельного режима больше нет.
- “Привычки” и “Терапия” остаются как разделы. Переход в чат из этих разделов **обязан сохранять entryContext** (из терапии — контекст темы).
- На welcome‑экране одна кнопка: **«Поговорить»**.
- При клике на «Поговорить» нужен **авто‑welcome‑ответ ассистента**.
- `talk` удаляется полностью (типы, тексты, данные).
- Старые ссылки с `?mode=...` **игнорируем полностью**.
- `welcome_prompts` упрощаем до **одного типа без mode**.
- `chat_settings.mode` и `activePromptsByType` **удаляем**.
- `userPrompt` **не подставляем автоматически нигде** (используется только если будет явно передан сценариями в будущем).

### 1) Удалить выбор режима из UI

**Где сейчас есть:**

- `app/components/HeaderSettingsMenu.vue` — строка с «Режим» + `Combobox`
- `app/constants/select-options.ts` — `AI_WORK_MODE_OPTIONS`

**Что сделать:**

- Удалить блок выбора режима из `HeaderSettingsMenu.vue`.
- Удалить `AI_WORK_MODE_OPTIONS` и все импорты/использования.

### 2) Упростить Welcome‑экран

**Где сейчас есть:**

- `app/components/WelcomeScreen.vue` — три кнопки (`therapy`, `habits`, `talk`) + `MODE_DESCRIPTIONS` + emit `select(mode, prompt)`

**Что сделать:**

- Заменить три плитки на **одну кнопку «Поговорить»**.
- Удалить `MODE_DESCRIPTIONS`, `handleSelect(mode)` и текущий emit `select(mode, prompt)`.
- Новый контракт события: `select()` без параметров.
- В UI не остается никакой логики `mode`.

### 3) Авто‑welcome‑ответ ассистента

**Новая логика:**

- Клик по «Поговорить» запускает **стартовую генерацию** без user‑сообщения.
- Сигнал старта — **пустой массив messages** (без `mode`).
- Сервер формирует welcome‑ответ **без `mode` и без `userPrompt`**, с учетом `entryContext` (если есть).

### 4) Удалить логику mode на главной

**Где сейчас есть:**

- `app/pages/index.vue` — query `screen` + `mode`, watch’и по `mode`, `handleWelcomeSelect(mode, prompt)`

**Что сделать:**

- Убрать `mode` из URL и из всех обработчиков.
- Упростить `handleWelcomeSelect` → вызывает `startConversation()` без параметров.
- Обновить `updateURL()` → без `mode`.
- Полностью удалить обработку `talk` и `mode` из роутинга.
- Явно убрать чтение `route.query.mode` и любые маппинги старых URL.

### 5) Упростить store и entry‑chat

**Где сейчас есть:**

- `app/stores/chatSettings.ts` — `mode`, `activePromptsByType`
- `app/stores/chat.ts` — `startConversation({ mode })`, `_prepareApiParams` использует `mode` и `activePromptsByType`
- `app/composables/useEntryChat.ts` — `startEntryChat({ mode })`
- `app/pages/habits/*` и `app/pages/therapy/*` — вызовы `startEntryChat({ mode: ... })`

**Что сделать:**

- Удалить `mode` и `activePromptsByType` из `chatSettings`.
- Упростить `startConversation()` (без `mode`, без параметров).
- `entryContext` хранится в сторе и используется при формировании prompt’а.
- `_prepareApiParams` больше не опирается на `mode` и `activePromptsByType`.
- `userPrompt` не передаем, если не передан явно.
- Все вызовы entry‑chat перевести на `startEntryChat()` без параметров.
- **Сохранить передачу `entryContext`** (ключевой сценарий перехода из привычек/терапии).

### 6) Упростить welcome‑промпты (БД + сервер)

**Где сейчас есть:**

- `server/utils/welcomePromptStore.ts` — работает с `mode`
- `server/infrastructure/llm/openai.ts` — `isWelcomeStart` зависит от `mode`
- `server/infrastructure/db/schema.ts` — `welcome_prompts.mode`

**Что сделать:**

- Удалить `mode` из `welcome_prompts`.
- Переписать `welcomePromptStore` на API без `mode`:
  - `get(userId, isFirstSession, lang)`
  - `getDefault(isFirstSession, lang)`
  - `save(userId, isFirstSession, content, lang)`
- В `openai.ts` определить `isWelcomeStart` как `messages.length === 0` (без `mode`).
- Welcome‑промпт строить **на одном терапевтическом профиле** + `entryContext` (если есть).

### 7) Убрать режимы на бэке

**Где сейчас есть:**

- DTO: `shared/dto/index.ts` → `ChatRequestDto.mode`, `ChatMode`
- API: `server/api/chat/stream.post.ts`, `server/interface/api/chat.post.ts` — читают `mode`, требуют `mode` при старте
- LLM: `server/ports/index.ts`, `server/application/llm.service.ts`, `server/infrastructure/llm/openai.ts`
- Prompts: `server/application/prompts/index.ts` — `modeSpecificAddons`, `buildWelcomePrompt` с ветками `therapy/habits/talk`
- Settings: `server/utils/storage.ts`, `server/api/settings/chat.get.ts`, `server/api/settings/chat.patch.ts`

**Что сделать:**

- Удалить `mode` из DTO, портов и LLM‑контрактов.
- Удалить проверку `mode is required` при старте диалога.
- Упростить промпты: один терапевтический профиль, без `modeSpecificAddons`.
- Удалить `talk` полностью (типы, тексты, логика).
- Удалить `mode` из хранения настроек чата и эндпоинтов `chat.get/patch`.

### 8) БД и миграции

**Где сейчас есть:**

- `server/infrastructure/db/schema.ts`
  - `welcome_prompts.mode`
  - `chat_settings.mode`
  - `user_prompts.type` — в схеме это `varchar`, в комментарии есть `talk`, фактический enum в DTO его не содержит

**Что сделать:**

- **Физически удалить**:
  - `welcome_prompts.mode`
  - `chat_settings.mode`
- Очистить данные `talk` **если есть**:
  - проверить, существуют ли записи `user_prompts` с `type = 'talk'`
  - при наличии — удалить их
  - удалить записи `welcome_prompts`, связанные с `talk` (после удаления колонки)
- Обновить `user_prompts.type` на `habits | therapy` (без `talk`).
- Создать миграцию и обновить `schema.ts`.

### 9) Документация

- Обновить `.docs/architecture.md` по правилам проекта.

---

## Что реально затрагивается (карта мест)

**Фронт:**

- `app/components/HeaderSettingsMenu.vue`
- `app/constants/select-options.ts`
- `app/components/WelcomeScreen.vue`
- `app/pages/index.vue`
- `app/stores/chatSettings.ts`
- `app/stores/chat.ts`
- `app/composables/useEntryChat.ts`
- `app/pages/habits/index.vue`, `app/pages/habits/[id]/index.vue`
- `app/pages/therapy/index.vue`, `app/pages/therapy/[key]/index.vue`
- `app/types/index.d.ts`
- `app/stores/prompts.ts` (тип `AiWorkMode`)

**Бэк:**

- `shared/dto/index.ts`
- `server/api/chat/stream.post.ts`
- `server/interface/api/chat.post.ts`
- `server/ports/index.ts`
- `server/application/llm.service.ts`
- `server/infrastructure/llm/openai.ts`
- `server/application/prompts/index.ts`
- `server/utils/welcomePromptStore.ts`
- `server/utils/storage.ts`
- `server/api/settings/chat.get.ts`
- `server/api/settings/chat.patch.ts`
- `server/infrastructure/db/schema.ts` + новая миграция

---

## Проверки/QA

- Welcome‑экран показывает **одну кнопку** «Поговорить».
- По клику ассистент **сразу** отвечает (auto‑welcome).
- URL больше не содержит `mode`; старые `?mode=...` игнорируются.
- Переход из привычек/терапии сохраняет `entryContext`.
- Переход с `/habits` и `/therapy` создаёт welcome‑ответ **без `mode`**, но **с `entryContext`**.
- В API/DTO/LLM нет упоминаний `mode` и `talk`.
- Миграции применяются без ошибок; `chat_settings.mode` и `welcome_prompts.mode` отсутствуют.
