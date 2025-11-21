# Mentai — Привычки (MVP каталоги и логика)

_Версия_: 0.3 • _Дата_: 2025-11-07

## Цель

Запустить экран **«Привычки»** с тремя типами целей пользователя:

- **Привить привычку** (build)
- **Отказаться от привычки** (quit)
- **Своя привычка** (custom) — для будущего расширения

Используем **готовые списки** (каталоги) для build и quit. Экран **настроек конкретной привычки внутри карточки не меняем** — остаётся как сейчас.

---

## 1) UX / UI

### 1.1 Экран «Привычки» (index)

- Вверху **Combobox** (компонент из `app/components/Combobox.vue`):  
  **[ Привить привычку ] [ Отказаться от привычки ]**
  Использовать компонент `Combobox` как в `app/pages/index.vue` (строки 57-62).
- Под селектом — **список карточек** из соответствующего каталога (см. §3). Дизайн карточки не меняем.
- Тап → экран карточки **без изменений** (как сейчас).

### 1.2 Экран карточки привычки (HabitDetail)

**Ничего не меняем.**

---

## 2) Данные и API (минимальные добавки)

### 2.1 Drizzle (расширение уже существующих таблиц)

#### Таблица `habits`

- Заменяем `category` на `intent`: `'build' | 'quit' | 'custom'`
- Добавляем `habit_key VARCHAR(50)` — нормализованный ключ для маппинга на шаблоны (опционально, NULL для custom привычек)

```sql
ALTER TABLE habits
  RENAME COLUMN category TO intent;

ALTER TABLE habits
  ADD COLUMN habit_key VARCHAR(50);

ALTER TABLE habits
  ADD CONSTRAINT habits_intent_check
  CHECK (intent IN ('build', 'quit', 'custom'));

CREATE INDEX habits_habit_key_idx
  ON habits(habit_key)
  WHERE habit_key IS NOT NULL;
```

#### Таблица `notification_preferences`

- Добавляем `subtype VARCHAR(20)` — фокус уведомления: `'reminder' | 'informational' | 'motivational'`
  - `reminder` — напоминание: "Сделал ли ты X? Если нет, сделай"
  - `informational` — информационное (объединяет информационные и предупреждающие): факты о вреде/пользе, предупреждения
  - `motivational` — мотивационное: ободряющие сообщения

```sql
ALTER TABLE notification_preferences
  ADD COLUMN subtype VARCHAR(20);

ALTER TABLE notification_preferences
  ADD CONSTRAINT notification_prefs_subtype_check
  CHECK (subtype IS NULL OR subtype IN ('reminder', 'informational', 'motivational'));

CREATE INDEX notification_prefs_subtype_idx
  ON notification_preferences(subtype)
  WHERE subtype IS NOT NULL;
```

#### Таблица `notification_slots`

- В `payload` кладём `intent`, `habitKey`, `subtype`

Индексы (SQL миграции):

```sql
CREATE UNIQUE INDEX IF NOT EXISTS notification_prefs_user_kind_entity_uidx
  ON notification_preferences (user_id, kind, entity_key)
  WHERE entity_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS notification_slots_due_idx
  ON notification_slots (user_id, scheduled_at)
  WHERE status = 'planned';
```

### 2.2 API (префикс `/api/notifications/`)

- `GET /prefs/habits` → все prefs пользователя по привычкам
- `PUT /prefs/habits` (с `entityKey` в body)
  ```json
  {
    "enabled": true,
    "timesPerDay": 3,
    "directness": "moderate",
    "subtype": "reminder"
  }
  ```
- `POST /test` (dev/stage) → `{ "kind": "habits", "entityKey": "water" }`

Каталог на фронте (TS-модуль), при необходимости можно добавить:

- `GET /habits/catalog?intent=build|quit` — отдать тот же список сервером.

---

## 4) Контент уведомлений (типы и примеры)

### 4.1 Типы уведомлений (subtype)

1. **reminder** (напоминание) — "Сделал ли ты X? Если нет, сделай"
2. **informational** (информационное) — факты о вреде/пользе, предупреждения (объединяет информационные и предупреждающие)
3. **motivational** (мотивационное) — ободряющие сообщения

### 4.2 Примеры для привычек

#### water (build)

- **reminder (soft)** — «Выпил ли ты воду сегодня? Если нет, сделай это сейчас.»
- **reminder (moderate)** — «Проверь: выпил ли ты воду? Если нет — стакан сейчас.»
- **reminder (hard)** — «Вода. Стакан. Сейчас.»
- **informational (soft)** — «Знаешь ли ты, что обезвоживание снижает концентрацию на 20%?»
- **motivational (soft)** — «Гидратация помогает держать темп. Сделай глоток и продолжай.»

#### smoking (quit)

- **reminder (soft)** — «Тянет? Попробуй подождать ещё 5 минут. Ты справишься.»
- **reminder (moderate)** — «Подожди ещё 5 минут. Импульс пройдёт.»
- **reminder (hard)** — «5 минут. Выдержи.»
- **informational (moderate)** — «Через 20 минут без сигареты твой пульс и давление нормализуются.»
- **informational (hard)** — «Каждая сигарета приближает тебя к серьёзным проблемам со здоровьем.»
- **motivational (soft)** — «Каждый чистый час — победа. Отметь её и продолжай.»

---

## 5) Планировщик и отправка

- Слоты генерируются на 7 дней вперёд.
- Для каждой сущности (`entityKey`) создаются свои уведомления.
- Используются настройки пользователя (частота, Стиль уведомлений, фокус уведомления).
- Распределение по дню — равномерное с джиттером ±15 мин.
- Snooze и оркестрация работают аналогично типу `therapy`.
- При выборе шаблона учитываются: `intent`, `habitKey`, `subtype`, `addressing`, `tone`, `directness`.

---

## 6) Наблюдаемость (Observability)

- Логировать каждое сгенерированное уведомление (userId, entityKey, intent, habitKey, subtype, scheduledAt, templateId).
- Метрики: количество сгенерированных слотов, доля отправленных, snoozed, отклонённых.
- Отдельный dashboard (Grafana/Metabase).

---

## 7) DST и часовые пояса

- Использовать **IANA timezone** (Europe/Moscow и т.п.).
- При смене часового пояса автоматически пересоздавать будущие слоты.
- Уведомления не должны приходить ночью (09:00–22:30 локальное).

---

## 8) UI компоненты

### 8.1 Селект типа привычки (intent)

Использовать компонент `Combobox` из `app/components/Combobox.vue`:

```vue
<Combobox
  class="max-w-[170px]"
  v-model="selectedIntent"
  :options="INTENT_OPTIONS"
  placeholder="Выберите тип"
/>
```

Где `INTENT_OPTIONS`:

```typescript
export const INTENT_OPTIONS = [
  { label: 'Привить привычку', value: 'build' },
  { label: 'Отказаться от привычки', value: 'quit' },
  { label: 'Своя привычка', value: 'custom' }, // для будущего
];
```

### 8.2 Селект типа уведомления (subtype)

На странице настройки привычки (`app/pages/habits/[id].vue`):

```vue
<Combobox
  class="max-w-[170px]"
  v-model="subtype"
  :options="SUBTYPE_OPTIONS"
  placeholder="Фокус уведомлений"
/>
```

Где `SUBTYPE_OPTIONS`:

```typescript
export const SUBTYPE_OPTIONS = [
  { label: 'Напоминание о действии', value: 'reminder' },
  { label: 'Полезные факты', value: 'informational' },
  { label: 'Поддержка и мотивация', value: 'motivational' },
];
```

---

## 9) Структура шаблонов уведомлений

### 9.1 Интерфейс шаблона

```typescript
export type HabitIntent = 'build' | 'quit' | 'custom';
export type HabitSubtype = 'reminder' | 'informational' | 'motivational';

export type HabitKey =
  // build
  | 'water'
  | 'steps'
  | 'sleep'
  | 'training'
  | 'focus'
  | 'nutrition'
  | 'meditation'
  | 'gratitude'
  | 'morning_routine'
  | 'planning'
  // quit
  | 'smoking'
  | 'alcohol'
  | 'sugar'
  | 'screentime'
  | 'caffeine'
  | 'procrastination';

export interface HabitNotificationTemplate {
  id: string;
  kind: 'habits';
  intent: HabitIntent;
  habitKey: HabitKey;
  subtype: HabitSubtype;
  addressing: Addressing[];
  tone: Tone[];
  directness: Directness[];
  ru: {
    informal?: {
      soft?: string;
      moderate?: string;
      hard?: string;
    };
    formal?: {
      soft?: string;
      moderate?: string;
      hard?: string;
    };
  };
}
```

### 9.2 Функция поиска шаблона

```typescript
export function findHabitTemplate(
  intent: HabitIntent,
  habitKey: HabitKey,
  subtype: HabitSubtype,
  addressing: Addressing,
  tone: Tone,
  directness: Directness
): HabitNotificationTemplate | null {
  // Поиск с fallback логикой
}
```

---

## 10) Миграция данных

### 10.1 Обновление существующих записей

```sql
-- Обновляем intent из category
UPDATE habits
SET intent = CASE
  WHEN category = 'quit' THEN 'quit'
  WHEN category = 'health' OR category = 'productivity' THEN 'build'
  ELSE 'custom'
END;

-- Устанавливаем habitKey для известных привычек (пример)
UPDATE habits
SET habit_key = CASE
  WHEN name ILIKE '%вода%' OR name ILIKE '%water%' THEN 'water'
  WHEN name ILIKE '%курить%' OR name ILIKE '%smoking%' THEN 'smoking'
  -- ... другие маппинги
  ELSE NULL
END
WHERE habit_key IS NULL;

-- Устанавливаем дефолтный subtype для существующих notification_preferences
UPDATE notification_preferences
SET subtype = 'reminder'
WHERE kind = 'habits' AND subtype IS NULL;
```

---

## 11) Примечания

- После MVP можно расширить функциональность до **AI-генерации шаблонов уведомлений** и индивидуальных планов.
- Тип `custom` зарезервирован для будущего расширения, когда пользователь сможет создавать свои привычки.
- Тип `informational` объединяет информационные и предупреждающие уведомления для упрощения UX.
