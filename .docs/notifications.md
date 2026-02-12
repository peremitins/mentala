# Система персонализированных уведомлений Mentala

**Версия:** 2.6  
**Дата:** 2025-01-XX  
**Статус:** Production Ready ✅

**Последние изменения:**

- Реализована AI Buffer Pool модель (генерация 50 текстов за раз)
- Добавлена таблица `ai_notification_text_usage` для отслеживания отправленных текстов
- Реализовано автоматическое пополнение пула при приближении к концу
- Добавлен retry механизм с exponential backoff для надежности генерации
- Динамический расчет токенов: `count * 200 + 5000` для гарантии получения всех текстов

**Важно по актуальности документации:**

- Источник истины по масштабированию генерации слотов, backpressure, lock-стратегии и инвариантам горизонта: `.docs/notification_slots_scaling_tz.md`.
- Этот документ описывает функциональную и продуктовую сторону уведомлений; при конфликте правил приоритет у scaling-ТЗ.

## 📋 Обзор

Система персонализированных push-уведомлений для Mentala с поддержкой:

- **Therapy (Терапия)** — дыхательные практики, заземление, body scan, рефрейминг
  - **Support Topics** — тематические направления поддержки (тревога, стресс, сон и др.)
- **Habits (Привычки)** — формирование полезных привычек и отказ от вредных

### Ключевые возможности

- 🎨 **Персонализация** — настройка обращения (ты/Вы) и стиля подачи (Мягкий/Сдержанный/Строгий)
- ⏰ **Умное планирование** — равномерное распределение с джиттером ±15 минут
- 🔔 **Snooze** — отложить на 15 мин / 1 час / 4 часа / до завтра
- 📊 **Трекинг** — автоматический сбор метрик взаимодействия
- 🌍 **Timezone-aware** — автоопределение часового пояса
- 🤖 **AI-генерация** — режимы templates/ai для создания текстов
- ⏱️ **Кастомные слоты** — ручное задание времени уведомлений

---

## 🏗 Архитектура

```
┌─────────────────┐
│  Client (Nuxt)  │
│  + Capacitor    │
└────────┬────────┘
         │
         │ REST API
         │
┌────────▼────────────────────────────┐
│  Server (Nitro)                     │
│  ├─ API Endpoints                   │
│  ├─ Scheduler Service (генерация)  │
│  └─ BullMQ Workers                  │
│     ├─ Slots Generation Worker      │
│     ├─ Delivery Worker              │
│     └─ AI Text Pool Worker          │
└────────┬────────────────────────────┘
         │
    ┌────▼────┐     ┌──────────┐     ┌──────────┐
    │   DB    │     │  Redis   │     │   FCM    │
    │(Postgres)│    │ (BullMQ) │     │(Firebase)│
    └─────────┘     └──────────┘     └──────────┘
```

### Компоненты

1. **База данных** — PostgreSQL с Drizzle ORM
2. **Redis** — брокер очередей для BullMQ
3. **API Endpoints** — REST API для настроек, привычек, токенов
4. **Планировщики** — ставят задачи в очереди BullMQ
5. **Воркеры BullMQ** — обрабатывают задачи из очередей:
   - Генерация слотов уведомлений
   - Отправка уведомлений через FCM
   - Пополнение пула AI-текстов
6. **Frontend Components** — UI для настройки и превью
7. **Capacitor Push Notifications** — регистрация токенов и обработка уведомлений

---

## 🗄 База данных

### Основные таблицы

- `habits` — привычки пользователя
- `therapy_topics_custom` — пользовательские темы терапии
- `user_preferences` — глобальные настройки (addressing для выбора текста informal/formal)
- `notification_preferences` — локальные настройки по типу (с поддержкой `entityKey`)
- `notification_slots` — запланированные слоты уведомлений (с поддержкой `entityKey`)
- `ai_generated_notification_texts` — AI-генерированные тексты (с поддержкой `entityKey`)
- `ai_notification_text_usage` — отслеживание отправленных AI-текстов (новая таблица)
- `notification_texts` — тексты уведомлений (дефолтные и пользовательские) с изоляцией данных пользователей
- `notification_text_presets` — эталонные дефолтные тексты (read-only, только для разработчиков/админов)
- `user_devices` — FCM токены устройств
- `notification_interactions` — трекинг взаимодействий
- `daily_adherence` — дневная агрегация метрик

### Структура `notification_preferences`

```typescript
notification_preferences {
  id: string (PK)
  userId: integer
  kind: 'therapy' | 'habits'

  // Унифицированное поле для идентификации сущности
  entityKey: string | null  // Для habits: ID привычки, для therapy: ID темы или ключ шаблона

  enabled: boolean
  timesPerDay: integer (1-5)
  directness: 'soft' | 'moderate' | 'hard'
  timezone: string (IANA)
  subtype: 'reminder' | 'informational' | 'motivational' | 'mixed' | null  // Для habits
  textSource: 'templates' | 'ai'  // Способ создания текстов

  // Дополнительные параметры
  activeDays: integer[]  // Дни недели (0-6)
  timeRangeStart: integer  // Начало окна (в минутах, 0-1439)
  timeRangeEnd: integer  // Конец окна (в минутах, 0-1439)
  customSlotTimes: integer[] | null  // Кастомные времена (максимум 5, в минутах, non-null значения должны быть уникальны)
  meta: jsonb | null  // { textSource: 'templates' | 'ai' }

  createdAt: timestamp
  updatedAt: timestamp
}
```

### Изоляция данных пользователей для текстов уведомлений

**Архитектура:**

- **Полная изоляция данных**: Каждый пользователь работает только со своими текстами
- **Lazy initialization**: При первом обращении к текстам автоматически копируются из `notification_text_presets` в `notification_texts` с `user_id = <user_id>`, `source='default'`
- **Источник истины**: `notification_text_presets` — единственный неизменяемый источник, доступный только разработчикам/админам
- **Персональные дефолты**: У каждого пользователя свои копии дефолтных текстов (`user_id IS NOT NULL`, `source='default'`)

**Структура таблицы `notification_texts`:**

- `id` — уникальный идентификатор (TEXT)
- `kind` — тип уведомлений ('habits' | 'therapy')
- `entity_key` — ключ сущности
- `user_id` — ID пользователя (INTEGER, NOT NULL для всех пользовательских текстов)
- `source` — источник текста ('default' | 'user')
- `intent`, `subtype`, `directness`, `addressing`, `locale` — параметры фильтрации
- `text` — сам текст уведомления
- `is_deleted` — логическое удаление (BOOLEAN)

**Важно:** В новой модели больше не используются тексты с `user_id IS NULL` для пользовательских данных. Все тексты имеют `user_id IS NOT NULL`.

### Миграции

**Важные миграции:**

- `0021_refactor_generationMode_to_textSource.sql` — настройка поля `textSource`
- `0022_refactor_habitId_topicKey_to_entityKey.sql` — настройка поля `entityKey`
- `0027_add_ai_notification_text_usage.sql` — таблица для отслеживания отправленных AI-текстов
- `0033_add_notification_texts_tables.sql` — создание таблиц `notification_texts` и `notification_text_presets`
- `0035_migrate_notification_texts_to_user_scoped.sql` — миграция существующих глобальных текстов в персональные копии для каждого пользователя
- `0036_add_unique_index_notification_texts.sql` — добавление уникального индекса для предотвращения дублей текстов
- `0037_remove_preference_id_from_notification_texts.sql` — удаление колонки `preference_id` из таблицы `notification_texts` (тексты больше не связаны с notification_preferences напрямую)

**Применение:**

```bash
# Автоматически
pnpm db:migrate

# Вручную
psql -d mentai -f server/infrastructure/db/migrations/0021_refactor_generationMode_to_textSource.sql
psql -d mentai -f server/infrastructure/db/migrations/0022_refactor_habitId_topicKey_to_entityKey.sql
psql -d mentai -f server/infrastructure/db/migrations/0027_add_ai_notification_text_usage.sql
```

---

## 🔌 API Endpoints

### Глобальные настройки

- `GET /api/settings/preferences` — получить addressing и tone
- `PUT /api/settings/preferences` — обновить addressing и tone

### Локальные настройки уведомлений

- `GET /api/notifications/prefs` — все локальные настройки
- `GET /api/notifications/prefs/:kind` — настройки конкретного типа
- `GET /api/notifications/prefs/:kind?entityKey=:id` — настройки для конкретной сущности
- `PUT /api/notifications/prefs/:kind` — обновить настройки типа

**Пример запроса:**

```json
{
  "entityKey": "habit_123",
  "enabled": true,
  "timesPerDay": 3,
  "directness": "moderate",
  "subtype": "reminder",
  "textSource": "templates",
  "activeDays": [1, 2, 3, 4, 5],
  "timeRangeStart": 540, // 09:00
  "timeRangeEnd": 1350, // 22:30
  "customSlotTimes": [540, 720, 1080], // Кастомные времена
  "meta": {
    "textSource": "templates"
  }
}
```

### CRUD для привычек

- `GET /api/habits` — список привычек
- `POST /api/habits` — создать привычку
- `GET /api/habits/:id` — получить привычку
- `PUT /api/habits/:id` — обновить привычку
- `DELETE /api/habits/:id` — удалить привычку

### CRUD для кастомной терапии

- `GET /api/therapy/custom` — список кастомных тем
- `POST /api/therapy/custom` — создать тему
- `GET /api/therapy/custom/:id` — получить тему
- `PUT /api/therapy/custom/:id` — обновить тему
- `DELETE /api/therapy/custom/:id` — удалить тему

### Управление уведомлениями

- `POST /api/notifications/register-token` — регистрация FCM токена
- `POST /api/notifications/snooze` — отложить уведомление
- `POST /api/notifications/test` — отправить тестовое (dev only)
- `POST /api/notifications/interaction` — трекинг взаимодействия

### Управление текстами уведомлений

- `GET /api/notifications/texts?kind=habits|therapy&entityKey=:key&includeDeleted=false` — получить тексты для сущности
- `POST /api/notifications/texts` — получить тексты с фильтрами (subtype, directness, includeDeleted)
- `PUT /api/notifications/texts/batch` — batch-сохранение изменений (создание, обновление, удаление)
- `POST /api/notifications/texts/reset` — Вернуть тексты по умолчанию из presets

**Важно:** Все эндпоинты работают только с текстами текущего пользователя (`userId = текущий_пользователь`). Тексты с `userId IS NULL` больше не используются.

---

## 📚 Тексты уведомлений

Все тексты уведомлений хранятся в таблице `notification_texts` в БД с полной изоляцией данных пользователей:

- **Дефолтные тексты** (`userId = <user_id>`, `source='default'`) - персональные копии дефолтных текстов для каждого пользователя
- **Пользовательские тексты** (`userId = <user_id>`, `source='user'`) - кастомные тексты пользователя

**Важно:** В новой модели больше не используются тексты с `userId IS NULL`. Каждый пользователь работает только со своими текстами (`userId IS NOT NULL`).

**Lazy initialization:** При первом обращении к текстам автоматически копируются из `notification_text_presets` в персональные копии пользователя через сервис `initialize-texts.service.ts`.

**Freeze-модель пресетов:** После первой инициализации текстов для сущности, новые пресеты из `notification_text_presets` не попадут к существующим пользователям автоматически. Для обновления нужно использовать reset-эндпоинт или специальные миграции.

Тексты загружаются через сервис `notification-texts.service.ts`, который загружает только тексты текущего пользователя.

### Типы для Therapy

- `breath_cue` — дыхание 4-7-8, box-breathing
- `grounding` — 5-4-3-2-1, тактильный якорь
- `body_scan` — плечи, челюсть, живот
- `reframe` — рефрейминг мыслей
- `mi_prompt` — мотивационное интервьюирование
- `sos` — быстрый вызов SOS-карты

### Унифицированная структура идентификации

**Универсальное поле `entityKey`:**

- Единое поле для идентификации сущности (объединяет функциональность `type`, `habitKey`, `topic`)
- Для готовых привычек: ключ шаблона (`'water'`, `'smoking'`, `'sleep'` и др.)
- Для кастомных привычек: ID привычки из таблицы `habits` (nanoid, стабильный идентификатор)
- Для готовых тем терапии: ключ темы (`'anxiety'`, `'stress'`, `'mood'` и др.)
- Для кастомных тем терапии: ID темы из таблицы `therapy_topics_custom` (nanoid, стабильный идентификатор)

**Принципы идентификации:**

- Кастомные сущности используют стабильный ID (nanoid), который не меняется при изменении названия
- Шаблонные сущности используют статичные ключи, определенные в коде
- При удалении кастомной сущности автоматически удаляются все связанные данные (настройки, слоты, AI-тексты, использование текстов)

**Унификация настроек:**

- Все три настройки (`subtype`, `directness`, `textSource`) работают для всех типов сущностей
- Нет различий в обработке между готовыми и кастомными сущностями
- Единая логика фильтрации и выбора текстов

### Параметры шаблонов

- `addressing` — informal (ты) / formal (Вы) — берётся из `user_preferences`
- `directness` — soft / moderate / hard / universal — из `notification_preferences`
- `subtype` — reminder / informational / motivational / mixed — для всех типов сущностей
- `intent` — build / quit — только для привычек
- `entityKey` — универсальный идентификатор сущности (используется вместо `habitKey` для привычек и `topic` для терапии)

**Примечание:** Support Topics (темы поддержки) хранятся как статичный справочник в коде (`app/lib/therapyCatalog.ts`), а их настройки — в `notification_preferences` через поле `entityKey`.

---

## ⚙️ Планировщик слотов

Файл: `server/application/notifications/scheduler.service.ts`

### Архитектура

Планировщик организован как набор специализированных сервисов:

- **`scheduler.service.ts`** — тонкий фасад/оркестратор, координирует генерацию слотов
- **`global-orchestration.service.ts`** — глобальная оркестрация слотов для пользователя
- **`entity-key.service.ts`** — определение типа сущности (кастомная или шаблонная)
- **`slot-times.service.ts`** — генерация времен слотов с учётом кастомных времён
- **`prevent-overlap.service.ts`** — предотвращение одновременных уведомлений
- **`text-selection.service.ts`** — выбор текста для слота
- **`needs-regeneration.service.ts`** — проверка необходимости регенерации
- **`repositories/`** — репозитории для работы с БД (notification-preferences, notification-slots)

### Функции

- `generateAllSlotsForUser(userId)` — генерирует все слоты для пользователя с глобальной оркестрацией
- `regenerateSlotsForSource(userId, kind, options?)` — регенерирует слоты для конкретного источника
  - `options` может содержать `entityKey` для per-entity генерации
- `regenerateAllSlots()` — пересоздаёт слоты для всех пользователей (может использоваться для ручного запуска, админских задач, миграций)
- `triggerSlotRegeneration(userId, kind, options?)` — триггер при изменении настроек

### Конфигурация

- Окно бодрствования: 09:00 – 22:30 (локальное время)
- Джиттер: ±15 минут
- Горизонт: 2 дня (генерируем слоты на сегодня + завтра)
- Кастомные слоты: приоритет над автоматическими
- Минимальный шаг между уведомлениями: 10 минут (динамический для малого количества уведомлений)

### Алгоритм генерации

1. Получаем настройки с учётом `entityKey`
2. Получаем глобальные настройки (`addressing` из `user_preferences`)
3. Пересоздаём `planned` слоты в диапазоне регенерации (без удаления `queued`, см. `.docs/notification_slots_scaling_tz.md`)
4. Генерируем времена слотов:
   - Приоритет кастомным временам (`customSlotTimes`)
   - Остальные распределяются равномерно внутри окна (`timeRangeStart` - `timeRangeEnd`)
5. Для каждого слота:
   - Определяем `textSource` (templates/ai)
   - Выбираем текст (кастомные тексты → AI-тексты → шаблоны)
   - Создаём слот в БД

---

## 🤖 Режимы генерации текстов (textSource)

### Режимы

1. **`templates`** — использование готовых шаблонов или пользовательских текстов
   - Тексты загружаются из таблицы `notification_texts` в БД
   - **Изоляция данных**: Каждый пользователь имеет свои персональные копии дефолтных текстов (`user_id = <user_id>`, `source='default'`)
   - Пользовательские тексты хранятся в `notification_texts` с `user_id = <user_id>`, `source='user'`
   - Источником истины для дефолтных текстов является таблица `notification_text_presets` (read-only, только для разработчиков/админов)
   - При первом обращении к текстам автоматически копируются из presets в персональные копии пользователя (lazy initialization)
   - **Freeze-модель**: После первой инициализации новые пресеты не попадут к существующим пользователям автоматически
2. **`ai`** — тексты генерируются искусственным интеллектом
   - Используется OpenAI GPT (модель `gpt-4o-mini` для экономии)
   - Тексты сохраняются в `ai_generated_notification_texts`
   - Кэширование по `generationConfigHash`

### Логика выбора текста

```typescript
// Загрузка текстов из БД (для всех типов сущностей)
if (textSource === 'templates') {
  // Инициализируем тексты, если их еще нет (lazy init)
  await ensureUserTextsInitialized(userId, kind, entityKey);

  // Загружаем только тексты пользователя (userId = userId)
  const templateTexts = await db
    .select()
    .from(notificationTexts)
    .where(
      and(
        eq(notificationTexts.kind, kind),
        eq(notificationTexts.entityKey, entityKey),
        eq(notificationTexts.userId, userId), // ТОЛЬКО тексты пользователя
        eq(notificationTexts.isDeleted, false),
        // Фильтры по directness, addressing, intent, subtype
      )
    )
    .orderBy(asc(notificationTexts.id));

  // Выбираем текст из загруженных (с учётом уже использованных)
  text = selectTextFromPool(templateTexts, usedTexts);

}

if (!text && textSource === 'ai') {
  // Генерируем через AI
  text = await generateAiNotification({ ... });
}
```

### AI-генерация

**Таблица:** `ai_generated_notification_texts`

- Хранение сгенерированных текстов для переиспользования
- Кэширование по `generationConfigHash` (хеш настроек, влияющих на генерацию)
- Регенерация только при изменении релевантных параметров (название, описание, tone, addressing, directness, subtype, habitIntent, userGender, textSource)

**Таблица:** `ai_notification_text_usage` (отслеживание отправленных текстов)

- Хранит информацию о том, какие тексты из пула уже были отправлены
- Связь между текстами (`ai_text_id`), слотами (`slot_id`) и индексами текстов
- Предотвращает повторную отправку одного и того же текста

**AI Buffer Pool модель:**

- **Количество текстов по умолчанию**: 50 (настраивается через `AI_NOTIFICATIONS_DEFAULT_COUNT`)
- Генерируется большой пул текстов сразу, который используется постепенно
- Хватает на 10-14 дней при 3-5 уведомлениях в день
- Автоматическое пополнение при приближении к концу (менее 2 дней запаса)
- Защита от дублирования: отслеживание уже отправленных текстов через таблицу `ai_notification_text_usage`
- Retry механизм с exponential backoff для надежности генерации
- Динамический расчет токенов: `count * 200 + 5000` для гарантии получения всех текстов
- При изменении настроек (tone, addressing, directness, subtype, название, описание, habitIntent, userGender, textSource) происходит полная перегенерация всех 50 текстов с очисткой старых данных

**Конфигурация моделей:**

- Чат: `gpt-4o` (более мощная модель)
- Уведомления: `gpt-4o-mini` (экономичная модель)
- **Динамический расчет токенов**: `count * 200 + 5000` (для гарантии получения всех текстов)
- **Retry механизм**: автоматические повторы при ошибках с exponential backoff

---

## 👤 Пользовательские привычки и терапия

### Пользовательские привычки

- Создание через `/api/habits` с полями: название, тип, описание, emoji
- Настройки уведомлений через `/api/notifications/prefs/habits?entityKey=:id`
- **Управление текстами**: отдельная страница `/notifications/habits/[entityKey]/texts`
- Тексты хранятся в таблице `notification_texts` (до 100 текстов, каждый ≤ 178 символов)
- Плейсхолдер `{name}` для имени пользователя

### Пользовательские темы терапии

- Создание через `/api/therapy/custom` с полями: название, описание, emoji
- Настройки уведомлений через `/api/notifications/prefs/therapy?entityKey=:id`
- **Управление текстами**: отдельная страница `/notifications/therapy/[entityKey]/texts`
- Тексты хранятся в таблице `notification_texts` (до 100 текстов, каждый ≤ 178 символов)

### UI особенности

- **Унификация настроек**: Все три настройки (`subtype`, `directness`, `textSource`) доступны для всех типов сущностей (готовые и кастомные)
- **Редактор текстов**: Управление текстами доступно через отдельную страницу `/notifications/[kind]/[entityKey]/texts`
  - Inline-редактирование текстов (без per-row кнопок сохранения)
  - Batch-сохранение всех изменений одной кнопкой внизу страницы (`PUT /api/notifications/texts/batch`)
  - Фильтрация по `subtype` и `directness`
  - Восстановление дефолтных текстов из presets
- **Валидация**: максимум 178 символов на текст

---

## 🔔 Система очередей и воркеров

Архитектура основана на **BullMQ** и **Redis** для надёжной обработки фоновых задач.

### Очереди

1. **`notification-slots-generation`** — генерация слотов уведомлений

   - Воркер: `server/application/notifications/workers/notificationSlots.worker.ts`
   - Планировщик: `server/application/notifications/schedulers/notificationSlots.scheduler.ts`
   - Concurrency: 2 задачи параллельно
   - Для production используется масштабируемая модель из `.docs/notification_slots_scaling_tz.md` (sharding + cursor/cycle state, fairness, backpressure).
   - Для production обязателен process split: `scheduler (enqueue)` / `slots worker` / `delivery worker`.
   - Регенерация оценивается по фактическому горизонту `planned+queued` и `min_horizon_hours`; `queued` слоты при регенерации не удаляются.
   - Backpressure ориентируется на lag именно очереди `notification-slots-generation` (`queue_lag_p95` SLO, soft/hard пороги).

2. **`notification-delivery`** — отправка уведомлений через FCM

   - Воркер: `server/application/notifications/workers/notificationDelivery.worker.ts`
   - Concurrency: 10 задач параллельно
   - Обрабатывает задачи отправки уведомлений из очереди

3. **`ai-text-pool-refill`** — пополнение пула AI-генерированных текстов
   - Воркер: `server/application/notifications/workers/aiTextPool.worker.ts`
   - Планировщик: `server/application/notifications/schedulers/aiTextPool.scheduler.ts`
   - Concurrency: 3 задачи параллельно
   - Rate limiting: максимум 5 задач в секунду

### Функции доставки

Файл: `server/application/notifications/delivery.service.ts`

- `sendFCMNotification(token, payload)` — отправка через FCM
- `sendToUser(userId, payload)` — отправка всем устройствам пользователя

### Запуск

Все воркеры запускаются автоматически через плагин `server/plugins/bullmq-workers.ts` при старте Nitro сервера.

**Конфигурация:**

```bash
# По умолчанию воркеры включены
# Для масштабирования (scale > 1) отключить на web-контейнерах:
BULLMQ_ENABLE_WORKERS=false pnpm dev
```

**Redis:**

Для локальной разработки Redis запускается автоматически через Docker:

```bash
# Запуск Redis
pnpm dev:redis:up

# Проверка статуса
pnpm dev:redis:check

# Логи Redis
pnpm dev:redis:logs
```

---

## 🎨 Frontend Components

### Компоненты

- `SettingsGeneral.vue` — глобальные настройки (addressing, tone)
- `NotificationSettingsPage.vue` — универсальная страница настроек
- `WeekdaySelector.vue` — выбор дней недели
- `TimeRangeSelector.vue` — выбор окна времени
- `TimePicker.vue` — выбор конкретного времени

### Composables

- `useNotificationsSettings()` — работа с API
- `detectTimezone()` — автоопределение timezone
- `useCopyToClipboard()` — копирование в буфер обмена

### Страницы

- `/settings` → `SettingsGeneral.vue` (глобальные настройки)
- `/therapy` → список тем + настройка конкретной темы
- `/habits` → список привычек + настройка конкретной привычки

---

## 📱 Capacitor Push Notifications

Файл: `app/plugins/push-notifications.client.ts`

### Функциональность

- Регистрация FCM токена на сервере
- Обработка входящих push-уведомлений
- Трекинг взаимодействий (yes/no/later)
- Snooze через action buttons
- Deep link навигация

---

## 🚀 Установка и настройка

### 1. База данных

```bash
# Применить миграции
pnpm db:migrate
```

### 2. Firebase Setup (для production)

1. Создать Firebase проект: https://console.firebase.google.com
2. Включить Cloud Messaging
3. Скачать `google-services.json` для Android
4. Скачать `GoogleService-Info.plist` для iOS
5. Получить Service Account JSON для сервера

**Переменные окружения:**

```bash
# .env
NUXT_FIREBASE_SERVICE_ACCOUNT_JSON='{"type":"service_account",...}'
```

**Для Android:**

```bash
# Поместить google-services.json в
android/app/google-services.json
```

**Для iOS:**

```bash
# Поместить GoogleService-Info.plist в
ios/App/App/GoogleService-Info.plist
```

### 3. Redis (обязательно)

Redis используется для очередей BullMQ. Для локальной разработки:

```bash
# Запуск Redis через Docker (автоматически при pnpm dev)
pnpm dev:redis:up

# Проверка статуса
pnpm dev:redis:check

# Логи Redis
pnpm dev:redis:logs
```

**Переменные окружения:**

```bash
REDIS_HOST=127.0.0.1  # По умолчанию
REDIS_PORT=6379       # По умолчанию
REDIS_PASSWORD=       # Опционально
BULLMQ_ENABLE_WORKERS=true  # По умолчанию true
```

### 4. Установка зависимостей

#### Firebase Admin SDK (для production)

```bash
pnpm add firebase-admin
```

**Примечание:** BullMQ и ioredis уже установлены в проекте.

### 5. Запуск

**Development:**

```bash
# Запуск dev-сервера (автоматически запускает Redis и воркеры)
pnpm dev
```

**Production:**

```bash
# Воркеры запускаются автоматически при старте сервера
pnpm build
pnpm preview
```

---

## 🧪 Тестирование

### Тестовая отправка

1. Зарегистрировать устройство (автоматически при запуске приложения)
2. Перейти в `/therapy` или `/habits`
3. Включить уведомления
4. Нажать **"Отправить тест"**

### Проверка генерации слотов

```sql
SELECT * FROM notification_slots
WHERE user_id = YOUR_USER_ID
  AND status IN ('planned', 'queued')
ORDER BY scheduled_at;
```

### Проверка регистрации устройств

```sql
SELECT * FROM user_devices
WHERE user_id = YOUR_USER_ID;
```

### Создание тестового слота "через 1 минуту"

Для быстрого тестирования можно создать слот через 1 минуту:

1. Нажать кнопку **"🔔 Тест через 1 мин"**
2. Появится toast: "Тестовое уведомление запланировано через 1 минуту!"
3. Задача автоматически попадает в очередь `notification-delivery` и обрабатывается воркером

---

## 🐛 Troubleshooting

### Push-уведомления не приходят

1. Проверить что устройство зарегистрировано:

   ```sql
   SELECT * FROM user_devices WHERE user_id = YOUR_USER_ID;
   ```

2. Проверить что слоты генерируются:

   ```sql
   SELECT * FROM notification_slots WHERE user_id = YOUR_USER_ID AND status IN ('planned', 'queued');
   ```

3. Проверить логи воркеров:

   ```bash
   # В консоли сервера должны быть логи вида:
   [Notification Delivery Worker] ✅ Job completed
   [Notification Slots Worker] ✅ Job completed
   [AI Text Pool Worker] ✅ Job completed
   ```

4. Проверить Firebase настройки (если используется production FCM).

### Ошибки миграции

Если миграция не применилась, выполнить вручную:

```bash
psql -d YOUR_DB_NAME -f server/infrastructure/db/migrations/0021_refactor_generationMode_to_textSource.sql
psql -d YOUR_DB_NAME -f server/infrastructure/db/migrations/0022_refactor_habitId_topicKey_to_entityKey.sql
```

### Dev-превью не отображается

Проверить что:

1. Глобальные настройки загружены (`addressing`, `tone`)
2. Локальные настройки загружены (`directness`, `subtype`)
3. В каталоге шаблонов есть подходящий шаблон

### Ошибка: "column entity_key does not exist"

**Решение:** Применить миграции БД

```bash
# Применить все миграции
npm run db:push

# Или вручную применить необходимые миграции
psql -d mentai -f server/infrastructure/db/migrations/0021_refactor_generationMode_to_textSource.sql
psql -d mentai -f server/infrastructure/db/migrations/0022_refactor_habitId_topicKey_to_entityKey.sql
```

### Ошибка: "No template found"

**Причина:** Нет шаблонов с нужными параметрами

**Решение:** Добавьте больше текстов в таблицу `notification_texts` в БД или проверьте фильтрацию по `entityKey` и другим параметрам. Все тексты должны быть в БД, fallback на код удален.

---

## 📊 MVP Scope

### ✅ Реализовано

- ✅ База данных (таблицы, индексы, constraints)
  - ✅ Добавлена поддержка `entityKey` в `notification_preferences` и `notification_slots`
  - ✅ Добавлена поддержка `textSource` для режимов генерации
  - ✅ Добавлена поддержка `customSlotTimes` для кастомных слотов
- ✅ API эндпоинты (настройки, привычки, токены, snooze, трекинг)
- ✅ Каталог шаблонов (therapy типы с addressing/directness)
- ✅ Планировщик слотов (генерация на 7 дней с джиттером)
  - ✅ Поддержка генерации для конкретных сущностей через entityKey
  - ✅ Поддержка кастомных слотов времени
- ✅ Система очередей BullMQ (генерация слотов, отправка уведомлений, пополнение AI-текстов)
- ✅ UI компоненты (глобальные и локальные настройки, превью)
- ✅ Capacitor интеграция (регистрация токенов, обработка уведомлений, snooze)
- ✅ Пользовательские привычки и тексты
- ✅ Пользовательские темы терапии
- ✅ Режимы генерации текстов (templates/ai)

### 🔜 Следующие шаги

- ⏳ Firebase Admin SDK (настройка FCM для production)
- ⏳ Habit logs и streak (чек-ины, графики выполнения)
- ⏳ Support logs (отметки состояния, динамика)
- ⏳ Оркестрация (управление лимитами при нескольких типах)
- ⏳ Статистика и отчёты (графики, метрики, рекомендации)
- ⏳ Мониторинг очередей BullMQ (метрики, дашборды)

---

## 🏗 Масштабирование

### Текущая реализация

- **BullMQ + Redis** — надёжная система очередей
- **Автоматические воркеры** — обработка задач в фоне
- **PostgreSQL** — хранение данных
- **Горизонтальное масштабирование** — поддержка нескольких воркеров
- Подходит для ~1000 пользователей, ~10K уведомлений/день

### Production рекомендации

1. **Отдельный worker-service** — вынести воркеры в отдельный контейнер при масштабировании
2. **Мониторинг очередей** — метрики BullMQ, алерты, логи
3. **Rate limiting** — глобальные лимиты для защиты от перегрузки
4. **Redis кластер** — для высокой доступности в production

---

## 📝 Примечания

### Обратная совместимость

Все идентификаторы используют стабильный ID (nanoid), который не меняется при изменении названия сущности.

### Производительность

- Все запросы используют индексы
- SSR-safe fetching (useFetch)
- Оптимизированные SQL запросы

### Безопасность

- Валидация через Zod DTO
- Аутентификация через JWT
- Обработка невалидных токенов

---

## 📝 История изменений

### Унификация структуры шаблонов (✅ Реализовано)

**Цель:** Унифицировать структуру шаблонов уведомлений для привычек и терапии через единое поле `entityKey`.

**Реализация:**

- Используется единое поле `entityKey` для идентификации сущностей (вместо отдельных полей `type`, `habitKey`, `topic`)
- Поле `subtype` добавлено для терапии (унификация с привычками)
- Унифицированы настройки: все три настройки (`subtype`, `directness`, `textSource`) работают для всех типов сущностей

**Результат:** Единая логика обработки для готовых и кастомных сущностей, упрощение кодовой базы.

### Редактор текстов уведомлений (✅ Реализовано)

**Цель:** Единая система управления текстами уведомлений для всех типов сущностей.

**Архитектура:**

- Все тексты хранятся в таблице `notification_texts` в БД
- Изоляция данных пользователей: каждый пользователь работает только со своими текстами
- Lazy initialization: тексты копируются из `notification_text_presets` при первом обращении
- Freeze-модель: новые пресеты не попадают к существующим пользователям автоматически

**UI:**

- Отдельная страница `/notifications/[kind]/[entityKey]/texts` с полноценным редактором
- Inline-редактирование с batch-сохранением через `PUT /api/notifications/texts/batch`
- Фильтрация по `subtype` и `directness`
- Восстановление дефолтных текстов из presets

---

## 🔗 Связанные документы

- `.docs/architecture.md` — Общая архитектура проекта
- `.docs/mentai_tz_product.md` — Общие требования к продукту
- `.docs/mentai_tz_frontend.md` — Требования к фронтенду
- `.docs/mentai_tz_backend.md` — Требования к бэкенду
- `.docs/security_requirements.md` — Требования к безопасности

---

**При вопросах обращайтесь к команде разработки Mentai.**
