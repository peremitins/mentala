# ТЗ: Унификация структуры шаблонов уведомлений

**Версия:** 1.0  
**Дата:** 2025-01-XX  
**Статус:** ✅ Реализовано

## Цель

Унифицировать структуру шаблонов уведомлений для привычек и терапии, максимально приблизив логику терапии к логике привычек. Убрать дублирование полей и создать единую систему идентификации через одно универсальное поле `entityKey`.

**Критически важно:** Все три настройки (фокус уведомлений/subtype, стиль уведомлений/directness, способ создания/textSource) должны использоваться везде - в готовых привычках, кастомных привычках, терапии и кастомной терапии. Это упростит кодовую базу и улучшит UX.

## Краткое резюме изменений

1. **Убрать поле `type`** из всех шаблонов (дублирует `habitKey`)
2. **Переименовать `habitKey` → `entityKey`** (универсальное поле)
3. **Заменить `topic` → `entityKey`** в терапии
4. **Добавить `subtype`** для терапии (унификация с привычками)
5. **Добавить `techniques`** для терапии (метаданные)
6. **Убрать все условия** в UI, которые скрывают настройки для кастомных сущностей
7. **Разрешить `subtype` и `directness`** для всех типов сущностей в БД
8. **Упростить логику** в бэкенде, убрав проверки `isCustomHabit`/`isCustomTherapy` для настроек

## Проблема текущей архитектуры

### Текущее состояние

**В шаблонах (`notificationTemplates.ts`):**

- `type: TherapyType | HabitsType` - для терапии это техника (breath_cue, grounding), для привычек дублирует habitKey
- `topic?: string` - только для терапии, указывает тему (anxiety, stress, mood)
- `habitKey?: HabitKey` - только для привычек, ключ привычки (water, smoking)
- В БД/слотах/ai уже используется `entityKey` для идентификации

**В функции `findTemplate`:**

- `type` - опциональный фильтр (общий для therapy/habits)
- `habitKey` - спец-фильтр только для kind='habits'
- `entityKey` - уже "унифицированный" идентификатор

**Проблема:** Три оси идентификации (type, habitKey, entityKey) создают путаницу и дублирование.

### Примеры дублирования

```typescript
// Привычки - дублирование type и habitKey
{
  kind: 'habits',
  type: 'water',      // ❌ Дублирует habitKey
  habitKey: 'water',  // ✅ Основной идентификатор
  intent: 'build',
  subtype: 'reminder',
  ...
}

// Терапия - разное значение type и topic
{
  kind: 'therapy',
  type: 'breath_cue', // ❌ Техника, не идентификатор сущности
  topic: 'anxiety',   // ❌ Тема, но в БД используется entityKey
  directness: [...],
  ...
}
```

## Целевая архитектура

### Новая структура шаблонов

```typescript
export interface NotificationTemplate {
  id: string;
  kind: 'habits' | 'therapy';

  // Универсальное поле идентификации (заменяет type, habitKey, topic)
  entityKey: EntityKey;

  // Для привычек
  intent?: HabitIntent;     // 'build' | 'quit'
  subtype?: NotificationSubtype;   // 'reminder' | 'informational' | 'motivational' | 'mixed'

  // Для терапии (опционально, метаданные, не для фильтрации)
  techniques?: TherapyTechnique[];  // ['breath_cue', 'grounding', 'reframe']

  // Общие поля
  directness: Directness[];
  ru: { ... };
}
```

### Универсальный тип EntityKey

**Вариант (выбран для MVP):** Простой тип `string` для максимальной гибкости.

```typescript
// Универсальный тип для идентификации сущности
export type EntityKey = string;

// Опционально: можно вести список статических ключей для документации/валидации
export type StaticEntityKey =
  // Привычки
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
  | 'smoking'
  | 'alcohol'
  | 'sugar'
  | 'screentime'
  | 'caffeine'
  | 'procrastination'
  // Терапия (темы)
  | 'anxiety'
  | 'stress'
  | 'mood'
  | 'sleep'
  | 'anger'
  | 'selfesteem'
  | 'focus'
  | 'relations'
  | 'grief'
  | 'sos';
```

**Примечание:** В будущем, если потребуется строгая типизация, можно использовать `EntityKey = StaticEntityKey | string`, где `StaticEntityKey` - union литеральных типов.

### Примеры новой структуры

**Привычки:**

```typescript
{
  id: 'habit_water_reminder_01',
  kind: 'habits',
  entityKey: 'water',        // ✅ Универсальный идентификатор
  intent: 'build',
  subtype: 'reminder',
  directness: ['soft', 'moderate', 'hard'],
  ru: { ... }
}
```

**Терапия:**

```typescript
{
  id: 'therapy_anxiety_breath_01',
  kind: 'therapy',
  entityKey: 'anxiety',      // ✅ Тема как идентификатор
  techniques: ['breath_cue'], // ✅ Метаданные для будущего использования
  subtype: 'reminder',        // ✅ Добавляем subtype как в привычках
  directness: ['soft', 'moderate', 'hard'],
  ru: { ... }
}
```

## Изменения по компонентам

### 1. Типы и интерфейсы

**Файл:** `app/lib/notificationTemplates.ts`

**Изменения:**

1. Удалить `TherapyType` и `HabitsType`
2. Создать универсальный тип `EntityKey`
3. Удалить поле `type` из интерфейса `NotificationTemplate`
4. Удалить поле `topic` из интерфейса
5. Удалить поле `habitKey` из интерфейса
6. Добавить обязательное поле `entityKey: EntityKey`
7. Добавить опциональное поле `techniques?: TherapyTechnique[]` для терапии (метаданные)
8. Создать универсальный тип `NotificationSubtype` (заменяет `HabitSubtype`)
9. Добавить `subtype?: NotificationSubtype` для терапии (унификация с привычками)

**Новый интерфейс:**

```typescript
// Универсальный тип subtype для всех видов уведомлений
export type NotificationSubtype =
  | 'reminder'
  | 'informational'
  | 'motivational'
  | 'mixed';

export interface NotificationTemplate {
  id: string;
  kind: NotificationKind;
  entityKey: EntityKey;                    // ✅ Универсальный идентификатор
  intent?: HabitIntent;                     // Только для habits
  subtype?: NotificationSubtype;            // Для habits и therapy (опционально)
  techniques?: TherapyTechnique[];          // Только для therapy (метаданные)
  directness: Directness[];
  ru: {
    universal?: string;
    informal?: { ... };
    formal?: { ... };
  };
}
```

**Принцип для subtype:**

- В шаблонах: поле опциональное (некоторые общие тексты могут быть без жёсткого subtype)
- В настройках (prefs): поле обязательное, но может быть `null`, если пользователь не выбрал фокус

### 2. Шаблоны привычек

**Файл:** `app/lib/notificationTemplates.ts`

**Изменения:**

- Удалить поле `type` из всех шаблонов привычек
- Переименовать `habitKey` → `entityKey`
- Структура остается прежней

**Было:**

```typescript
{
  id: 'habit_water_reminder_01',
  kind: 'habits',
  type: 'water',        // ❌ Удалить
  habitKey: 'water',    // ❌ Переименовать
  intent: 'build',
  subtype: 'reminder',
  ...
}
```

**Станет:**

```typescript
{
  id: 'habit_water_reminder_01',
  kind: 'habits',
  entityKey: 'water',   // ✅ Единое поле
  intent: 'build',
  subtype: 'reminder',
  ...
}
```

### 3. Шаблоны терапии

**Файл:** `app/lib/notificationTemplates.ts`

**Изменения:**

- Удалить поле `type` из всех шаблонов терапии
- Удалить поле `topic`, заменить на `entityKey`
- Добавить поле `subtype` для унификации с привычками
- Добавить опциональное поле `techniques` (метаданные)

**Было:**

```typescript
{
  id: 'psy_breath_478_01',
  kind: 'therapy',
  type: 'breath_cue',   // ❌ Удалить (техника)
  topic: 'anxiety',     // ❌ Переименовать в entityKey
  directness: [...],
  ...
}
```

**Станет:**

```typescript
{
  id: 'therapy_anxiety_breath_01',
  kind: 'therapy',
  entityKey: 'anxiety',           // ✅ Тема как идентификатор
  techniques: ['breath_cue'],      // ✅ Метаданные
  subtype: 'reminder',             // ✅ Добавляем для унификации
  directness: [...],
  ...
}
```

**Важно:** ✅ Все шаблоны терапии должны быть привязаны к конкретной теме. Универсальные "безтемные" шаблоны будут удалены.

### 4. Функция findTemplate

**Файл:** `app/lib/notificationTemplates.ts`

**Изменения:**

1. Удалить параметр `type` из опций
2. Удалить параметр `habitKey` из опций
3. Оставить только `entityKey` как универсальный идентификатор
4. Упростить логику фильтрации

**Было:**

```typescript
export function findTemplate(
  kind: NotificationKind,
  options?: {
    entityKey?: string;
    type?: TherapyType | HabitsType;      // ❌ Удалить
    intent?: HabitIntent;
    habitKey?: HabitKey;                   // ❌ Удалить
    subtype?: NotificationSubtype;
    ...
  }
): NotificationTemplate | null
```

**Станет:**

```typescript
export function findTemplate(
  kind: NotificationKind,
  options?: {
    entityKey?: EntityKey; // ✅ Единый идентификатор
    intent?: HabitIntent; // Только для habits
    subtype?: NotificationSubtype; // Для habits и therapy
    excludeTemplateIds?: string[];
    useFirst?: boolean;
    templateIndex?: number;
  }
): NotificationTemplate | null;
```

**Новая логика фильтрации:**

```typescript
const templates = notificationTemplates.filter((t) => {
  const matchKind = t.kind === kind;
  const matchEntityKey = !entityKey || t.entityKey === entityKey;

  // Проверка специфичных для kind полей
  let matchByKindSpecific = true;

  if (kind === 'habits') {
    if (intent !== undefined) {
      matchByKindSpecific = matchByKindSpecific && t.intent === intent;
    }
    if (subtype !== undefined) {
      matchByKindSpecific = matchByKindSpecific && t.subtype === subtype;
    }
  }

  if (kind === 'therapy') {
    if (subtype !== undefined) {
      matchByKindSpecific = matchByKindSpecific && t.subtype === subtype;
    }
  }

  return matchKind && matchEntityKey && matchByKindSpecific && notExcluded;
});
```

### 5. Использование в коде

**Файлы для обновления:**

- `server/application/notifications/scheduler.service.ts`
- `server/api/notifications/prefs/[kind].put.ts`
- `server/api/notifications/test-quick.post.ts`
- `app/components/notifications/NotificationPreview.vue`
- Все места, где вызывается `findTemplate`

**Изменения в вызовах findTemplate:**

**Было:**

```typescript
template = findTemplate(kind, {
  entityKey: entityKey,
  type: someType, // ❌ Удалить
  habitKey: habitKey, // ❌ Удалить
  intent: intent,
  subtype: subtype,
});
```

**Станет:**

```typescript
template = findTemplate(kind, {
  entityKey: entityKey, // ✅ Единый идентификатор
  intent: intent, // Только для habits
  subtype: subtype, // Для habits и therapy
});
```

### 6. База данных

**Важно:** В БД уже используется `entityKey` в таблицах:

- `notification_preferences.entityKey`
- `notification_slots.entityKey`
- `ai_generated_notification_texts.entityKey`

**Изменения не требуются** - поле `entityKey` уже используется корректно.

### 7. Добавление subtype для терапии

**Требуется:**

1. Добавить поле `subtype` в шаблоны терапии (аналогично привычкам)
2. Добавить фильтрацию по `subtype` в `findTemplate` для терапии
3. Обновить UI для терапии, чтобы показывать выбор subtype

**Значения subtype для терапии:** ✅ Те же, что и для привычек (`reminder`, `informational`, `motivational`, `mixed`). Унификация полная.

## Этапы реализации

### Этап 1: Подготовка и планирование

1. ✅ Создать ТЗ (этот документ)
2. Оценить объём работ
3. Спланировать последовательность изменений

### Этап 2: Рефакторинг типов и шаблонов

1. Обновить типы и интерфейсы
2. Создать `NotificationSubtype` (замена `HabitSubtype`)
3. Обновить все шаблоны привычек (убрать `type`, переименовать `habitKey` → `entityKey`)
4. Обновить все шаблоны терапии (убрать `type`, заменить `topic` → `entityKey`, добавить `subtype` и `techniques`)
5. Удалить универсальные "безтемные" шаблоны терапии

### Этап 3: Обновление логики

1. Обновить функцию `findTemplate`
2. Обновить все вызовы `findTemplate`
3. Обновить логику в `scheduler.service.ts`
4. Обновить логику в API endpoints

### Этап 4: Унификация настроек (subtype, directness, textSource)

1. Убрать все условия в UI, которые скрывают настройки для кастомных сущностей
2. Разрешить сохранение `subtype` для всех типов сущностей в БД
3. Обновить логику в планировщике для использования `subtype` везде
4. Обновить AI-генерацию для поддержки `subtype` в терапии
5. Протестировать работу всех трех настроек для всех типов сущностей

### Этап 5: Тестирование

1. Проверить работу привычек
2. Проверить работу терапии
3. Проверить кастомные сущности
4. Проверить фильтрацию и выбор шаблонов

### Этап 6: Очистка

1. Удалить неиспользуемые типы (`TherapyType`, `HabitsType`, `HabitKey`)
2. Удалить старые комментарии
3. Обновить документацию

## Подводные камни и решения

### 1. Потеря второго измерения классификации

**Проблема:** Удаление `type` означает потерю возможности иметь двухуровневую иерархию (например, `type = movement`, `entityKey = "steps"`).

**Решение:** Для MVP это приемлемо. Если в будущем понадобится иерархия, можно будет добавить опциональное поле `category` или использовать префиксы в `entityKey`.

### 2. Техники терапии как метаданные

**Проблема:** Техники (breath_cue, grounding) больше не используются для фильтрации.

**Решение:** Хранить техники в опциональном поле `techniques?: TherapyTechnique[]` как метаданные. В будущем можно использовать для статистики, аналитики или расширенной фильтрации.

### 3. Шаблоны терапии без темы

**Проблема:** Некоторые шаблоны терапии не привязаны к конкретной теме (`topic: undefined`).

**Решение:** ✅ Удалить все универсальные "безтемные" шаблоны терапии. Каждый шаблон должен быть привязан к конкретной теме через `entityKey`.

### 4. Конфликт имен в EntityKey

**Проблема:** Возможны конфликты между привычками и терапией (например, `sleep` может быть и темой терапии, и привычкой).

**Решение:** ✅ Использовать пространства имен через `kind` + `entityKey`, что уже реализовано. Префиксы не нужны.

### 5. Обратная совместимость

**Проблема:** Старые данные могут ссылаться на `type` или `habitKey`.

**Решение:** Это не проблема, так как:

- Шаблоны хранятся в коде, а не в БД
- В БД уже используется `entityKey`
- Можно сделать миграцию скриптом при обновлении кода

## Ответы на вопросы (утверждено)

1. **Subtype для терапии:** ✅ Использовать те же значения, что и для привычек (`reminder`, `informational`, `motivational`, `mixed`)

2. **Универсальные шаблоны терапии:** ✅ Убрать полностью "безтемные" универсальные шаблоны терапии

3. **Техники как метаданные:** ✅ Добавить поле `techniques` в шаблоны терапии (как метаданные, не для фильтрации)

4. **Префиксы в entityKey:** ✅ Достаточно `kind` + `entityKey` (пространства имен уже реализованы)

## Унификация настроек уведомлений

### Критическое требование: Все три настройки везде

**Цель:** Все три настройки должны использоваться везде, независимо от типа сущности:

1. **Фокус уведомлений (subtype)** - `reminder`, `informational`, `motivational`, `mixed`
2. **Стиль уведомлений (directness)** - `soft`, `moderate`, `hard`
3. **Способ создания (textSource)** - `templates`, `ai`, `hybrid`

**Текущее состояние проблемы:**

- ❌ В готовых привычках: есть все три настройки
- ❌ В кастомных привычках: только `textSource`, нет `subtype` и `directness`
- ❌ В терапии: только `directness` и `textSource`, нет `subtype`
- ❌ В кастомной терапии: только `textSource`, нет `subtype` и `directness`

**Требуется:**

1. **UI (`NotificationSettingsPage.vue`):**

   - Убрать все условия `v-if="isHabits && !isCustomHabit"` и `v-if="!isCustomHabit"`
   - Показывать все три блока настроек всегда
   - Для терапии добавить блок "Фокус уведомлений" (subtype)

2. **Бэкенд:**

   - Убрать всю логику, где `subtype = null` для кастомных привычек
   - Добавить поддержку `subtype` для терапии (в БД и логике)
   - Убрать условия, где `directness` игнорируется для кастомных привычек

3. **Шаблоны:**
   - Все шаблоны терапии должны иметь поле `subtype`
   - Упростить логику фильтрации

**Подводные камни при унификации:**

1. **Кастомные привычки:**

   - Сейчас `subtype = null` в БД для кастомных привычек
   - Нужно разрешить сохранение `subtype` в БД
   - При `textSource = 'templates'` и `subtype = 'reminder'` - использовать только reminder-тексты из `customTexts`
   - При `textSource = 'ai'` - использовать `subtype` в промпте для AI-генерации

2. **Терапия:**

   - Сейчас `subtype` не используется вообще
   - Нужно добавить `subtype` в шаблоны терапии
   - Нужно добавить фильтрацию по `subtype` в `findTemplate`
   - Для кастомной терапии - аналогично кастомным привычкам

3. **AI-генерация:**

   - Нужно учитывать `subtype` в промптах для AI-генерации (и для привычек, и для терапии)
   - Обновить хеширование конфигурации, чтобы учитывать `subtype` для терапии

4. **Планировщик (`scheduler.service.ts`):**
   - Убрать проверки `isCustomHabit` при определении `actualSubtype`
   - Добавить поддержку `subtype` для терапии
   - Упростить логику выбора шаблонов

**Файлы для изменений:**

- `app/components/notifications/NotificationSettingsPage.vue` - убрать условия, добавить subtype для терапии
- `server/api/notifications/prefs/[kind].put.ts` - убрать логику `subtype = null` для кастомных
- `server/api/notifications/prefs/[kind].get.ts` - разрешить возврат subtype для кастомных
- `server/application/notifications/scheduler.service.ts` - упростить логику subtype
- `server/application/notifications/ai-generation.service.ts` - добавить subtype для терапии в промпты
- `server/utils/notification-ai-config-hash.ts` - добавить subtype для терапии в хеш
- `shared/dto/notifications.ts` - убедиться, что subtype не обязательное, но разрешенное для всех

## Анализ подводных камней

### Текущие проблемы в коде

**1. UI скрывает настройки для кастомных сущностей:**

```vue
<!-- NotificationSettingsPage.vue -->
<!-- Фокус уведомлений - только для готовых привычек -->
<div v-if="isHabits && !isCustomHabit">
  <!-- subtype выбор -->
</div>

<!-- Стиль уведомлений - скрыт для кастомных привычек -->
<div v-if="!isCustomHabit">
  <!-- directness выбор -->
</div>

<!-- Способ создания - показывается всегда -->
<div>
  <!-- textSource выбор -->
</div>
```

**Проблема:** Пользователь не может настроить `subtype` и `directness` для кастомных привычек и терапии.

**2. Бэкенд устанавливает `subtype = null` для кастомных:**

```typescript
// prefs/[kind].put.ts
const nextSubtype =
  kind === 'habits' && !isCustomHabitForSubtype
    ? body.subtype !== undefined
      ? body.subtype
      : (existing.subtype as NotificationSubtype | null)
    : null; // ❌ Всегда null для кастомных
```

**Проблема:** Даже если пользователь хочет установить subtype, он будет проигнорирован для кастомных сущностей.

**3. Планировщик игнорирует subtype для кастомных:**

```typescript
// scheduler.service.ts
// Для кастомных привычек subtype всегда null, не обрабатываем его
let actualSubtype = sourcePref.subtype;

if (!isCustomHabit) {
  // обрабатываем subtype только для готовых
  if (sourcePref.subtype === 'mixed') { ... }
}
// Для кастомных привычек actualSubtype остается null
```

**Проблема:** Даже если subtype сохранен в БД, он не используется при генерации слотов.

**4. Терапия не поддерживает subtype:**

```typescript
// В шаблонах терапии нет поля subtype
// В findTemplate нет фильтрации по subtype для терапии
// В UI нет выбора subtype для терапии
```

**Проблема:** Терапия не может использовать subtype для фильтрации шаблонов.

**5. Множественные условия для определения типа сущности:**

```typescript
// Много проверок isCustomHabit, isCustomTherapy по всему коду
if (isCustomHabit) {
  // логика для кастомных привычек
} else if (isCustomTherapy) {
  // логика для кастомной терапии
} else {
  // логика для готовых
}
```

**Проблема:** Дублирование логики, сложность поддержки.

### Решения и упрощения

**1. Единая логика для всех типов сущностей:**

```typescript
// Упрощенная логика - единая для всех
const subtype = prefs.subtype; // Всегда используется
const directness = prefs.directness; // Всегда используется
const textSource = prefMeta?.textSource || 'templates'; // Всегда используется

// Выбор текста на основе textSource
if (textSource === 'templates') {
  // Использовать шаблоны с учетом subtype и directness
} else if (textSource === 'ai') {
  // Генерировать AI с учетом subtype и directness
} else if (textSource === 'hybrid') {
  // Чередовать шаблоны и AI
}
```

**2. Упрощенная фильтрация шаблонов:**

```typescript
// Единая логика для habits и therapy
const templates = notificationTemplates.filter((t) => {
  return (
    t.kind === kind &&
    t.entityKey === entityKey &&
    (!subtype || t.subtype === subtype) && // Для всех типов
    (!intent || t.intent === intent) && // Только для habits
    matchesDirectness(t, directness)
  );
});
```

**3. Упрощенная структура настроек:**

```typescript
// Единая структура для всех типов
interface UnifiedNotificationPreferences {
  kind: 'habits' | 'therapy';
  entityKey: string;
  subtype: NotificationSubtype | null; // Всегда разрешено, может быть null
  directness: Directness; // Всегда обязательное
  textSource: 'templates' | 'ai' | 'hybrid'; // Всегда разрешено
  // ... остальные поля
}
```

## Упрощения кодовой базы

### Цель: Максимально упростить код

**1. Удаление дублирования:**

- Убрать все проверки `isCustomHabit`, `isCustomTherapy` при работе с `subtype` и `directness`
- Использовать единую логику для всех типов сущностей

**2. Упрощение условий:**

- Вместо множественных `if (isCustomHabit) ... else if (isCustomTherapy) ... else ...` использовать единую логику
- Использовать `kind` для определения типа, но не для различия в обработке настроек

**3. Упрощение шаблонов:**

- Убрать все специальные случаи для кастомных сущностей
- Все сущности (готовые/кастомные) обрабатываются одинаково по настройкам

**4. Упрощение фильтрации:**

- Единая логика фильтрации шаблонов для habits и therapy
- Разница только в наличии `intent` для habits

**Конкретные упрощения:**

```typescript
// БЫЛО (сложно):
if (isCustomHabit) {
  subtype = null;
  // customTexts только
} else if (isCustomTherapy) {
  subtype = null;
  // customTexts только
} else {
  subtype = prefs.subtype;
  // шаблоны или AI
}

// СТАНЕТ (просто):
subtype = prefs.subtype; // Всегда используется, для всех типов
// Единая логика выбора текста на основе textSource
```

```typescript
// БЫЛО:
v-if="isHabits && !isCustomHabit" // показывать subtype только для готовых привычек
v-if="!isCustomHabit" // показывать directness только для готовых

// СТАНЕТ:
// Всегда показывать, без условий
```

## Следующие шаги

После утверждения ТЗ:

1. Обновить типы и интерфейсы
2. Обновить все шаблоны (привычки и терапия)
3. Удалить поле `type` и дублирование
4. Добавить `entityKey` везде
5. Добавить `subtype` для терапии
6. Добавить `techniques` для терапии
7. Обновить функцию `findTemplate`
8. Обновить все вызовы `findTemplate`
9. Унифицировать настройки (убрать условия в UI)
10. Упростить логику в бэкенде
11. Обновить AI-генерацию для поддержки subtype в терапии
12. Протестировать изменения
13. Обновить документацию

## Ссылки

- [Entity Identification](./entity_identification.md)
- [Unified Notification Texts](./tz_unified_notification_texts.md)
- [Architecture](./architecture.md)
