# Mentai Notifications v2: Унифицированная архитектура

_Версия_: 2.4  
_Дата_: 2025-01-XX  
_Статус_: Спецификация для реализации

## 🔄 Изменения v2.4

- **Упрощение фильтрации шаблонов**: Убраны поля `addressing` и `tone` из структуры шаблонов и фильтрации. Теперь `addressing` берется из БД (`userPreferences.addressing`) и используется только для выбора текста (informal/formal), а `tone` больше не используется.
- **Дефолтное значение subtype**: Для habits по умолчанию установлено значение `subtype = 'mixed'`, что решает проблему с отсутствием напоминаний для quit-привычек.

---

## 🆕 2025-11-14 — Кастомные слоты уведомлений

1. **Данные**
   - В `notification_preferences` добавлено поле `custom_slot_times` (jsonb, максимум 5 значений). Значение `null` означает, что все слоты распределяются автоматически.
   - DTO и REST (`/api/notifications/prefs`) принимают/возвращают `customSlotTimes`, валидация: `0 ≤ value ≤ 1439`, длина ≤ 8 (запас для будущих тарифов).
2. **Планировщик**
   - `generateSlotTimes` / `generateGlobalSlotTimes` дают приоритет кастомным минутам, а оставшиеся слоты равномерно распределяют внутри окна `timeRangeStart/end`.
   - Кастомные времена могут выходить за выбранный диапазон — планировщик уважает выбор пользователя; диапазон используется только для авто-слотов.
3. **Фронтенд**
   - Под слайдером частоты отображаются интерактивные кружки (1…5) со статусом «Авто» или конкретным временем; по клику открывается `TimePicker` (через новый слот `trigger`).
   - Есть кнопка «Сбросить» для возврата всех слотов в авто-режим.
   - Реализовано и для привычек (`/habits/[id]`), и для тем поддержки (`/therapy/[key]`).

## 📋 Цель

Создать единообразную систему персонализированных уведомлений для двух разделов:

- **Habits (Привычки)** — формирование полезных привычек и отказ от вредных
- **Therapy Topics (Темы терапии)** — помощь в типичных эмоциональных состояниях

**Ключевой принцип:** Обе системы работают на **единой архитектуре** с симметричным UX и минимальными различиями в реализации.

---

## 🏗 Архитектурное решение

### Проблема

Изначально предлагалось создать новую таблицу `support_topics` параллельно существующей `notification_preferences`. Это приводило к:

- Дублированию логики генерации слотов
- Параллельным API endpoints
- Усложнению scheduler и delivery сервисов

### Решение: Единая таблица настроек

Используем **существующую** `notification_preferences` с расширением для поддержки per-topic и per-habit настроек.

```typescript
notification_preferences {
  id: string (PK)
  userId: integer
  kind: 'therapy' | 'habits'

  // Для per-habit настроек
  habitId: string | null          // FK → habits.id

  // Для per-topic настроек (НОВОЕ)
  topicKey: string | null         // 'anxiety' | 'stress' | 'mood' | ...

  enabled: boolean
  timesPerDay: integer (1-5)
  directness: 'soft' | 'moderate' | 'hard'
  timezone: string (IANA)
  subtype: 'reminder' | 'informational' | 'motivational' | 'mixed' | null  // Для habits, по умолчанию 'mixed'

  // Дополнительные параметры (опционально)
  meta: jsonb | null              // { techniques: [...], goalType: '...' }

  createdAt: timestamp
  updatedAt: timestamp
}
```

### Преимущества

✅ **Единая логика** — scheduler, delivery, interactions работают одинаково  
✅ **Минимум миграций** — только добавляем `topicKey`, не создаём новые таблицы  
✅ **Симметричный UX** — habits и support имеют идентичную структуру интерфейса  
✅ **Масштабируемость** — легко добавить новые темы или типы привычек  
✅ **Простота поддержки** — одна кодовая база для обеих систем

---

## 📦 Миграция БД

### SQL-скрипт

```sql
-- ==========================================
-- Добавляем topicKey в notification_preferences
-- ==========================================

ALTER TABLE notification_preferences
  ADD COLUMN topic_key VARCHAR(50);

-- ==========================================
-- Добавляем topicKey в notification_slots
-- ==========================================

ALTER TABLE notification_slots
  ADD COLUMN topic_key VARCHAR(50);

-- ==========================================
-- Индексы для эффективных запросов
-- ==========================================

-- Для per-topic выборки
CREATE INDEX notification_preferences_topic_key_idx
  ON notification_preferences(topic_key)
  WHERE topic_key IS NOT NULL;

CREATE INDEX notification_slots_topic_key_idx
  ON notification_slots(topic_key)
  WHERE topic_key IS NOT NULL;

-- ==========================================
-- Уникальные индексы (гарантия целостности)
-- ==========================================

-- Для therapy с topicKey: (userId + kind + topicKey) уникальны
CREATE UNIQUE INDEX notification_preferences_user_therapy_topic
  ON notification_preferences(user_id, kind, topic_key)
  WHERE kind = 'therapy' AND topic_key IS NOT NULL;

-- Для therapy без topicKey: (userId + kind) уникальны (общий режим)
CREATE UNIQUE INDEX notification_preferences_user_therapy_general
  ON notification_preferences(user_id, kind)
  WHERE kind = 'therapy' AND topic_key IS NULL AND habit_id IS NULL;

-- Для habits: (userId + kind + habitId) уникальны (уже есть в spec v2)
CREATE UNIQUE INDEX notification_preferences_user_habits
  ON notification_preferences(user_id, kind, habit_id)
  WHERE kind = 'habits' AND habit_id IS NOT NULL;
```

---

## 🏃 Habits (Привычки)

### Концепция

Mentai помогает формировать полезные привычки и избавляться от вредных. Пользователь выбирает цель (бросить курить, пить воду, лучше спать...) и получает персонализированные напоминания в течение дня.

### UI Flow

```
┌─────────────────────────────────────────────────────────┐
│ /habits (pages/habits/index.vue)                        │
├─────────────────────────────────────────────────────────┤
│                                                           │
│  HabitGoalPicker                                         │
│  ┌───────────────────────────────────────────────────┐  │
│  │ Что ты хочешь изменить?                           │  │
│  │                                                     │  │
│  │  🚭 Бросить курить        ⟶                       │  │
│  │  🍺 Меньше алкоголя       ⟶                       │  │
│  │  💧 Пить больше воды      ⟶                       │  │
│  │  😴 Лучше спать           ⟶                       │  │
│  │  🏃 Больше двигаться      ⟶                       │  │
│  │  🧘 Медитация             ⟶                       │  │
│  │  ➕ Другое                ⟶                       │  │
│  └───────────────────────────────────────────────────┘  │
│                                                           │
│  HabitsList (мои активные привычки)                     │
│  ┌─────────────────┐  ┌─────────────────┐              │
│  │ 🚭 Курение      │  │ 💧 Вода         │              │
│  │ Вкл • 2/день    │  │ Выкл • 3/день   │              │
│  │ [Настроить ⟶]  │  │ [Настроить ⟶]  │              │
│  └─────────────────┘  └─────────────────┘              │
│                                                           │
└─────────────────────────────────────────────────────────┘
```

```
┌─────────────────────────────────────────────────────────┐
│ /habits/:id (pages/habits/[id].vue)                     │
├─────────────────────────────────────────────────────────┤
│  🚭 Бросить курить                                      │
│  Цель: Снизить до 0 за 30 дней               [изменить]│
│                                                           │
│  Уведомления                              [ВКЛ ▣]       │
│                                                           │
│  Частота: 2 раза в день                                 │
│  [—•———○———○———○———○]                                   │
│   1    2    3    4    5                                  │
│                                                           │
│  Стиль подачи                                            │
│  ┌─────────────────────────────────────────────────┐    │
│  │ ○ Мягко                                         │    │
│  │   Поддержка, без давления                       │    │
│  ├─────────────────────────────────────────────────┤    │
│  │ ● Умеренно                                      │    │
│  │   Конкретнее, но корректно                      │    │
│  ├─────────────────────────────────────────────────┤    │
│  │ ○ Жёстко                                        │    │
│  │   Максимальная директивность                    │    │
│  └─────────────────────────────────────────────────┘    │
│                                                           │
│  Превью уведомления                        [🎲 обновить]│
│  ┌─────────────────────────────────────────────────┐    │
│  │ Mentai                                          │    │
│  │ Тяга — нормальная волна. Подыши 4-7-8          │    │
│  │ и дай себе 5 минут.                             │    │
│  └─────────────────────────────────────────────────┘    │
│                                                           │
│  [Сохранить]                                             │
│                                                           │
└─────────────────────────────────────────────────────────┘
```

### Схема БД

```typescript
// ==========================================
// Таблица привычек (создаются пользователем)
// ==========================================

habits {
  id: string (PK)                 // nanoid()
  userId: integer                 // FK → users.id
  name: string                    // "Бросить курить"
  category: string                // 'health' | 'quit' | 'productivity' | 'custom'
  emoji: string                   // "🚭"

  // MVP: эти поля пока не нужны (добавить в V2)
  // goalType: 'gain' | 'avoid'
  // meta: jsonb

  createdAt: timestamp
  updatedAt: timestamp
}

// ==========================================
// Настройки уведомлений для привычки
// ==========================================

notification_preferences {
  kind: 'habits'
  habitId: 'habit_123'            // FK → habits.id
  topicKey: null                  // для habits всегда null
  enabled: true
  timesPerDay: 3
  directness: 'moderate'
  timezone: 'Europe/Moscow'
  meta: null                      // можно использовать позже
}
```

### API

```typescript
// ==========================================
// CRUD привычек
// ==========================================

GET    /api/habits
Response: Habit[]
[
  {
    id: "habit_123",
    name: "Бросить курить",
    category: "quit",
    emoji: "🚭",
    createdAt: "2025-01-01T00:00:00Z"
  }
]

POST   /api/habits
Body: { name: string, category: string, emoji: string }
Response: Habit

GET    /api/habits/:id
Response: Habit

PUT    /api/habits/:id
Body: { name?: string, category?: string, emoji?: string }
Response: Habit

DELETE /api/habits/:id
Response: { success: boolean }

// ==========================================
// Настройки уведомлений для привычки
// ==========================================

GET /api/notifications/prefs/habits?habitId=:id
Response: NotificationPreferencesDto

PUT /api/notifications/prefs/habits
Body: {
  habitId: string,
  enabled: boolean,
  timesPerDay: number,
  directness: 'soft' | 'moderate' | 'hard',
  timezone: string
}
Response: NotificationPreferencesDto
```

### Каталог шаблонов

```typescript
// app/lib/notificationTemplates.ts

export type HabitsType = 'quit' | 'water' | 'sleep' | 'training' | 'custom';



## 🧠 Therapy Topics (Темы терапии)

### Концепция

Mentai предоставляет поддержку по 10 тематическим направлениям, отражающим типичные эмоциональные состояния. Пользователь выбирает актуальные темы и получает персонализированные напоминания с техниками саморегуляции.

### 10 тематических направлений

| №   | Key          | Название             | Emoji | Цель                                              | Техники                                                |
| --- | ------------ | -------------------- | ----- | ------------------------------------------------- | ------------------------------------------------------ |
| 1   | `anxiety`    | Тревога и паника     | 😰    | Снижение тревожности, восстановление безопасности | Дыхание 4-7-8, техника 5-4-3-2-1, мягкие рефреймы, SOS |
| 2   | `stress`     | Стресс и выгорание   | 😮‍💨    | Снятие перенапряжения, отдых                      | Микропаузы, расслабление плеч/челюсти                  |
| 3   | `mood`       | Низкое настроение    | 😔    | Повышение энергии, активация                      | Микро-цели, благодарность, поддержка                   |
| 4   | `sleep`      | Сон и восстановление | 😴    | Помощь при засыпании, режим                       | Вечерние напоминания, дыхание перед сном               |
| 5   | `anger`      | Раздражительность    | 😤    | Управление импульсами                             | Дыхательные паузы, заземление                          |
| 6   | `selfesteem` | Самооценка           | 🤗    | Снижение самокритики                              | Фразы само-поддержки, мягкий рефрейм                   |
| 7   | `focus`      | Прокрастинация       | 🎯    | Повышение концентрации                            | Правило 2 минут, фокус-слоты                           |
| 8   | `relations`  | Отношения и границы  | 💬    | Поддержка в конфликтах                            | Напоминания про самоценность, I-сообщения              |
| 9   | `grief`      | Потери и горе        | 💔    | Помощь при утрате                                 | Дыхание, мягкая поддержка, нормализация                |
| 10  | `sos`        | Экстренная поддержка | 🆘    | Быстрая стабилизация                              | Короткие SOS-сообщения, 4-7-8, grounding               |

### UI Flow

```

┌─────────────────────────────────────────────────────────┐
│ /support (pages/support/index.vue) │
├─────────────────────────────────────────────────────────┤
│ │
│ SupportTopicsPicker │
│ ┌───────────────────────────────────────────────────┐ │
│ │ Что сейчас важно для тебя? │ │
│ │ │ │
│ │ 😰 Тревога и паника ⟶ │ │
│ │ 😮‍💨 Стресс и выгорание ⟶ │ │
│ │ 😔 Низкое настроение ⟶ │ │
│ │ 😴 Сон и восстановление ⟶ │ │
│ │ 😤 Раздражительность и злость ⟶ │ │
│ │ 🤗 Самооценка и самокритика ⟶ │ │
│ │ 🎯 Прокрастинация и фокус ⟶ │ │
│ │ 💬 Отношения и границы ⟶ │ │
│ │ 💔 Потери и горе ⟶ │ │
│ │ 🆘 Экстренная поддержка (SOS) ⟶ │ │
│ └───────────────────────────────────────────────────┘ │
│ │
│ SupportTopicsList (мои активные темы) │
│ ┌─────────────────┐ ┌─────────────────┐ │
│ │ 😰 Тревога │ │ 😴 Сон │ │
│ │ Вкл • 3/день │ │ Вкл • 2/день │ │
│ │ [Настроить ⟶] │ │ [Настроить ⟶] │ │
│ └─────────────────┘ └─────────────────┘ │
│ │
└─────────────────────────────────────────────────────────┘

```

```

┌─────────────────────────────────────────────────────────┐
│ /support/:topicKey (pages/support/[key].vue) │
├─────────────────────────────────────────────────────────┤
│ 😰 Тревога и паника │
│ Помогаем успокоиться и восстановить чувство │
│ безопасности │
│ │
│ Уведомления [ВКЛ ▣] │
│ │
│ Частота: 3 раза в день │
│ [—•———•———•———○———○] │
│ 1 2 3 4 5 │
│ │
│ Стиль подачи │
│ ┌─────────────────────────────────────────────────┐ │
│ │ ○ Мягко │ │
│ │ Поддержка, без давления │ │
│ ├─────────────────────────────────────────────────┤ │
│ │ ● Умеренно │ │
│ │ Конкретнее, но корректно │ │
│ ├─────────────────────────────────────────────────┤ │
│ │ ○ Жёстко │ │
│ │ Максимальная директивность │ │
│ └─────────────────────────────────────────────────┘ │
│ │
│ Превью уведомления [🎲 обновить]│
│ ┌─────────────────────────────────────────────────┐ │
│ │ Mentai │ │
│ │ Сделай три цикла дыхания 4-7-8, │ │
│ │ почувствуй опору под ногами. │ │
│ └─────────────────────────────────────────────────┘ │
│ │
│ [Сохранить] │
│ │
└─────────────────────────────────────────────────────────┘

````

### Схема БД

```typescript
// ==========================================
// Темы — статичный справочник в коде (НЕ в БД!)
// ==========================================

// app/lib/therapyCatalog.ts
export const THERAPY_TOPICS = [
  {
    key: 'anxiety',
    name: 'Тревога и паника',
    description: 'Помогаем успокоиться и восстановить чувство безопасности',
    emoji: '😰',
    color: 'blue',
    techniques: ['breath', 'grounding', 'reframe', 'sos']
  },
  {
    key: 'stress',
    name: 'Стресс и выгорание',
    description: 'Снятие перенапряжения, усталости, ощущение контроля и отдыха',
    emoji: '😮‍💨',
    color: 'gray',
    techniques: ['breath', 'body_scan', 'reframe']
  },
  // ... остальные 8 тем
] as const;

// ==========================================
// Настройки уведомлений для темы
// ==========================================

notification_preferences {
  kind: 'therapy'
  habitId: null                   // для therapy всегда null
  topicKey: 'anxiety'             // НОВОЕ: ссылка на тему
  enabled: true
  timesPerDay: 3
  directness: 'moderate'
  timezone: 'Europe/Moscow'

  // Опционально: выбор техник (MVP - используем все техники темы)
  meta: { techniques: ['breath', 'grounding', 'reframe'] }
}
````

### API

```typescript
// ==========================================
// Статичный справочник тем (не требует БД)
// ==========================================

GET /api/therapy/topics
Response: TherapyTopic[]
[
  {
    key: "anxiety",
    name: "Тревога и паника",
    description: "Помогаем успокоиться...",
    emoji: "😰",
    color: "blue",
    techniques: ["breath", "grounding", "reframe", "sos"]
  },
  // ... остальные 9 тем
]

// ==========================================
// Настройки уведомлений для темы
// ==========================================

GET /api/notifications/prefs/therapy?topicKey=anxiety
Response: NotificationPreferencesDto

PUT /api/notifications/prefs/therapy
Body: {
  topicKey: string,
  enabled: boolean,
  timesPerDay: number,
  directness: 'soft' | 'moderate' | 'hard',
  timezone: string,
  meta?: { techniques?: string[] }  // опционально
}
Response: NotificationPreferencesDto
```

### Каталог шаблонов

```typescript
// app/lib/notificationTemplates.ts

export type TherapyType = 'breath_cue' | 'grounding' | 'body_scan' | 'reframe' | 'mi_prompt' | 'sos';

// ==========================================
// Шаблоны для anxiety (тревога и паника)
// ==========================================

{
  id: 'support_anxiety_breath_01',
  kind: 'therapy',
  type: 'breath_cue',
  topic: 'anxiety',               // НОВОЕ: привязка к теме
  directness: ['soft', 'moderate', 'hard'],
  ru: {
    informal: {
      soft: 'Сделай три дыхательных цикла 4-7-8, почувствуй опору под ногами.',
      moderate: 'Три цикла 4-7-8. Заметь 3 вещи вокруг.',
      hard: 'Стоп. 4-7-8 — сейчас. Замри, почувствуй землю под ногами.'
    },
    formal: {
      soft: 'Сделайте три дыхательных цикла 4-7-8, почувствуйте опору под ногами.',
      moderate: 'Три цикла 4-7-8. Заметьте 3 вещи вокруг.',
      hard: 'Стоп. 4-7-8 — сейчас. Замрите, почувствуйте землю под ногами.'
    }
  }
}

{
  id: 'support_anxiety_grounding_01',
  kind: 'therapy',
  type: 'grounding',
  topic: 'anxiety',
  directness: ['soft', 'moderate', 'hard'],
  ru: {
    informal: {
      soft: 'Назови 5 вещей, которые видишь вокруг. Это заземлит тебя.',
      moderate: '5-4-3-2-1. Пять вещей, которые видишь. Начинай.',
      hard: 'Сейчас. 5 вещей вокруг — назови вслух.'
    },
    formal: {
      soft: 'Назовите 5 вещей, которые видите вокруг. Это заземлит вас.',
      moderate: '5-4-3-2-1. Пять вещей, которые видите. Начинайте.',
      hard: 'Сейчас. 5 вещей вокруг — назовите вслух.'
    }
  }
}

// ==========================================
// Шаблоны для stress (стресс и выгорание)
// ==========================================

{
  id: 'support_stress_body_scan_01',
  kind: 'therapy',
  type: 'body_scan',
  topic: 'stress',
  directness: ['soft', 'moderate', 'hard'],
  ru: {
    informal: {
      soft: 'Проверь плечи и челюсть — отпусти напряжение.',
      moderate: 'Расслабь плечи и челюсть. Сделай выдох.',
      hard: 'Плечи вниз, челюсть расслаблена. Выдох.'
    },
    formal: {
      soft: 'Проверьте плечи и челюсть — отпустите напряжение.',
      moderate: 'Расслабьте плечи и челюсть. Сделайте выдох.',
      hard: 'Плечи вниз, челюсть расслаблена. Выдох.'
    }
  }
}

// ... аналогично для остальных 8 тем
```

---

## 🔄 Обновления Scheduler

### Изменения в `server/application/notifications/scheduler.service.ts`

```typescript
// ==========================================
// БЫЛО: генерация без учёта habitId/topicKey
// ==========================================

export async function generateSlotsForUser(
  userId: number,
  kind: NotificationKind
): Promise<void> {
  // Получал настройки только по kind
  const [prefs] = await db
    .select()
    .from(notificationPreferences)
    .where(
      and(
        eq(notificationPreferences.userId, userId),
        eq(notificationPreferences.kind, kind),
        isNull(notificationPreferences.habitId)
      )
    );

  // ...
}

// ==========================================
// СТАЛО: генерация с учётом habitId/topicKey
// ==========================================

export async function generateSlotsForUser(
  userId: number,
  kind: NotificationKind,
  options?: {
    habitId?: string | null;
    topicKey?: string | null;
  }
): Promise<void> {
  const { habitId, topicKey } = options || {};

  console.log(
    `[Scheduler] Generating slots for user ${userId}, kind: ${kind}`,
    habitId ? `, habitId: ${habitId}` : '',
    topicKey ? `, topicKey: ${topicKey}` : ''
  );

  // 1. Получаем настройки с учётом habitId/topicKey
  let query = db
    .select()
    .from(notificationPreferences)
    .where(eq(notificationPreferences.userId, userId));

  if (kind === 'habits' && habitId) {
    // Per-habit настройки
    query = query.where(eq(notificationPreferences.habitId, habitId));
  } else if (kind === 'therapy' && topicKey) {
    // Per-topic настройки
    query = query.where(eq(notificationPreferences.topicKey, topicKey));
  } else {
    // Общие настройки (без habitId/topicKey)
    query = query.where(
      and(
        isNull(notificationPreferences.habitId),
        isNull(notificationPreferences.topicKey)
      )
    );
  }

  const [prefs] = await query.limit(1);

  if (!prefs || !prefs.enabled) {
    console.log(`[Scheduler] Notifications disabled`);
    return;
  }

  // 2. Получаем глобальные настройки (addressing для выбора текста)
  const [globalPrefs] = await db
    .select()
    .from(userPreferences)
    .where(eq(userPreferences.userId, userId))
    .limit(1);

  const addressing = globalPrefs?.addressing || 'informal'; // Используется только для выбора текста (informal/formal)
  const directness = prefs.directness;

  // 3. Удаляем старые запланированные слоты
  const now = new Date();
  let deleteQuery = db
    .delete(notificationSlots)
    .where(
      and(
        eq(notificationSlots.userId, userId),
        eq(notificationSlots.kind, kind),
        eq(notificationSlots.status, 'planned'),
        gt(notificationSlots.scheduledAt, now)
      )
    );

  if (habitId) {
    deleteQuery = deleteQuery.where(eq(notificationSlots.habitId, habitId));
  }
  if (topicKey) {
    deleteQuery = deleteQuery.where(eq(notificationSlots.topicKey, topicKey));
  }

  await deleteQuery;

  // 4. Генерируем новые слоты
  const slots = generateSlotTimes(
    prefs.timesPerDay,
    prefs.timezone,
    SCHEDULE_CONFIG.horizonDays
  );

  // 5. Создаём слоты в БД
  for (const scheduledAt of slots) {
    // Подбираем случайный шаблон с учётом topicKey/habitId
    // addressing и tone больше не используются в фильтрации, берутся из БД для выбора текста
    const template = findTemplate(kind, {
      topicKey: topicKey || undefined,
      habitId: habitId || undefined,
    });

    if (!template) {
      console.warn(`[Scheduler] No template found`);
      continue;
    }

    const text = getTemplateText(
      template,
      addressing as any,
      directness as any,
      undefined // TODO: получить имя пользователя
    );

    const payload: NotificationPayload = {
      title: 'Mentai: время паузы',
      body: text,
      templateId: template.id,
      action: 'open',
      deepLink: kind === 'therapy' ? '/support' : '/habits',
      data: {
        kind,
        habitId: habitId || undefined,
        topicKey: topicKey || undefined,
        slotId: '', // будет переопределено ниже
      },
    };

    const slotId = nanoid();
    payload.data!.slotId = slotId;

    await db.insert(notificationSlots).values({
      id: slotId,
      userId,
      kind,
      habitId: habitId || null,
      topicKey: topicKey || null, // НОВОЕ
      scheduledAt,
      payload,
      templateId: template.id,
      status: 'planned',
    });
  }

  console.log(`[Scheduler] Generated ${slots.length} slots`);
}

// ==========================================
// Обновление функции для регенерации всех слотов
// ==========================================

export async function regenerateAllSlots(): Promise<void> {
  console.log('[Scheduler] Regenerating slots for all users');

  const activePrefs = await db
    .select()
    .from(notificationPreferences)
    .where(eq(notificationPreferences.enabled, true));

  for (const pref of activePrefs) {
    try {
      await generateSlotsForUser(pref.userId, pref.kind as NotificationKind, {
        habitId: pref.habitId,
        topicKey: pref.topicKey,
      });
    } catch (error) {
      console.error(
        `[Scheduler] Failed to regenerate slots for user ${pref.userId}:`,
        error
      );
    }
  }

  console.log('[Scheduler] Finished regenerating slots');
}
```

### Обновления в `app/lib/notificationTemplates.ts`

```typescript
// ==========================================
// Обновляем функцию поиска шаблонов
// ==========================================

export function findTemplate(
  kind: NotificationKind,
  options?: {
    topicKey?: string;
    habitId?: string;
    type?: TherapyType | HabitsType;
    intent?: HabitIntent;
    habitKey?: HabitKey;
    subtype?: HabitSubtype;
  }
): NotificationTemplate | null {
  const { topicKey, habitId, type, intent, habitKey, subtype } = options || {};

  const templates = kind === 'therapy' ? therapyTemplates : habitsTemplates;

  // Фильтруем по topicKey (для therapy)
  let filtered = templates;
  if (topicKey) {
    filtered = filtered.filter((t) => 'topic' in t && t.topic === topicKey);
  }

  // Фильтруем по habitKey, intent, subtype (для habits)
  if (kind === 'habits') {
    if (habitKey) {
      filtered = filtered.filter((t) => t.habitKey === habitKey);
    }
    if (intent) {
      filtered = filtered.filter((t) => t.intent === intent);
    }
    if (subtype) {
      filtered = filtered.filter((t) => t.subtype === subtype);
    }
  }

  // Для информационных шаблонов проверяем directness = 'universal'
  if (subtype === 'informational') {
    filtered = filtered.filter((t) => t.directness.includes('universal'));
  }

  if (filtered.length === 0) {
    return null;
  }

  // Возвращаем случайный шаблон
  return filtered[Math.floor(Math.random() * filtered.length)];
}
```

---

## 🎨 UI Components (симметричные)

### Структура компонентов

```
app/components/

├─ habits/
│  ├─ HabitGoalPicker.vue       # Выбор цели (🚭 🍺 💧 😴 🏃 ...)
│  ├─ HabitCard.vue             # Карточка привычки в списке
│  ├─ HabitsList.vue            # Список активных привычек
│  └─ HabitSetupForm.vue        # Форма настроек привычки
│
├─ support/
│  ├─ TherapyTopicsPicker.vue   # Выбор темы (😰 😮‍💨 😔 😴 ...)
│  ├─ TherapyTopicCard.vue      # Карточка темы в списке
│  ├─ TherapyTopicsList.vue     # Список активных тем
│  └─ TherapyTopicSetupForm.vue # Форма настроек темы
│
└─ notifications/
   ├─ NotificationPreview.vue        # Превью с кнопкой 🎲
   ├─ DirectnessSelector.vue         # Мягко / Умеренно / Жёстко
   ├─ FrequencyStepper.vue           # 1-5 раз/день (слайдер)
   └─ NotificationToggle.vue         # Включить/выключить
```

### Страницы

```
app/pages/

├─ habits/
│  ├─ index.vue           # Picker + список активных привычек
│  └─ [id].vue            # Настройка конкретной привычки
│
└─ support/
   ├─ index.vue           # Picker + список активных тем
   └─ [key].vue           # Настройка конкретной темы
```

### Компонент NotificationPreview.vue (с кнопкой 🎲)

```vue
<script setup lang="ts">
import { ref, watch } from 'vue';
import { findTemplate, getTemplateText } from '@/app/lib/notificationTemplates';
import type {
  NotificationKind,
  Addressing,
  Directness,
  HabitSubtype,
} from '@/app/lib/notificationTemplates';

const props = defineProps<{
  kind: NotificationKind;
  addressing: Addressing; // Из БД для выбора текста (informal/formal)
  directness: Directness;
  topicKey?: string;
  habitId?: string;
  subtype?: HabitSubtype;
  userName?: string;
}>();

const previewText = ref('');
const templateId = ref('');

function updatePreview() {
  // tone больше не используется в фильтрации шаблонов
  const template = findTemplate(props.kind, {
    topicKey: props.topicKey,
    habitId: props.habitId,
    subtype: props.subtype,
  });

  if (template) {
    // addressing используется только для выбора текста (informal/formal)
    previewText.value = getTemplateText(
      template,
      props.addressing,
      props.directness,
      props.userName
    );
    templateId.value = template.id;
  } else {
    previewText.value = 'Время сделать паузу и восстановить дыхание.';
    templateId.value = 'fallback';
  }
}

// Обновляем превью при изменении параметров
watch(
  () => [
    props.addressing,
    props.directness,
    props.topicKey,
    props.habitId,
    props.subtype,
  ],
  () => updatePreview(),
  { immediate: true }
);

// Кнопка "Обновить пример"
function refreshPreview() {
  updatePreview();
}
</script>

<template>
  <div class="space-y-2">
    <div
      class="rounded-lg border border-gray-300 bg-white p-4 dark:border-gray-600 dark:bg-gray-800"
    >
      <div class="mb-1 text-xs font-semibold text-gray-600 dark:text-gray-400">
        Mentai
      </div>
      <div class="text-sm text-gray-900 dark:text-gray-100">
        {{ previewText }}
      </div>
      <div class="mt-2 text-xs text-gray-500">ID: {{ templateId }}</div>
    </div>

    <button
      type="button"
      class="flex items-center gap-2 text-sm text-blue-600 hover:text-blue-700 dark:text-blue-400"
      @click="refreshPreview"
    >
      <span class="text-lg">🎲</span>
      Обновить пример
    </button>
  </div>
</template>
```

---

## 🚀 План реализации (MVP)

### Phase 1: Habits (приоритет)

**Оценка:** 2-3 недели

- [x] БД: таблица `habits` (уже есть)
- [ ] БД: миграция для добавления `topicKey` в `notification_preferences` и `notification_slots`
- [ ] API: CRUD `/api/habits`
  - `GET /api/habits` ✅
  - `POST /api/habits` ✅
  - `GET /api/habits/:id` ✅
  - `PUT /api/habits/:id` ✅
  - `DELETE /api/habits/:id` ✅
- [ ] API: обновить `/api/notifications/prefs/habits` для поддержки `habitId`
- [ ] UI: Компоненты
  - `HabitGoalPicker.vue` — выбор цели
  - `HabitCard.vue` — карточка привычки
  - `HabitsList.vue` — список активных
  - `HabitSetupForm.vue` — форма настроек
- [ ] UI: Страницы
  - `/habits/index.vue` — picker + список
  - `/habits/[id].vue` — настройка привычки
- [ ] Templates: расширить каталог
  - `quit/smoking` — 8-10 шаблонов ✅
  - `water` — 5-6 шаблонов
  - `sleep` — 5-6 шаблонов
  - `training` — 5-6 шаблонов
- [ ] Scheduler: обновить для поддержки `habitId`
- [ ] Тестирование: создать привычку → настроить → проверить слоты

### Phase 2: Support Topics

**Оценка:** 2-3 недели

- [ ] API: `GET /api/support/topics` (статичный список)
- [ ] API: обновить `/api/notifications/prefs/therapy` для поддержки `topicKey`
- [ ] UI: Компоненты
  - `SupportTopicsPicker.vue` — выбор темы
  - `SupportTopicCard.vue` — карточка темы
  - `SupportTopicsList.vue` — список активных
  - `SupportTopicSetupForm.vue` — форма настроек
- [ ] UI: Страницы
  - `/support/index.vue` — picker + список
  - `/support/[key].vue` — настройка темы
- [ ] Templates: создать каталог по 10 темам
  - `anxiety` — 8-10 шаблонов
  - `stress` — 8-10 шаблонов
  - `mood` — 8-10 шаблонов
  - `sleep` — 8-10 шаблонов
  - `anger` — 6-8 шаблонов
  - `selfesteem` — 6-8 шаблонов
  - `focus` — 6-8 шаблонов
  - `relations` — 6-8 шаблонов
  - `grief` — 6-8 шаблонов
  - `sos` — 5-6 шаблонов
- [ ] Scheduler: обновить для поддержки `topicKey`
- [ ] Тестирование: выбрать тему → настроить → проверить слоты

### Phase 3: UX Improvements

**Оценка:** 1 неделя

- [ ] Кнопка 🎲 для обновления превью (в `NotificationPreview.vue`) ✅
- [ ] Цветовые акценты по темам/категориям
  - Habits: quit (красный), water (синий), sleep (фиолетовый), training (зелёный)
  - Support: anxiety (сине-зелёный), stress (серый), mood (жёлтый), sleep (фиолетовый)
- [ ] Анимированные иконки при выборе (микро-анимации)
- [ ] Оптимизация мобильной версии
- [ ] Доступность (a11y): проверка контраста, навигация с клавиатуры

### Phase 4: V2 Features (после MVP)

**Оценка:** 3-4 недели

- [ ] Таблица `habit_logs` для чек-инов
  - Поля: id, user_id, habit_id, date, status ('yes'|'no'|'skip')
  - API: `POST /api/habits/:id/log`, `GET /api/habits/:id/logs`
  - UI: кнопки "Да / Нет / Пропустить" на карточке привычки
- [ ] Подсчёт streak (серия дней без пропусков)
  - Отображение на карточке: "Стрик: 5 дней 🔥"
- [ ] Таблица `support_logs` для отметок состояния (опционально)
  - Поля: id, user_id, topic_key, date, value (0-3 уровень)
  - API: `POST /api/support/:key/log`, `GET /api/support/:key/logs`
- [ ] Выбор техник в UI для каждой темы
  - Чекбоксы: [ ] Дыхание [ ] Grounding [ ] Рефрейминг
  - Сохранение в `meta.techniques`
- [ ] Графики adherence (выполнение привычек/тем)
  - Использовать `dailyAdherence` таблицу из spec v2
  - Компонент с Chart.js для визуализации

---

## 📊 Метрики успеха

### Технические метрики

- ✅ Единая таблица `notification_preferences` (без дублирования)
- ✅ Scheduler работает с habits и support одинаково
- ✅ API симметричны по структуре
- ✅ Каталог шаблонов покрывает все темы и типы привычек
- ✅ Слоты генерируются корректно для per-habit и per-topic

### UX метрики

- ✅ Пользователь понимает разницу между Habits и Support
- ✅ Picker целей/тем интуитивен
- ✅ Настройка привычки/темы занимает < 1 минуты
- ✅ Превью уведомления отражает реальные тексты
- ✅ Кнопка 🎲 помогает увидеть разнообразие шаблонов

### Бизнес-метрики (для отслеживания)

- % пользователей, создавших хотя бы 1 привычку
- % пользователей, выбравших хотя бы 1 тему поддержки
- Среднее количество активных привычек/тем на пользователя
- Adherence rate (доля выполненных vs запланированных уведомлений)
- Retention rate пользователей с активными уведомлениями vs без

---

## ✨ Ключевые преимущества решения

1. **Единая архитектура** — habits и support работают на одной логике
2. **Минимум миграций** — только добавляем `topicKey`, не создаём новые таблицы
3. **Симметричный UX** — пользователь видит одинаковый интерфейс
4. **Масштабируемость** — легко добавить новые темы или типы привычек
5. **Простота поддержки** — одна кодовая база для scheduler, delivery, interactions
6. **Соответствие spec v2** — расширяем существующую архитектуру, не ломаем её

---

## 📝 Следующие шаги

1. **Согласовать** этот документ с командой
2. **Создать** миграцию БД для добавления `topicKey`
3. **Начать Phase 1** (Habits) — создать UI компоненты и API endpoints
4. **Расширить каталог** шаблонов для habits (quit/smoking, water, sleep, training)
5. **Протестировать** end-to-end flow: создать привычку → настроить → проверить уведомления
