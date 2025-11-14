# ТЗ v2: Персонализированные уведомления Mentai (AI-оркестрация)

_Версия_: 2.2 • _Дата_: 2025-11-05

## Цель

Создать персональные push-уведомления в двух разделах приложения:

- **Терапия** (therapy) — эмоциональные и дыхательные напоминания.
- **Привычки** (habits) — формирование и отслеживание пользовательских привычек.

Каждое уведомление настраивается по частоте, тону и стилю подачи. Система автоматически распределяет время уведомлений с джиттером. Предусмотрен Snooze и dev-превью.

**Примечание:** Реализация начинается только с типа `therapy`. Тип `habits` добавляется позже, но архитектура должна поддерживать его изначально.

---

## 1) Пользовательские настройки

### Глобальные настройки уведомлений

Эти параметры действуют на всё приложение (в том числе на речь и стиль аватара):

- `addressing: 'informal' | 'formal'` — обращение («ты» / «Вы»).
- `tone: 'delicate' | 'neutral' | 'uplifting' | 'resolute' | 'demanding'` — тон общения (см. раздел 2).

**Где настраиваются:** Страница "Общие настройки" (`/settings/general`).

**Где хранятся:** В таблице `user_preferences` (или в расширении таблицы `profiles`).

**Влияние:** Глобальные настройки влияют на:

- Стиль общения AI-ассистента в чате
- Стиль речи аватара (если включён)
- Текст всех push-уведомлений (в сочетании с локальным `directness`)

---

### Локальные настройки (по типу уведомлений)

Каждый раздел (Терапия и Привычки) имеет свои настройки:

- `enabled: boolean` — вкл/выкл уведомлений для типа.
- `frequency: { mode: 'per_day', timesPerDay: number }` — количество уведомлений в день (1–5, конфигурируемо до 8).
- `directness: 'soft' | 'moderate' | 'hard'` — **стиль подачи** (см. раздел 3).
- `timezone: string` — IANA TZ. Автоопределение на устройствах и в браузере; храним на бэке.
- `habitId?: string` — опционально, для привычек: идентификатор конкретной привычки (если настройки индивидуальны для каждой привычки).

**Где настраиваются:**

- Терапия: на странице раздела "Терапия" (`/therapy` или `/support/notifications`).
- Привычки: на странице раздела "Привычки" (`/habits/notifications`), возможно индивидуально для каждой привычки.

**Валидация:**

- `timesPerDay` ∈ [1..5] (границы из конфига).
- Все перечисления — строгие enum.
- `timezone` — валидная IANA (fallback: данные устройства/браузера).

> В UI не показываем: дни недели, DND, окно рандомизации, выбор каналов доставки.

---

## 2) Варианты тона и примеры текста

Тон — это стиль формулировки (не путать с «жёсткостью» контента). Для каждого тона ниже — по 2 примера на «informal» и на «formal». Плейсхолдеры: `{name}` (одинарные фигурные скобки).

### • delicate — Деликатный

- **informal**: «Сделай небольшой вдох‑выдох, {name}. Заметь 3 вещи вокруг.»
- **formal**: «Сделайте небольшой вдох‑выдох, {name}. Отметьте 3 вещи вокруг.»

### • neutral — Нейтральный

- **informal**: «Проведи 3 цикла дыхания 4‑7‑8. Фокус на длинном выдохе.»
- **formal**: «Выполните 3 цикла дыхания 4‑7‑8. Сфокусируйтесь на длинном выдохе.»

### • uplifting — Воодушевляющий

- **informal**: «Отличный момент для короткой паузы, {name} — 3 цикла 4‑7‑8, и вперед!»
- **formal**: «Хороший момент для короткой паузы, {name} — 3 цикла 4‑7‑8, продолжим!»

### • resolute — Решительный

- **informal**: «Сейчас пауза: 5‑4‑3‑2‑1. Заверши и возвращайся к задаче.»
- **formal**: «Сейчас пауза: 5‑4‑3‑2‑1. Завершите и возвращайтесь к задаче.»

### • demanding — Требовательный

- **informal**: «Стоп. 3 цикла 4‑7‑8 прямо сейчас. Соберись.»
- **formal**: «Стоп. 3 цикла 4‑7‑8 прямо сейчас. Соберитесь.»

---

## 3) Стиль подачи (directness)

**В UI отображается как:** "Стиль подачи" или "Стиль напоминаний".

**Описание:** Определяет, насколько прямо формулируются уведомления — от мягких до директивных. Влияет только на тексты уведомлений конкретного раздела.

**Варианты:**

- **soft — Мягко**: поддержка, без давления.  
  Пример: «Сделай короткую паузу и три дыхания.»
- **moderate — Умеренно**: конкретнее, но корректно.  
  Пример: «Пора сделать 3 цикла дыхания 4-7-8.»
- **hard — Жёстко**: максимальная директивность, без грубости.  
  Пример: «Сейчас пауза. Сделай 3 цикла 4-7-8.»

**Примечание:** В API и базе данных поле называется `directness`, но в UI отображается как "Стиль подачи" для лучшего понимания пользователем.

---

## 4) Типы шаблонов и Therapy Topics

### Для Поддержки (therapy)

**Техники (типы шаблонов):**

- **breath_cue** — дыхание 4‑7‑8 или box‑breathing (30–60 сек).
- **grounding** — 5‑4‑3‑2‑1, «3 вещи вокруг», тактильный якорь.
- **body_scan** — «плечи/челюсть/живот → отпусти».
- **reframe** — автоматическая мысль → альтернативная интерпретация.
- **mi_prompt** — открытый вопрос (мотивационное интервьюирование).
- **sos** — быстрый вызов SOS‑карты при высокой тревоге.

**Therapy Topics (темы терапии):**

Пользователь может выбрать одну или несколько тем, актуальных для его текущего состояния. Каждая тема имеет свой набор уведомлений:

| №   | Key          | Название             | Описание                                          |
| --- | ------------ | -------------------- | ------------------------------------------------- |
| 1   | `anxiety`    | Тревога и паника     | Снижение тревожности, восстановление безопасности |
| 2   | `stress`     | Стресс и выгорание   | Снятие перенапряжения, отдых                      |
| 3   | `mood`       | Низкое настроение    | Повышение энергии, активация                      |
| 4   | `sleep`      | Сон и восстановление | Помощь при засыпании, режим                       |
| 5   | `anger`      | Раздражительность    | Управление импульсами                             |
| 6   | `selfesteem` | Самооценка           | Снижение самокритики                              |
| 7   | `focus`      | Прокрастинация       | Повышение концентрации                            |
| 8   | `relations`  | Отношения и границы  | Поддержка в конфликтах                            |
| 9   | `grief`      | Потери и горе        | Помощь при утрате                                 |
| 10  | `sos`        | Экстренная поддержка | Быстрая стабилизация                              |

**Примечание:** Темы хранятся как статичный справочник в коде (`app/lib/therapyCatalog.ts`), а настройки уведомлений для каждой темы — в `notification_preferences` через поле `topicKey`.

### Для Привычек (habits)

- **steps** — шаги, физическая активность.
- **water** — питье воды.
- **sleep** — сон и режим дня.
- **quit** — отказ от вредных привычек (курение, алкоголь и т.д.).
- **training** — тренировки, спорт.
- **custom** — пользовательские привычки.

**Формат элемента каталога:**

```json
{
  "id": "psy_breath_478_01",
  "kind": "therapy",
  "type": "breath_cue",
  "addressing": ["informal", "formal"],
  "tone": ["delicate", "neutral", "uplifting", "resolute", "demanding"],
  "directness": ["soft", "moderate", "hard"],
  "ru": {
    "informal": {
      "soft": "Сделай 3 тихих цикла дыхания. Начни с первого.",
      "moderate": "Сделай 3 цикла 4‑7‑8. Держи фокус на выдохе.",
      "hard": "Сейчас 3 цикла 4‑7‑8. Действуй."
    },
    "formal": {
      "soft": "Сделайте 3 тихих цикла дыхания. Начните с первого.",
      "moderate": "Сделайте 3 цикла 4‑7‑8. Держите фокус на выдохе.",
      "hard": "Сейчас 3 цикла 4‑7‑8. Действуйте."
    }
  }
}
```

**Примечания:**

- Плейсхолдер `{name}` подставляется из профиля пользователя; если имя пустое, текст используется без обращения.
- Каталог хранится статично на фронте в `/app/lib/notificationTemplates.ts` (аналогично `promptsCatalog.ts`).
- При подборе шаблона используются: **глобальные** `addressing` и `tone` (из `user_preferences`) + **локальный** `directness` (из `notification_preferences`).
- В MVP можно начать с 3–4 типов шаблонов для Поддержки, остальные добавить позже.

---

## 5) Архитектура и стек

### Клиент (Nuxt 3 + Capacitor)

- **Nuxt 3** — запросы к API.
- **Capacitor Push Notifications** — разрешения, токен, обработка кликов и действий (Snooze через сервер).

### Сервер (Nitro / Nuxt 4 Server)

- **Модули**: prefs, templates, slots, delivery, test, snooze.
- **Очереди**: BullMQ + Redis — генерация слотов на 7–14 дней, отправка.
- **БД**: PostgreSQL (Drizzle ORM).
- **Отправка**: Firebase Admin (FCM); APNs через FCM.

---

## 6) Контракты API

### Habits (CRUD)

- `GET /api/habits` — список привычек пользователя.

```json
[
  {
    "id": "habit_123",
    "name": "Пить воду",
    "category": "health",
    "emoji": "💧",
    "createdAt": "2025-01-01T00:00:00Z"
  },
  {
    "id": "habit_456",
    "name": "Бросить курить",
    "category": "quit",
    "emoji": "🚭",
    "createdAt": "2025-01-02T00:00:00Z"
  }
]
```

- `POST /api/habits` — создать привычку:

```json
{ "name": "Пить воду", "category": "health", "emoji": "💧" }
```

- `PUT /api/habits/:id` — обновить привычку:

```json
{ "name": "Пить воду (2 л)", "category": "health", "emoji": "💧" }
```

- `DELETE /api/habits/:id` — удалить привычку.

**Заметки:**

- Связка с уведомлениями — через `notification_preferences.habitId`.
- При удалении привычки: будущие `notification_slots` по `habitId` помечать как `skipped` или удалять (по политике проекта).
- Категории: `'health' | 'quit' | 'productivity' | 'custom'`.

---

### Глобальные настройки уведомлений

- `GET /api/settings/preferences` — получить глобальные настройки пользователя (включая `addressing` и `tone`).

```json
{
  "addressing": "informal",
  "tone": "resolute"
}
```

- `PUT /api/settings/preferences` — сохранить глобальные настройки:

```json
{
  "addressing": "informal",
  "tone": "resolute"
}
```

**Примечание:** Эти настройки влияют на всё приложение (AI, аватар, уведомления).

---

### Локальные настройки уведомлений (по типу)

Все эндпоинты имеют префикс `/api/notifications/`:

- `GET /api/notifications/prefs` — получить все локальные настройки пользователя (все типы: therapy, habits).
- `GET /api/notifications/prefs/:kind` — получить локальные настройки конкретного типа (`therapy` | `habits`).
- `PUT /api/notifications/prefs/:kind` — сохранить локальные настройки:

```json
{
  "enabled": true,
  "frequency": { "mode": "per_day", "timesPerDay": 3 },
  "directness": "moderate",
  "timezone": "Europe/Moscow",
  "habitId": "habit_123" // опционально, только для habits
}
```

**Примечание:** `addressing` и `tone` берутся из глобальных настроек, не передаются в локальных.

- `POST /api/notifications/test` — отправка тестового push-уведомления (только для dev/staging):

```json
{ "kind": "therapy" }
```

**Примечание:** В production этот endpoint должен быть отключён или требовать специальных прав.

- `POST /api/notifications/snooze` — отложить ближайшее уведомление:

```json
{ "kind": "therapy", "duration": "15m", "habitId": null }
```

Доступные значения `duration`: `"15m"`, `"1h"`, `"4h"`, `"tomorrow"`.

#### Per-habit поведение

- Если указан `habitId`, откладывается ближайший слот **именно этой привычки** (`kind="habits"` + `habitId`).
- Если `habitId` не указан и `kind="habits"`, откладывается ближайший слот по приоритету среди всех активных привычек пользователя.
- Для `kind="therapy"` `habitId` всегда `null`.

- `POST /api/notifications/register-token` — регистрация/обновление FCM токена устройства:

```json
{ "token": "fcm_token_string", "platform": "ios" | "android" | "web" }
```

**Описание:**

- **Idempotent upsert**: если токен уже существует для пользователя, обновляется `lastSeen` и `updatedAt`.
- Если токен принадлежит другому пользователю, создаётся новая запись (или перемещается, в зависимости от политики).
- **Очистка невалидных токенов**: при получении ошибок от FCM (`InvalidRegistrationToken`, `NotRegistered`) токен автоматически удаляется из `user_devices`.
- **Валидация**: `platform` должен быть одним из `'ios' | 'android' | 'web'`, `token` не может быть пустым.

---

## 7) Схема данных (Drizzle ORM)

Все таблицы описаны декларативно в стиле Drizzle ORM. Таблицы и поля в БД используют `snake_case`, в схеме TypeScript — `camelCase` (соответствие полям БД через параметр). Тип `userId` — `integer` для совместимости с существующими таблицами (`users`).

```ts
import {
  pgTable,
  text,
  integer,
  boolean,
  timestamp,
  date,
  jsonb,
  varchar,
  real,
} from 'drizzle-orm/pg-core';

// Таблица привычек (владеет пользователь)
export const habits = pgTable('habits', {
  id: text('id').primaryKey(),
  userId: integer('user_id').notNull(),
  name: varchar('name', { length: 120 }).notNull(),
  category: varchar('category', { length: 50 }).notNull(), // 'health' | 'quit' | 'productivity' | 'custom'
  emoji: varchar('emoji', { length: 8 }), // напр.: "💧", "🚭"
  createdAt: timestamp('created_at', { withTimezone: true })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .defaultNow()
    .notNull(),
});

// Глобальные настройки пользователя (влияют на всё приложение)
// Примечание: Можно добавить в таблицу profiles или создать отдельную таблицу user_preferences
export const userPreferences = pgTable('user_preferences', {
  id: text('id').primaryKey(),
  userId: integer('user_id').notNull().unique(), // один набор настроек на пользователя
  addressing: varchar('addressing', { length: 20 })
    .notNull()
    .default('informal'), // 'informal' | 'formal'
  tone: varchar('tone', { length: 20 }).notNull().default('neutral'), // 'delicate' | 'neutral' | 'uplifting' | 'resolute' | 'demanding'
  createdAt: timestamp('created_at', { withTimezone: true })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .defaultNow()
    .notNull(),
});

// Локальные настройки пользователя для каждого типа уведомлений
// Примечание: ID генерируются в коде при вставке через nanoid() (аналогично sessions с randomUUID())
export const notificationPreferences = pgTable('notification_preferences', {
  id: text('id').primaryKey(),
  userId: integer('user_id').notNull(),
  kind: varchar('kind', { length: 20 }).notNull(), // 'therapy' | 'habits'
  habitId: varchar('habit_id', { length: 255 }), // опционально, для habits: идентификатор конкретной привычки (FK → habits.id)
  topicKey: varchar('topic_key', { length: 50 }), // опционально, для therapy: ключ темы поддержки ('anxiety' | 'stress' | 'mood' | ...)
  enabled: boolean('enabled').default(true).notNull(),
  timesPerDay: integer('times_per_day').notNull(),
  directness: varchar('directness', { length: 20 }).notNull(), // 'soft' | 'moderate' | 'hard'
  timezone: varchar('timezone', { length: 100 }).notNull(), // IANA timezone, например "Europe/Moscow"
  meta: jsonb('meta'), // опционально: дополнительные параметры (techniques и др.)
  createdAt: timestamp('created_at', { withTimezone: true })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .defaultNow()
    .notNull(),
});

// Запланированные слоты уведомлений
export const notificationSlots = pgTable('notification_slots', {
  id: text('id').primaryKey(),
  userId: integer('user_id').notNull(),
  kind: varchar('kind', { length: 20 }).notNull(), // 'therapy' | 'habits'
  habitId: varchar('habit_id', { length: 255 }), // опционально, для habits: идентификатор конкретной привычки (FK → habits.id)
  topicKey: varchar('topic_key', { length: 50 }), // опционально, для therapy: ключ темы поддержки ('anxiety' | 'stress' | 'mood' | ...)
  scheduledAt: timestamp('scheduled_at', { withTimezone: true }).notNull(), // UTC с применённым джиттером
  payload: jsonb('payload').notNull(), // { title, body, templateId, action, deepLink, ... }
  templateId: varchar('template_id', { length: 255 }),
  status: varchar('status', { length: 20 }).notNull().default('planned'), // planned | sent | skipped | failed
  snoozedUntil: timestamp('snoozed_until', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true })
    .defaultNow()
    .notNull(),
});

// Регистрация FCM токенов устройств пользователя
export const userDevices = pgTable('user_devices', {
  id: text('id').primaryKey(),
  userId: integer('user_id').notNull(),
  token: text('token').notNull().unique(), // FCM token (уникальный)
  platform: varchar('platform', { length: 20 }).notNull(), // 'ios' | 'android' | 'web'
  lastSeen: timestamp('last_seen', { withTimezone: true }).defaultNow(),
  createdAt: timestamp('created_at', { withTimezone: true })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .defaultNow()
    .notNull(),
});

// Факты взаимодействия пользователя с уведомлениями (для статистики)
// См. также раздел 13 про трекинг
export const notificationInteractions = pgTable('notification_interactions', {
  id: text('id').primaryKey(),
  slotId: text('slot_id').notNull(),
  userId: integer('user_id').notNull(),
  action: varchar('action', { length: 20 }).notNull(), // 'yes' | 'no' | 'later' | 'dismissed' | 'unanswered'
  actionAt: timestamp('action_at', { withTimezone: true }).defaultNow(),
  meta: jsonb('meta'), // дополнительные данные
  kind: varchar('kind', { length: 20 }).notNull(), // 'therapy' | 'habits' (денормализация)
  type: varchar('type', { length: 50 }), // breath_cue | grounding | body_scan | reframe | mi_prompt | sos | custom
  metric: varchar('metric', { length: 50 }), // steps | training | breath | ... (для habits)
  createdAt: timestamp('created_at', { withTimezone: true })
    .defaultNow()
    .notNull(),
});

// Дневная агрегация метрик (для графиков и отчётов)
// См. также раздел 13 про трекинг
export const dailyAdherence = pgTable('daily_adherence', {
  id: text('id').primaryKey(),
  userId: integer('user_id').notNull(),
  date: date('date').notNull(), // DATE (UTC), например '2025-01-15'
  kind: varchar('kind', { length: 20 }).notNull(), // 'therapy' | 'habits'
  asked: integer('asked').notNull().default(0), // всего вопросов/заданий в этот день
  yes: integer('yes').notNull().default(0),
  no: integer('no').notNull().default(0),
  later: integer('later').notNull().default(0),
  dismissed: integer('dismissed').notNull().default(0),
  unanswered: integer('unanswered').notNull().default(0),
  completionRate: real('completion_rate').notNull().default(0), // yes / asked (0.0 - 1.0)
  streak: integer('streak').notNull().default(0), // текущая серия дней с completionRate >= threshold
  createdAt: timestamp('created_at', { withTimezone: true })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .defaultNow()
    .notNull(),
});
```

**Примечание:** Поле `updatedAt` обновляется на уровне ORM сервисов при выполнении UPDATE-операций (не автоматически через БД). В Drizzle ORM `.defaultNow()` устанавливает только значение по умолчанию при вставке, но не обновляет его автоматически при изменении записи.

**Индексы и constraints (добавляются через SQL миграции):**

```sql
-- Habits
CREATE INDEX "habits_user_id_idx" ON "habits" ("user_id");
CREATE UNIQUE INDEX "habits_user_id_name_unique" ON "habits" ("user_id", "name");

-- UserPreferences: один набор настроек на пользователя
CREATE UNIQUE INDEX "user_preferences_user_id_idx"
  ON "user_preferences" ("user_id");

-- NotificationPreferences: уникальность зависит от kind
-- Для therapy без topicKey: общие настройки (userId + kind, без habitId и topicKey)
CREATE UNIQUE INDEX "notification_preferences_user_therapy_general"
  ON "notification_preferences" ("user_id", "kind")
  WHERE kind = 'therapy' AND topic_key IS NULL AND habit_id IS NULL;
-- Для therapy с topicKey: per-topic настройки (userId + kind + topicKey)
CREATE UNIQUE INDEX "notification_preferences_user_therapy_topic"
  ON "notification_preferences" ("user_id", "kind", "topic_key")
  WHERE kind = 'therapy' AND topic_key IS NOT NULL;
-- Для habits: per-habit настройки (userId + kind + habitId)
CREATE UNIQUE INDEX "notification_preferences_user_habits"
  ON "notification_preferences" ("user_id", "kind", "habit_id")
  WHERE kind = 'habits' AND habit_id IS NOT NULL;
-- Общий индекс по userId
CREATE INDEX "notification_preferences_user_id_idx"
  ON "notification_preferences" ("user_id");
-- Индекс по topicKey для быстрой выборки
CREATE INDEX "notification_preferences_topic_key_idx"
  ON "notification_preferences" ("topic_key")
  WHERE topic_key IS NOT NULL;

-- NotificationSlots: индексы для выборки по пользователю и времени
CREATE INDEX "notification_slots_user_id_kind_status_idx"
  ON "notification_slots" ("user_id", "kind", "status");
CREATE INDEX "notification_slots_user_id_scheduled_at_idx"
  ON "notification_slots" ("user_id", "scheduled_at");
CREATE INDEX "notification_slots_habit_id_idx"
  ON "notification_slots" ("habit_id")
  WHERE habit_id IS NOT NULL;
CREATE INDEX "notification_slots_topic_key_idx"
  ON "notification_slots" ("topic_key")
  WHERE topic_key IS NOT NULL;

-- UserDevices: индекс по userId (unique на token уже есть через constraint)
CREATE INDEX "user_devices_user_id_idx"
  ON "user_devices" ("user_id");

-- FK-constraints (целостность данных)
ALTER TABLE "notification_preferences"
  ADD CONSTRAINT "notification_preferences_habit_fk"
  FOREIGN KEY ("habit_id") REFERENCES "habits" ("id")
  ON DELETE CASCADE;

ALTER TABLE "notification_slots"
  ADD CONSTRAINT "notification_slots_habit_fk"
  FOREIGN KEY ("habit_id") REFERENCES "habits" ("id")
  ON DELETE SET NULL;

-- Если в проекте есть таблица users, раскомментируйте:
-- ALTER TABLE "notification_slots"
--   ADD CONSTRAINT "notification_slots_user_fk"
--   FOREIGN KEY ("user_id") REFERENCES "users" ("id");

ALTER TABLE "notification_interactions"
  ADD CONSTRAINT "notification_interactions_slot_fk"
  FOREIGN KEY ("slot_id") REFERENCES "notification_slots" ("id")
  ON DELETE CASCADE;

-- Индекс для due-выборки воркером (ускоряет поиск слотов к отправке)
CREATE INDEX "notification_slots_due_idx"
  ON "notification_slots" ("status", "scheduled_at")
  WHERE status = 'planned';

-- NotificationInteractions: индекс для аналитики по пользователю
CREATE INDEX "notification_interactions_user_id_kind_action_at_idx"
  ON "notification_interactions" ("user_id", "kind", "action_at");

-- DailyAdherence: уникальная тройка userId + date + kind
CREATE UNIQUE INDEX "daily_adherence_user_id_date_kind_idx"
  ON "daily_adherence" ("user_id", "date", "kind");
CREATE INDEX "daily_adherence_user_id_kind_date_idx"
  ON "daily_adherence" ("user_id", "kind", "date");
```

---

## 8) Планировщик и генерация слотов

### Триггеры генерации

- При включении уведомлений (`enabled: true`) для типа `kind`.
- При изменении настроек (`PUT /api/notifications/prefs/:kind`).
- Для `habits`: при создании/обновлении/удалении привычки — пересчитать будущие слоты только для затронутой привычки (`habitId`).
- Ночной cron (00:30 UTC) — докидывание горизонта на следующие 7 дней.

### Горизонт планирования

- Генерируем слоты на **7 дней** вперёд (в будущем можно расширить до 14).
- При изменении настроек пересоздаём все будущие слоты конкретного `kind`.

### Алгоритм распределения

- **Окно бодрствования**: фиксированное **09:00–22:30** локальной TZ пользователя (в MVP).
- Равномерное распределение `timesPerDay` по дню в окне бодрствования.
- Скрытый **джиттер** `±randomizeWindowMin` (10–20 минут) — только на бэке (не в UI).
- Воркер каждые N минут (например, каждые 5 минут) извлекает «due»‑слоты (`scheduledAt <= now()`, `status = "planned"`), получает глобальные настройки (`addressing`, `tone`) из `user_preferences` и локальные настройки (`directness`) из `notification_preferences` **по связке (kind [, habitId])**, подбирает шаблон по комбинации `addressing + tone + directness (+ type)`, подставляет плейсхолдеры и отправляет через FCM.

**Идея генерации расписания:**

Генерация расписания выполняется по каждой активной записи `notification_preferences`:

- Для `therapy`: ровно одна запись (без `habitId`).
- Для `habits`: одна запись на каждую активную привычку (с `habitId`).

#### Правила TZ/DST (часовые пояса и переходы)

- Генерируем расписание в локальной TZ пользователя на ближайшие сутки (rolling window).
- В БД все времена храним в UTC.
- При смене пользователем `timezone` пересоздаём все будущие слоты для соответствующих записей `notification_preferences`.
- При переходах на летнее/зимнее время возможны сдвиги; джиттер применяется после расчёта локального времени.

### Обработка ошибок при отправке

- При ошибке отправки: 3 ретрая с экспоненциальной задержкой (1m, 5m, 25m).
- Пометка слота как `failed` после исчерпания ретраев.
- Обработка невалидных токенов: удаление из `user_devices` при ответе FCM `InvalidRegistrationToken` или `NotRegistered`.

---

## 9) Snooze

Готовые пресеты: **15 минут / 1 час / 4 часа / до завтра**.

### Алгоритм

1. Пользователь нажимает кнопку "Later" в push-уведомлении или вызывает `POST /api/notifications/snooze`.
2. Сервер находит ближайший слот с `kind` и `status = "planned"`.
3. Сервер пересоздаёт слот с новым `scheduledAt` (текущее время + `duration`) и устанавливает `snoozedUntil`.
4. Отправляется **новый push** на новое время (если оно попадает в окно бодрствования).
5. Требуется сеть (в офлайне Snooze недоступен).

---

## 10) Dev‑превью

**Локальная генерация на фронте без запроса к API.**

### Алгоритм

1. При изменении формы настроек (toggle, выбор `directness` для локальных настроек или `addressing`/`tone` для глобальных) — автоматически генерируется превью.
2. На фронте: случайный подходящий шаблон из каталога по комбинации:
   - `kind` (из текущего раздела)
   - `addressing` (из глобальных настроек)
   - `tone` (из глобальных настроек)
   - `directness` (из локальных настроек текущего раздела)
3. Подстановка плейсхолдера `{name}` из профиля пользователя (если есть).
4. Отображение карточки с `templateId` и итоговым текстом **inline под формой**.

**Примечание:** Endpoint `/api/notifications/preview` можно добавить позже, если понадобится серверная генерация.

---

## 11) Оркестрация при нескольких типах (therapy + habits)

> **Примечание:** В MVP реализуем только `therapy`. Оркестрация потребуется позже, когда будет добавлен `habits`.

Если пользователь включает оба типа и задаёт по 5 напоминаний/день (в сумме до 10), используем глобальную оркестрацию, чтобы избежать перегруза.

### Глобальные правила

- **Глобальный лимит/день**: по умолчанию 8 (конфиг), даже если суммарно настроено больше.
- **Лимит в час**: не более 2 уведомлений/час на пользователя.
- **Шаг между уведомлениями**: минимум 25 минут.
- **Приоритизация типов**: `therapy` > `habits` (настраиваемо в конфиге).
- **Джиттер**: скрытый ±10–20 минут на каждое запланированное время, чтобы не звучало как будильник.
- **Примечание:** Уведомления всегда отправляются отдельно, без слияния (batched). Каждое уведомление приходит в своё время согласно расписанию.
- **Snooze-aware**: сдвиг ближайшего окна без нарушения лимитов/часа.

### Схема принятия решений (упрощённо)

1. Сгенерировать `timesPerDay` для каждой активной записи `notification_preferences` в локальной TZ (равномерно):
   - Для `therapy`: одна запись (без `habitId`).
   - Для `habits`: одна запись на каждую активную привычку (с `habitId`).
2. Склеить все слоты → отсортировать по времени.
3. Пройти слева направо и:
   - если нарушается **минимальный шаг** или **лимит/час** → отложить менее приоритетный слот на ближайшее допустимое окно;
   - если превышается **глобальный лимит/день** → отбросить лишние слоты по приоритету (или перенести в дайджест вечером).
4. Применить **джиттер** к каждому финальному слоту.
5. Для каждого слота подобрать текст по комбинации: глобальные настройки (`addressing`, `tone` из `user_preferences`) + локальные настройки (`directness` из `notification_preferences` для соответствующего `kind` [, `habitId`]).
6. Отправить push через FCM (каждое уведомление отдельно, без слияния).

### Визуальная схема (ASCII)

```
[per‑type plans] → [sort] → [rate‑limit (per‑hour/per‑day)] →
[jitter] → [select template] → [deliver (push)]
```

### API/конфиг (добавка на будущее)

- `GET /api/notifications/config` → выдаёт текущие лимиты и приоритеты:
  ```json
  {
    "dailyCap": 8,
    "perHourCap": 2,
    "minGapMinutes": 25,
    "priority": ["therapy", "habits"]
  }
  ```

---

## 12) UI компоненты (фронт)

### Структура

#### 1. Общие настройки уведомлений (`/settings/general`)

- `SettingsGeneral.vue` — компонент глобальных настроек.
- `NotificationPreview.vue` — компонент для dev-превью (inline под формой).

**Форма глобальных настроек:**

```
Общие уведомления
──────────────────────────────

Обращение:
(○ ты) (● Вы)

Тон общения:
( ) Деликатный ( ) Нейтральный (●) Воодушевляющий ( ) Решительный ( ) Требовательный

──────────────────────────────

Эти параметры влияют на стиль общения и аватара во всём приложении.
```

#### 2. Настройки уведомлений для раздела "Терапия" (`/therapy` или `/support/notifications`)

- `SettingsNotificationsTherapy.vue` — компонент настроек для Поддержки.

**Форма настроек:**

```
Терапия (страница therapy.vue )
──────────────────────────────

[ Вкл уведомления ] ⟶ toggle

Частота: 3 раза в день
[ 1 2 3 4 5 ] (слайдер/степпер)

Стиль подачи:
( ) Мягко (●) Умеренно ( ) Жёстко

──────────────────────────────

[Превью уведомления]
┌────────────────────────┐
│ Сделай 3 цикла дыхания │
└────────────────────────┘

[Сохранить]
```

#### 3. Настройки уведомлений для раздела "Привычки" (`/habits/notifications`)

- `SettingsNotificationsHabits.vue` — компонент настроек для Привычек.

**Концепция:**

На странице "Привычки" пользователь видит список своих привычек (вредные и полезные), может добавить новые и настроить уведомления для каждой привычки отдельно.

**Схема интерфейса:**

```
Привычки (страница habits.vue)

+ Добавить привычку

┌─────────────────────────────┐
│ 🚭 Бросить курить    [Вкл] │
│ Частота: 2 раза/день         │
│ Стиль подачи: Умеренно       │
│ [Превью уведомления]         │
└─────────────────────────────┘

┌─────────────────────────────┐
│ 💧 Пить больше воды  [Вкл] │
│ Частота: 3 раза/день         │
│ Стиль подачи: Мягко          │
│ [Превью уведомления]         │
└─────────────────────────────┘
```

**Механика:**

- Кнопка «+ Добавить привычку» открывает форму:
  - название,
  - категория (здоровье / отказ / продуктивность),
  - желаемая частота,
  - стиль подачи.
- Для каждой привычки создаётся запись в `notificationPreferences` с `kind="habits"` и уникальным `habitId`.

**Технологии:**

- Tailwind CSS для стилей.
- Radix Vue / shadcn-vue для компонентов (Switch, RadioGroup, Slider, Button).
- Автоматическое определение timezone из браузера/устройства.

#### Онбординг разрешений на пуши

- Если системные разрешения на уведомления отключены, показываем баннер-подсказку с CTA «Включить уведомления».
- На iOS открываем системные настройки приложения через deep link (если доступно) или показываем краткую инструкцию.
- На Android открываем экран настроек уведомлений для приложения через Intent (Capacitor).
- Пока разрешения не выданы — при попытке «Отправить тест» показываем предупреждение и не отправляем пуш.

---

## 13) Трекинг ответов, дневная статистика и отчёты

Цель: фиксировать реакции пользователя на уведомления (Да / Нет / Отложить), агрегировать на уровне дня и периода (7/30 дней), отображать графики выполнения и формировать отчёты/рекомендации/мотивационные сообщения.

> **Примечание:** Эта функциональность реализуется после MVP базовых уведомлений.

### 1. UX и действия в уведомлении

- В push‑payload передаём `data.action`, а также предлагаем **кнопки**:
  - **Yes** → `data.action="confirm:yes"`
  - **No** → `data.action="confirm:no"`
  - **Later** (Snooze) → `data.action="snooze:15m"` (или `1h/4h/tomorrow`)
- На клиенте (Capacitor listener) при выборе действия вызываем бэк:
  - `POST /api/notifications/interaction` с данными слота.
  - Для **Later** дополнительно вызывается `POST /api/notifications/snooze` (как и ранее).
- Если пользователь **ничего не выбрал** и баннер скрыт/пропущен — это фиксируется как `unanswered` после истечения `ttl` слота.

**Пример данных для слотов с вопросом:**

- `kind=therapy`, `type=breath_cue` (или `habits/steps`), payload содержит `questionId`/`metric` (например, `steps` или `training`).
- Варианты ответа: `yes|no|later|dismissed|unanswered`.

### 2. Backend: эндпоинты

| Метод | Endpoint                             | Тело                                                                           | Назначение                                        |
| ----- | ------------------------------------ | ------------------------------------------------------------------------------ | ------------------------------------------------- |
| POST  | `/api/notifications/interaction`     | `{ slotId, action: 'yes' \| 'no' \| 'later' \| 'dismissed', at?: ISO }`        | Зафиксировать реакцию на push                     |
| POST  | `/api/notifications/snooze`          | `{ kind:'therapy' \| 'habits', duration:'15m' \| '1h' \| '4h' \| 'tomorrow' }` | Перенос ближайшего слота (уже описан в разделе 9) |
| GET   | `/api/notifications/summary`         | `?from=YYYY-MM-DD&to=YYYY-MM-DD&kind=therapy`                                  | Суммарные показатели за период                    |
| GET   | `/api/notifications/metrics`         | `?window=7d \| 30d&kind=therapy`                                               | Сводка для графиков (серии по дням)               |
| POST  | `/api/notifications/report/generate` | `{ window:'7d' \| '30d', kind? }`                                              | Сгенерировать отчёт и рекомендации                |

### 3. Модели данных

См. раздел **7) Схема данных** — таблицы `notification_interactions` и `daily_adherence` (в схеме: `notificationInteractions`, `dailyAdherence`).

### 4. Поток обработки

1. **Доставка push** → при клике по кнопке → клиент шлёт `POST /api/notifications/interaction`.
2. Backend валидирует `slotId`, `userId`, пишет запись в `notification_interactions` (таблица из схемы).
3. Для `later` дополнительно сдвигаем слот (уже реализовано через `/snooze`).
4. **EOD‑агрегация** (cron `23:50` локальной TZ пользователя либо `00:05 UTC`):
   - собираем все `notification_slots` за день + их `notification_interactions`;
   - считаем метрики и сохраняем/обновляем `daily_adherence` (по `user_id+date+kind`);
   - обновляем `streak` (если `completionRate >= threshold`, напр. `0.6`).
5. (Опционально) создаём задачу генерации **рекомендаций** на завтра и отправляем мотивационный пуш/дайджест.

### 5. Графики на фронте

- Экран статистики (вкладка пользователя):
  - **Линии/столбцы** за 7 и 30 дней: `asked`, `yes`, `completionRate` (%).
  - **Серия streak** (текущая/максимальная).
- Источник данных: `GET /api/notifications/metrics?window=7d|30d&kind=...` → массив точек `{ date, asked, yes, completionRate }`.
- Библиотека: Chart.js / ApexCharts; дизайн — Tailwind + shadcn-vue.

### 6. Рекомендации и мотивация (скелет)

- Генерация выполняется на бэкенде на основе:
  - последней недели `daily_adherence`,
  - распределения по типам уведомлений и реакциям,
  - предпочтений пользователя (глобальные: `tone`/`addressing` из `user_preferences` + локальные: `directness` из `notification_preferences`).
- Выход: короткий текст‑рекомендация и/или план на завтра.
- Отправка: либо как отдельный **дайджест‑пуш** вечером (с collapse‑id), либо показ в разделе «Прогресс».

### 7. Пограничные случаи и правила

- Если пользователь «отклонил все уведомления с вопросами» → в `daily_adherence.no`/`dismissed` будет высокий показатель, мотивация мягко подсказывает снизить частоту или сменить стиль подачи (`directness`).
- Если **ни одного взаимодействия** → `unanswered` растёт, рекомендуем включить баннер‑подсказку «разрешить уведомления» и проверить системные настройки.
- Snooze не считается «yes», пока фактической отметки нет; если по итогам дня нет взаимодействия после snooze → это `unanswered`.
- Часть уведомлений может быть **информационной** (без вопроса); такие слоты помечаем `payload.isQuestion=false` и **не учитываем в asked**.

---

## 14) Приложения

### Приложение A — Примеры push‑payload'ов (FCM/APNs)

```ts
// Node Firebase Admin SDK (TypeScript)
import * as admin from 'firebase-admin';

const message = {
  token: userDeviceToken,
  notification: {
    title: 'Mentai: время паузы',
    body: 'Сделайте 3 цикла дыхания 4-7-8 прямо сейчас.',
  },
  data: {
    kind: 'therapy',
    action: 'open',
    deepLink: 'mentai://therapy/breathing',
  },
  android: {
    priority: 'high',
    ttl: 60 * 60 * 1000, // 1 hour
    collapseKey: 'therapy_breathing',
    notification: {
      sound: 'default',
      channelId: 'therapy_notifications',
      clickAction: 'OPEN_ACTIVITY_1',
    },
  },
  apns: {
    headers: {
      'apns-priority': '10',
      'apns-expiration': String(Math.floor(Date.now() / 1000) + 3600),
      'apns-collapse-id': 'therapy_breathing',
    },
    payload: {
      aps: {
        alert: {
          title: 'Mentai: время паузы',
          body: 'Сделайте 3 цикла дыхания 4-7-8 прямо сейчас.',
        },
        sound: 'default',
        category: 'THERAPY_CATEGORY',
      },
    },
  },
};

await admin.messaging().send(message);
```

**Примечания:**

- Приоритет и TTL для быстрой и своевременной доставки.
- Именование `collapse-id` / `collapseKey`: для `therapy` используем форму `"therapy_<type>"`, для `habits` — `"habit_<habitId>"`.
- Не дублируем одни и те же поля уведомления на верхнем уровне и в платформах: заголовок/тело задаём на верхнем уровне `notification`, платформенные параметры (`channelId`, `clickAction`, `apns.headers`) указываем только в соответствующих секциях `android`/`apns`.
- `apns-collapse-id` для сжатия уведомлений одного типа.
- `data.action` может быть `open` или `snooze:15m|1h|4h|tomorrow`.
- Android кнопки можно реализовать через `clickAction` и BroadcastReceiver.
- iOS категории с action buttons (Open, Snooze) настроены в приложении.

---

### Приложение B — Ошибки и ретраи (FCM)

| Класс ошибки             | Действия сервера                    | Примечания                     |
| ------------------------ | ----------------------------------- | ------------------------------ |
| InvalidRegistrationToken | Удалить токен из `user_devices`     | Токен устарел или удалён       |
| Unavailable              | Ретрай с экспоненциальной задержкой | Временная ошибка сервера FCM   |
| InternalServerError      | Ретрай с экспоненциальной задержкой | Временная ошибка сервера FCM   |
| NotRegistered            | Удалить токен из `user_devices`     | Пользователь удалил приложение |
| MessageTooBig            | Логировать, не ретраить             | Payload превышает лимит        |
| InvalidPayload           | Логировать, не ретраить             | Ошибка в структуре сообщения   |

**Алгоритм обработки результата батча:**

1. Разбить отправку на батчи (~500 токенов).
2. Обработать ошибки по каждому токену.
3. Удалить невалидные токены.
4. Для временных ошибок — ретрай с backoff (1m, 5m, 25m).
5. Логировать все ошибки и метрики доставки.

**Замечания:**

- TTL сообщений не должен быть слишком большим (1–2 часа).
- `apns-collapse-id` помогает избежать дублирования на iOS.
- Логирование и мониторинг — обязательны для поддержки качества.

---

### Приложение C — Fallback при отсутствии шаблона

Если для комбинации `addressing + tone + directness` не найден шаблон в каталоге, используется fallback:

1. Ищем шаблон с теми же `addressing` (из глобальных настроек) и `directness` (из локальных), но `tone = "neutral"` (из глобальных).
2. Если не найдено — ищем с теми же `addressing`, но `tone = "neutral"` и `directness = "moderate"`.
3. Если всё ещё не найдено — логируем ошибку и используем дефолтный текст: `"Время сделать паузу и восстановить дыхание."`

**Примечание:** В API и базе данных поле `directness` соответствует UI-полю «Стиль подачи». Возможные значения: `soft | moderate | hard`. Влияет на текст уведомления, но не на тон и обращение (которые берутся из глобальных настроек).

---

### Приложение D — Миграция данных (addressing/tone → user_preferences)

**Цель:** Перенести `addressing` и `tone` из `notification_preferences` в `user_preferences`.

**План миграции:**

1. Создать таблицу `user_preferences` (уникальный индекс по `user_id`).

2. Одноразовый скрипт миграции:

   - Собрать для каждого `user_id` последние значения `addressing` и `tone` из `notification_preferences` (если есть).
   - Выполнить upsert в `user_preferences` с дефолтами:
     - `addressing = 'informal'` (если не найдено)
     - `tone = 'neutral'` (если не найдено)

3. Удалить колонки `addressing` и `tone` из `notification_preferences` через ALTER TABLE.

4. Обновить код:

   - Фронт читает/пишет глобальные prefs через `/api/settings/preferences`.
   - Бэк при генерации слотов берёт `addressing`/`tone` из `user_preferences` (не из `notification_preferences`).

5. На время миграции (если нужно) держать `dual-read` с приоритетом `user_preferences` + логирование расхождений.

**Пример SQL миграции:**

```sql
-- 1. Создать user_preferences (если ещё не создана)
CREATE TABLE IF NOT EXISTS "user_preferences" (
  "id" text PRIMARY KEY NOT NULL,
  "user_id" integer NOT NULL UNIQUE,
  "addressing" varchar(20) DEFAULT 'informal' NOT NULL,
  "tone" varchar(20) DEFAULT 'neutral' NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

-- 2. Миграция данных (если notification_preferences уже содержит addressing/tone)
-- Примечание: id генерируется в коде при вставке через nanoid() (не в SQL)
-- Поэтому этот шаг выполняется в приложении: для каждого user_id собираем последние значения
-- и делаем upsert в user_preferences с использованием nanoid() для генерации id

-- 3. Удалить колонки (выполнить после обновления кода)
-- ALTER TABLE "notification_preferences" DROP COLUMN "addressing";
-- ALTER TABLE "notification_preferences" DROP COLUMN "tone";
```

---

### Приложение E — Наблюдаемость (Observability)

**Метрики (time-series):**

- `slot_planned`, `slot_sent`, `slot_failed`, `slot_skipped` (labels: `kind`, `habitId?`, `templateId`)
- `interaction_yes`, `interaction_no`, `interaction_later`, `interaction_dismissed`, `interaction_unanswered`
- `delivery_latency_ms` — время от `scheduledAt` до фактической доставки (по client callback или серверному timestamp)
- `tokens_active_per_user` — количество активных устройств на пользователя
- `due_backlog` — размер очереди due-слотов

**Логи/трассировка:**

- Логируем ошибки FCM/APNs с кодами, payload-id, userId, habitId (если есть).
- Трассируем ключевые шаги воркера: fetch due → render payload → send → result.

**Алерты (SLO):**

- Ошибки отправки `slot_failed > 5%` за 15 мин по любому `kind`.
- Рост `interaction_unanswered > 50%` за 24 часа.
- Падение `tokens_active_per_user` ниже порога (регресс разрешений).
- Удлинение `delivery_latency_ms` p95 > 5 минут в течение 30 минут.

**Примечание:** В проекте используется Pino для логирования и Sentry для мониторинга. Метрики можно собирать через Prometheus/StatsD или встроенные инструменты Sentry.

---

**При создании UI используй tailwind + https://radix.shadcn-vue.com/**  
**При написании кода всегда обращайся к документации через интернет или use context7**
