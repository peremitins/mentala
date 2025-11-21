# ТЗ: Улучшения системы уведомлений для кастомных привычек и терапии

**Дата создания:** 2025-01-18  
**Статус:** В работе  
**Приоритет:** Высокий

## 📋 Обзор

Данное ТЗ описывает комплекс улучшений системы уведомлений для кастомных и готовых шаблонов привычек и терапии, включая:

- Исправление проблемы с "undefined" в уведомлениях
- Добавление человекочитаемых URL (slug) для кастомных сущностей
- Реализацию режимов генерации уведомлений:
  - Для всех сущностей: Templates/AI/Hybrid
- Добавление метки AI в уведомлениях
- Полноценная интеграция AI-генерации с использованием OpenAI GPT и поддержкой разных провайдеров

---

## 🐛 Проблема 1: "undefined" в уведомлениях

### Описание проблемы

В уведомлениях для кастомных привычек в dev-режиме отображается "undefined" вместо типа уведомления:

```
[DrtvFE_bjBS80qV_gR_8U | undefined | MODERATE] 5. делай!!!!!
```

### Причина

- Для кастомных привычек `subtype` не устанавливается при создании
- В `scheduler.service.ts` (строка 1361) используется `actualSubtype?.toUpperCase()`, что дает "UNDEFINED"
- Для кастомных привычек с `customText` тип не используется в логике выбора шаблонов

### Решение

1. **Для кастомных привычек с кастомными текстами:**

   - Устанавливать `subtype = null` по умолчанию
   - Это явно показывает, что тип не используется

2. **Для кастомных привычек без текстов (будущее с AI):**

   - Устанавливать `subtype = 'mixed'` или выбранный пользователем тип

3. **Для кастомных терапий:**

   - Оставлять `subtype = null` (как сейчас, типы не используются для терапии)

4. **Исправить обработку в `scheduler.service.ts`:**
   ```typescript
   // Строка 1361 - исправить devPrefix
   const entityLabel = entityKey || 'custom';
   const subtypeLabel = actualSubtype
     ? actualSubtype.toUpperCase()
     : isCustomHabit
       ? 'CUSTOM'
       : 'N/A';
   devPrefix = `[${entityLabel}|${subtypeLabel}|${sourcePref.directness.toUpperCase()}] `;
   ```

### Файлы для изменения

- `server/api/habits/index.post.ts` - установка `subtype = null` для кастомных
- `server/api/notifications/prefs/[kind].put.ts` - валидация и установка по умолчанию
- `server/application/notifications/scheduler.service.ts` - исправление devPrefix
- `app/components/notifications/NotificationSettingsPage.vue` - не показывать выбор subtype для кастомных

---

## 🔗 Проблема 2: Нечитаемые URL для кастомных привычек и терапии

### Описание проблемы

В URL для кастомных привычек и терапии используется `nanoid()` (например, `DrtvFE_bjBS80qV_gR_8U`), что неудобно для пользователей и SEO.

**Текущий URL:**

```
/habits/DrtvFE_bjBS80qV_gR_8U
```

**Желаемый URL:**

```
/habits/gimnastika
```

### Решение

1. **Добавить поле `slug` в БД:**

   - В таблицу `habits` добавить `slug varchar(255)`
   - В таблицу `therapy_topics_custom` добавить `slug varchar(255)`
   - Сделать уникальным в рамках пользователя: `UNIQUE(user_id, slug)`

2. **Установить библиотеку для транслитерации:**

   ```bash
   pnpm add speakingurl
   ```

   - Библиотека `speakingurl` поддерживает транслитерацию с разных языков
   - Преобразует кириллицу в латиницу
   - Создает URL-friendly строки

3. **Создать утилиту для генерации slug:**

   ```typescript
   // server/utils/slug.ts
   import { getSlug } from 'speakingurl';

   export function generateSlug(
     name: string,
     existingSlugs: string[] = []
   ): string {
     let baseSlug = getSlug(name, {
       lang: 'ru', // Поддержка русской транслитерации
       separator: '-',
       maintainCase: false,
       truncate: 50,
     });

     // Обработка дубликатов
     let slug = baseSlug;
     let counter = 1;
     while (existingSlugs.includes(slug)) {
       slug = `${baseSlug}-${counter}`;
       counter++;
     }

     return slug;
   }
   ```

4. **Обновить API создания/обновления:**

   - При создании привычки/терапии генерировать slug из названия
   - При обновлении названия обновлять slug (опционально)
   - Сохранять обратную совместимость: искать по slug, если не найден - по id

5. **Обновить роутинг:**
   - В `app/pages/habits/[id].vue` и `app/pages/therapy/[id].vue`
   - Сначала искать по slug, если не найдено - по id (для обратной совместимости)

### Файлы для изменения

- `server/infrastructure/db/schema.ts` - добавить поле `slug`
- `server/infrastructure/db/migrations/XXXX_add_slug_to_habits_and_therapy.sql` - миграция
- `server/utils/slug.ts` - утилита для генерации slug (новый файл)
- `server/api/habits/index.post.ts` - генерация slug при создании
- `server/api/habits/[id].put.ts` - обновление slug при изменении названия
- `server/api/therapy/custom/index.post.ts` - генерация slug при создании
- `server/api/therapy/custom/[id].put.ts` - обновление slug
- `server/api/habits/[id].get.ts` - поиск по slug или id
- `server/api/therapy/custom/[id].get.ts` - поиск по slug или id
- `app/pages/habits/[id].vue` - использование slug в URL
- `app/pages/therapy/[id].vue` - использование slug в URL
- `app/pages/habits/index.vue` - навигация с slug
- `app/pages/therapy/index.vue` - навигация с slug

### Примеры транслитерации

- "Гимнастика" → "gimnastika"
- "Пить воду" → "pit-vodu"
- "Делать зарядку" → "delat-zaryadku"
- "Тревога и стресс" → "trevoga-i-stress"

---

## 🤖 Проблема 3: Режимы генерации уведомлений

### Описание

Необходимо добавить возможность выбора способа генерации текстов уведомлений:

**Для всех сущностей (кастомных и готовых шаблонов):**

1. **Templates** - использовать готовые тексты из шаблонов или пользовательские тексты (для кастомных)
2. **AI** - тексты генерируются искусственным интеллектом
3. **Hybrid** - комбинация пользовательских/шаблонных текстов и AI-генерации

### Важное отличие

- **Для кастомных:** режим "Templates" означает использование пользовательских текстов из `meta.customTexts`
- **Для готовых шаблонов:** режим "Templates" означает использование готовых текстов из `notificationTemplates.ts`
- **Конфликт имен:** `subtype: 'mixed'` используется для типа уведомления (чередование reminder/informational/motivational), поэтому для режимов генерации используем `'hybrid'` вместо `'mixed'`

### Решение

#### 1. Обновить структуру данных

**В `shared/dto/notifications.ts`:**

```typescript
export interface NotificationPreferenceMeta {
  customTexts?: string[];
  // Дополнительные параметры (techniques, goalType и т.д.)
}
```

**Поле `textSource` хранится в `notification_preferences.textSource`:**

```typescript
textSource: 'templates' | 'ai' | 'hybrid';
```

#### 2. UI компонент для выбора режима генерации

**Размещение:** В `NotificationSettingsPage.vue`, перед секцией "Тексты уведомлений" (для кастомных) или после "Типа уведомления" (для готовых шаблонов)

**Компонент:** Использовать `ToggleGroup` из shadcn-vue

```vue
<!-- Способ создания уведомлений -->
<div class="space-y-2 mb-4">
  <div class="flex items-center justify-between">
    <div>
      <p class="text-sm font-semibold text-gray-900 dark:text-gray-100">
        Способ создания
      </p>
      <p class="text-xs text-gray-500 dark:text-gray-400">
        Выберите способ создания текстов уведомлений
      </p>
    </div>
  </div>

  <ToggleGroup
    v-model="textSource"
    type="single"
    class="inline-flex w-full rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 p-1"
  >
    <ToggleGroupItem
      value="templates"
      class="flex-1 rounded-md px-3 py-2 text-sm font-medium transition-all data-[state=on]:bg-white data-[state=on]:shadow-sm data-[state=on]:text-blue-600 dark:data-[state=on]:bg-gray-700 dark:data-[state=on]:text-blue-400"
    >
      📋 Шаблоны
    </ToggleGroupItem>
    <ToggleGroupItem
      value="ai"
      class="flex-1 rounded-md px-3 py-2 text-sm font-medium transition-all data-[state=on]:bg-white data-[state=on]:shadow-sm data-[state=on]:text-blue-600 dark:data-[state=on]:bg-gray-700 dark:data-[state=on]:text-blue-400"
    >
      ✨ ИИ
    </ToggleGroupItem>
    <ToggleGroupItem
      value="hybrid"
      class="flex-1 rounded-md px-3 py-2 text-sm font-medium transition-all data-[state=on]:bg-white data-[state=on]:shadow-sm data-[state=on]:text-blue-600 dark:data-[state=on]:bg-gray-700 dark:data-[state=on]:text-blue-400"
    >
      🔀 Гибридный
    </ToggleGroupItem>
  </ToggleGroup>
</div>
```

**Примечание:** Компонент `ToggleGroup` используется для всех сущностей (кастомных и готовых шаблонов) с одинаковым заголовком "Способ создания" и подзаголовком "Выберите способ создания текстов уведомлений".

**Опции для готовых шаблонов:**

```typescript
// app/constants/select-options.ts
export const TEXT_SOURCE_OPTIONS = [
  {
    label: 'Шаблоны',
    value: 'templates',
    description: 'Использовать готовые тексты уведомлений',
  },
  {
    label: 'ИИ',
    value: 'ai',
    description:
      'Генерировать новые тексты с помощью искусственного интеллекта',
  },
  {
    label: 'Гибридный',
    value: 'hybrid',
    description: 'Комбинация готовых шаблонов и AI-генерации',
  },
];
```

#### 4. Условное отображение секций

**Для кастомных:**

- **Секция "Тексты уведомлений"** показывается только в режимах `templates` и `hybrid`
- **Информационный блок про AI** показывается в режимах `ai` и `hybrid`

**Для готовых шаблонов:**

- Все секции остаются видимыми (фокус уведомления, Стиль уведомлений)
- Информационный блок про AI показывается в режимах `ai` и `hybrid`

#### 5. Логика работы AI для готовых шаблонов

AI должен генерировать тексты с нуля, учитывая все параметры:

```typescript
// server/application/notifications/ai-generator.ts (новый файл)
export async function generateAiNotification(params: {
  kind: NotificationKind;
  habitKey?: string;
  entityKey?: string;
  subtype: 'reminder' | 'informational' | 'motivational';
  directness: 'soft' | 'moderate' | 'hard';
  addressing: 'informal' | 'formal';
  intent?: 'build' | 'quit';
  habitName?: string;
  description?: string;
  userName?: string;
}): Promise<string> {
  const prompt = `
Создай текст уведомления для ${params.kind === 'habits' ? 'привычки' : 'терапии'}.

Параметры:
- Тип: ${params.subtype} (reminder/informational/motivational)
- Стиль: ${params.directness} (soft/moderate/hard)
- Обращение: ${params.addressing} (informal/formal)
${params.intent ? `- Намерение: ${params.intent} (build/quit)` : ''}
${params.habitName ? `- Название: ${params.habitName}` : ''}
${params.description ? `- Описание: ${params.description}` : ''}
${params.habitKey ? `- Ключ привычки: ${params.habitKey}` : ''}
${params.entityKey ? `- Сущность: ${params.entityKey}` : ''}

Требования:
- Максимум 178 символов
- Можно использовать {name} для имени пользователя
- Соответствовать выбранному типу и стилю
- Быть естественным и мотивирующим
- Для reminder: простые напоминания
- Для informational: факты и информация
- Для motivational: поддержка и мотивация
`;

  // Вызов AI API
  const response = await chatViaProvider({
    provider: 'openai',
    messages: [
      {
        role: 'system',
        content:
          'Ты помощник для создания текстов уведомлений. Создавай краткие, мотивирующие сообщения.',
      },
      {
        role: 'user',
        content: prompt,
      },
    ],
    options: {
      temperature: 0.7,
    },
  });

  return response.content.trim();
}
```

#### 6. Логика в scheduler.service.ts

```typescript
// Определяем источник текста
const isCustom = kind === 'habits' && intent === 'custom';
const textSource = pref.textSource || 'templates';

let text: string | null = null;
let templateIdForSlot = 'custom_user_text';
let template: ReturnType<typeof findTemplate> | null = null;

// Для кастомных
if (isCustom) {
  if (textSource === 'templates' || textSource === 'hybrid') {
    // Используем кастомные тексты
    const customText = pickCustomTextFromMeta(prefMeta, userName, customTextIndex);
    if (customText) {
      text = customText;
      if (textSource === 'hybrid' && Math.random() < 0.3) {
        // 30% AI в hybrid режиме
        text = await generateAiNotification({ ... });
        templateIdForSlot = 'ai_generated';
      }
    }
  }

  if (!text && (textSource === 'ai' || textSource === 'hybrid')) {
    // Генерируем через AI
    text = await generateAiNotification({
      kind,
      habitKey,
      subtype: actualSubtype || 'mixed',
      directness: pref.directness,
      addressing,
      intent,
      habitName: habit?.name,
      description: habit?.description,
      userName,
    });
    templateIdForSlot = 'ai_generated';
  }
}
// Для готовых шаблонов
else {
  if (textSource === 'templates' || textSource === 'hybrid') {
    // Используем готовые шаблоны
    template = findTemplate(kind, {
      entityKey: pref.entityKey ?? undefined,
      intent,
      habitKey: habitKey as any,
      subtype: actualSubtype,
      excludeTemplateIds,
    });

    if (template) {
      text = getTemplateText(template, addressing, pref.directness, userName);
      templateIdForSlot = template.id;

      // В hybrid режиме 30% заменяем на AI
      if (textSource === 'hybrid' && Math.random() < 0.3) {
        text = await generateAiNotification({
          kind,
          habitKey,
          entityKey: pref.entityKey ?? undefined,
          subtype: actualSubtype || 'mixed',
          directness: pref.directness,
          addressing,
          intent,
          habitName: habit?.name,
          description: habit?.description,
          userName,
        });
        templateIdForSlot = 'ai_generated';
      }
    }
  }

  if (!text && textSource === 'ai') {
    // Генерируем через AI
    text = await generateAiNotification({
      kind,
      habitKey,
      entityKey: pref.entityKey ?? undefined,
      subtype: actualSubtype || 'mixed',
      directness: pref.directness,
      addressing,
      intent,
      habitName: habit?.name,
      description: habit?.description,
      userName,
    });
    templateIdForSlot = 'ai_generated';
  }
}
```

#### 7. Валидация

**Для кастомных:**

- **Templates:** требуется хотя бы один текст (для кастомных)
- **AI:** тексты не требуются, но желательно описание привычки
- **Hybrid:** требуется хотя бы один текст (для ручной части)

**Для готовых шаблонов:**

- **Templates:** работает как сейчас (по умолчанию)
- **AI:** не требует дополнительных данных, но может использовать описание привычки/терапии
- **Hybrid:** работает автоматически (70% шаблоны, 30% AI)

#### 8. Сохранение в БД

При сохранении настроек:

- Для всех сущностей: сохранять `textSource` в `notification_preferences.textSource`

### Файлы для изменения

- `shared/dto/notifications.ts` - добавить `textSource` в `NotificationPreferencesDto`
- `app/constants/select-options.ts` - добавить `TEXT_SOURCE_OPTIONS`
- `app/components/notifications/NotificationSettingsPage.vue` - добавить UI выбора режима для кастомных и готовых
- `server/api/notifications/prefs/[kind].put.ts` - сохранение `textSource`
- `server/application/notifications/scheduler.service.ts` - логика генерации на основе режима
- `server/application/notifications/ai-generator.ts` - новый файл для AI-генерации (будущее)

---

## 🏷️ Проблема 4: Метка AI в уведомлениях

### Описание

В уведомлениях, созданных AI, должна быть метка в начале текста, указывающая на то, что текст сгенерирован искусственным интеллектом.

### Решение

#### 1. В превью уведомлений

**В `app/components/notifications/NotificationPreview.vue`:**

```vue
<div class="mb-3 text-base leading-relaxed text-gray-900 dark:text-gray-100">
  <span
    v-if="isAiGenerated"
    class="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 text-xs font-medium mr-2"
  >
    <span>✨</span>
    <span>AI</span>
  </span>
  {{ previewText }}
</div>
```

#### 2. В реальных уведомлениях

**В `server/application/notifications/scheduler.service.ts`:**

```typescript
// При генерации уведомления
if (isAiGenerated) {
  const aiBadge = '✨ AI ';
  text = `${aiBadge}${text}`;
  // Или добавить в payload.data.isAiGenerated = true для более гибкой обработки
}
```

#### 3. Альтернативный вариант (более гибкий)

Добавить в `payload.data` флаг `isAiGenerated` и обрабатывать на клиенте:

```typescript
payload.data = {
  ...payload.data,
  isAiGenerated: true, // или false
};
```

Тогда на клиенте можно стилизовать метку по-разному в зависимости от платформы.

### Файлы для изменения

- `app/components/notifications/NotificationPreview.vue` - показ метки в превью
- `server/application/notifications/scheduler.service.ts` - добавление метки при генерации
- `app/components/notifications/NotificationIndexPage.vue` - показ метки в списке (если нужно)

---

## 🤖 Проблема 5: Интеграция AI-генерации текстов уведомлений

### Описание

Необходимо реализовать полноценную интеграцию AI-генерации текстов уведомлений с использованием OpenAI GPT (последняя версия API) с возможностью легкого переключения между разными AI-провайдерами (OpenAI, DeepSeek, Groq и др.).

### Ключевые требования

1. **Использование существующей архитектуры:** Интеграция с текущей системой провайдеров LLM (`server/application/llm.service.ts`)
2. **Хранение сгенерированных текстов:** Сохранение в БД для переиспользования и экономии токенов
3. **Умная регенерация:** Регенерация только при изменении релевантных настроек (название, описание, tone, directness)
4. **Экономия токенов:** Минимизация лишних запросов к AI
5. **Разные модели для разных сценариев:** `gpt-4o` для чата, `gpt-4o-mini` для уведомлений
6. **Сохранение текущей логики:** Все существующие режимы (templates/ai/hybrid) должны продолжать работать

### Архитектура

#### 1. Использование существующей системы провайдеров

Проект уже имеет архитектуру провайдеров LLM. Для уведомлений используется тот же сервис, но с другими параметрами:

- **Чат с аватаром:** `chatStreamViaProvider()` - streaming, интерактивно
- **Генерация уведомлений:** `chatViaProvider()` - batch, сохраняется в БД

**Важно:** Таблица `ai_generated_notification_texts` НЕ влияет на создание слотов. Слоты создаются в `notification_slots` как обычно, просто источник текста расширяется: кастомные → шаблоны → AI-тексты.

#### 2. Структура БД для хранения сгенерированных текстов

**Новая таблица: `ai_generated_notification_texts`**

```sql
CREATE TABLE ai_generated_notification_texts (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL,
  kind VARCHAR(20) NOT NULL, -- 'habits' | 'therapy'
  entity_key VARCHAR(255) NOT NULL, -- идентификатор сущности
  preference_id TEXT NOT NULL, -- FK к notification_preferences.id
  generation_mode VARCHAR(20) NOT NULL, -- 'ai' | 'hybrid'
  texts JSONB NOT NULL, -- массив сгенерированных текстов (до 100)
  generation_config_hash TEXT NOT NULL, -- хеш настроек, влияющих на генерацию
  provider VARCHAR(50) NOT NULL, -- 'openai' | 'deepseek' | 'groq' | ...
  model VARCHAR(100), -- модель, использованная для генерации
  tokens_used INTEGER, -- количество токенов
  cost_usd DECIMAL(10, 6), -- стоимость генерации
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
  expires_at TIMESTAMP WITH TIME ZONE, -- опционально: срок действия кеша

  UNIQUE(user_id, preference_id, generation_config_hash)
);

CREATE INDEX idx_ai_texts_user_pref ON ai_generated_notification_texts(user_id, preference_id);
CREATE INDEX idx_ai_texts_config_hash ON ai_generated_notification_texts(generation_config_hash);
```

**Поля `generation_config_hash`:**
Хеш формируется из настроек, влияющих на генерацию:

- Название сущности (habit/topic name)
- Описание сущности (description)
- `tone` (из UserPreferences)
- `addressing` (из UserPreferences)
- `directness` (из NotificationPreference)
- `subtype` (для привычек, если не null)
- `textSource` (ai/hybrid)

**НЕ включаются в хеш (не влияют на генерацию):**

- `timesPerDay`
- `activeDays`
- `timeRangeStart/End`
- `customSlotTimes`
- `timezone`
- `enabled`

#### 3. Система отслеживания изменений

**Утилита для вычисления хеша конфигурации:**

```typescript
// server/utils/notification-ai-config-hash.ts

interface GenerationConfig {
  entityName: string;
  entityDescription?: string | null;
  tone: 'neutral' | 'supportive' | 'motivational';
  addressing: 'formal' | 'informal';
  directness: 'soft' | 'moderate' | 'hard';
  subtype?: 'reminder' | 'informational' | 'motivational' | 'mixed' | null;
  textSource: 'ai' | 'hybrid';
  kind: 'habits' | 'therapy';
}

export function computeGenerationConfigHash(config: GenerationConfig): string {
  // Создать стабильный JSON и вычислить хеш (SHA-256)
  // Важно: порядок полей должен быть фиксированным
  const normalized = {
    entityName: config.entityName.trim().toLowerCase(),
    entityDescription: (config.entityDescription || '').trim().toLowerCase(),
    tone: config.tone,
    addressing: config.addressing,
    directness: config.directness,
    subtype: config.subtype || null,
    textSource: config.textSource,
    kind: config.kind,
  };

  const json = JSON.stringify(normalized);
  // Использовать crypto.createHash('sha256')
  return hashString(json);
}
```

**Логика проверки необходимости регенерации:**

1. При сохранении настроек уведомлений (`/api/notifications/prefs/*.put.ts`):

   - Вычислить новый `generationConfigHash` на основе `textSource` и других параметров
   - Проверить, существует ли запись в `ai_generated_notification_texts` с таким хешем
   - Если нет или хеш изменился → запустить регенерацию (асинхронно)
   - Если есть → использовать существующие тексты

2. При планировании уведомлений (`scheduler.service.ts`):
   - Проверить режим генерации (`textSource`)
   - Если `ai` или `hybrid` → загрузить тексты из БД
   - Если текстов нет → использовать fallback (шаблоны или кастомные тексты)

#### 4. Конфигурация моделей и настроек

**Обновить `server/config/index.ts`:**

```typescript
export const config = {
  rateLimit: { windowMs: 60_000, max: 60 },
  llm: {
    defaultProvider: 'openai' as 'openai',
    openai: {
      // Общая модель по умолчанию (fallback)
      defaultModel: 'gpt-4o-mini',

      // Модели для разных сценариев
      models: {
        chat: 'gpt-4o', // Чат с аватаром - более мощная модель
        notifications: 'gpt-4o-mini', // Уведомления - экономичная модель
      },

      // Настройки для разных сценариев
      settings: {
        chat: {
          temperature: 0.3,
          maxOutputTokens: 2048,
          enableReasoning: false, // опционально
        },
        notifications: {
          temperature: 0.7, // Выше для разнообразия
          maxOutputTokens: 512, // Короткие тексты
          enableReasoning: false, // Не нужно
        },
      },

      pricingUSDPerMTok: {
        'gpt-4o-mini': { in: 0.15, out: 0.6 },
        'gpt-4o': { in: 5.0, out: 15.0 },
        // Когда появится GPT-5:
        // 'gpt-5': { in: 10.0, out: 30.0 },
      },
      defaultMaxOutputTokens: 512,
    },
    limits: {
      maxRequestUSD: Number(
        process.env.NUXT_BUDGET_REQ_USD || process.env.BUDGET_REQ_USD || 0.02
      ),
      dailyUSD: Number(
        process.env.NUXT_DAILY_USD || process.env.BUDGET_DAILY_USD || 0.5
      ),
    },
  },
};
```

**Важно:** Responses API формат одинаковый для всех моделей. Различия только в возможностях моделей, не в параметрах API.

#### 5. Сервис генерации AI-текстов

**Создать: `server/application/notifications/ai-generation.service.ts`**

````typescript
import { chatViaProvider } from '@@/server/application/llm.service';
import { config } from '@@/server/config';
import { db } from '@@/server/infrastructure/db';
import { aiGeneratedNotificationTexts } from '@@/server/infrastructure/db/schema';
import { computeGenerationConfigHash } from '@@/server/utils/notification-ai-config-hash';
import { eq, and } from 'drizzle-orm';

interface GenerateNotificationTextsParams {
  userId: number;
  preferenceId: string;
  kind: 'habits' | 'therapy';
  entityKey: string;
  entityName: string;
  entityDescription?: string | null;
  tone: 'neutral' | 'supportive' | 'motivational';
  addressing: 'formal' | 'informal';
  directness: 'soft' | 'moderate' | 'hard';
  subtype?: 'reminder' | 'informational' | 'motivational' | 'mixed' | null;
  textSource: 'ai' | 'hybrid';
  count?: number; // количество текстов для генерации (по умолчанию 15-20)
  provider?: 'openai' | 'deepseek' | 'groq';
}

export async function generateNotificationTexts(
  params: GenerateNotificationTextsParams
): Promise<{
  texts: string[];
  provider: string;
  model: string;
  tokensUsed: number;
  costUsd: number;
}> {
  // 1. Вычисляем хеш конфигурации
  const configHash = computeGenerationConfigHash({
    entityName: params.entityName,
    entityDescription: params.entityDescription,
    tone: params.tone,
    addressing: params.addressing,
    directness: params.directness,
    subtype: params.subtype,
    textSource: params.textSource,
    kind: params.kind,
  });

  // 2. Проверяем, есть ли уже сгенерированные тексты
  const existing = await db
    .select()
    .from(aiGeneratedNotificationTexts)
    .where(
      and(
        eq(aiGeneratedNotificationTexts.userId, params.userId),
        eq(aiGeneratedNotificationTexts.preferenceId, params.preferenceId),
        eq(aiGeneratedNotificationTexts.generationConfigHash, configHash)
      )
    )
    .limit(1);

  if (existing.length > 0 && existing[0].texts) {
    // Используем существующие тексты
    return {
      texts: existing[0].texts as string[],
      provider: existing[0].provider,
      model: existing[0].model || '',
      tokensUsed: existing[0].tokensUsed || 0,
      costUsd: Number(existing[0].costUsd || 0),
    };
  }

  // 3. Строим промпт
  const systemPrompt = buildNotificationSystemPrompt({
    entityName: params.entityName,
    description: params.entityDescription,
    tone: params.tone,
    addressing: params.addressing,
    directness: params.directness,
    subtype: params.subtype,
    kind: params.kind,
  });

  const count = params.count || 15;

  // 4. Вызываем LLM через существующую систему
  const provider = params.provider || config.llm.defaultProvider;
  const model = config.llm.openai.models.notifications;
  const scenarioSettings = config.llm.openai.settings.notifications;

  const result = await chatViaProvider({
    provider,
    model,
    messages: [
      {
        role: 'system',
        content: systemPrompt,
      },
      {
        role: 'user',
        content: `Сгенерируй ${count} вариантов текстов уведомлений в формате JSON массива строк. Каждый текст должен быть не более 178 символов.`,
      },
    ],
    options: {
      scenario: 'notifications', // Использует настройки из конфига
      temperature: scenarioSettings.temperature,
      maxOutputTokens: scenarioSettings.maxOutputTokens,
    },
  });

  // 5. Парсим и валидируем тексты
  const texts = parseAndValidateTexts(result.content, count);

  // 6. Сохраняем в БД
  // TODO: Вычислить tokensUsed и costUsd из ответа API
  await db.insert(aiGeneratedNotificationTexts).values({
    userId: params.userId,
    preferenceId: params.preferenceId,
    kind: params.kind,
    entityKey: params.entityKey,
    textSource: params.textSource,
    texts,
    generationConfigHash: configHash,
    provider,
    model: result.model || model,
    tokensUsed: 0, // TODO: получить из ответа
    costUsd: 0, // TODO: вычислить
  });

  return {
    texts,
    provider,
    model: result.model || model,
    tokensUsed: 0, // TODO
    costUsd: 0, // TODO
  };
}

function buildNotificationSystemPrompt(params: {
  entityName: string;
  description?: string | null;
  tone: string;
  addressing: string;
  directness: string;
  subtype?: string | null;
  kind: 'habits' | 'therapy';
}): string {
  return `Ты помощник для генерации текстов уведомлений для мобильного приложения MentAI.

Контекст:
- Тип: ${params.kind === 'habits' ? 'привычка' : 'тема поддержки'}
- Название: ${params.entityName}
- Описание: ${params.description || 'не указано'}

Стиль:
- Тон: ${params.tone === 'neutral' ? 'нейтральный' : params.tone === 'supportive' ? 'поддерживающий' : 'мотивационный'}
- Обращение: ${params.addressing === 'formal' ? 'на Вы' : 'на ты'}
- Прямота: ${params.directness === 'soft' ? 'Поддерживающий' : params.directness === 'moderate' ? 'Сдержанный' : 'Требовательный'}
${params.subtype ? `- Фокус уведомления: ${params.subtype}` : ''}

Требования:
- Каждый текст должен быть не более 178 символов
- Можно использовать плейсхолдер {name} для имени пользователя
- Тексты должны быть разнообразными, но в едином стиле
- Для привычек: фокус на действии
- Для терапии: фокус на поддержке и рефлексии

Сгенерируй тексты в формате JSON массива строк.`;
}

function parseAndValidateTexts(
  content: string,
  expectedCount: number
): string[] {
  // Парсим JSON массив
  let texts: string[] = [];
  try {
    // Убираем markdown code fences если есть
    const cleaned = content
      .replace(/```json\n?/g, '')
      .replace(/```\n?/g, '')
      .trim();
    texts = JSON.parse(cleaned);
  } catch {
    // Fallback: пытаемся извлечь тексты через regex
    const matches = content.match(/"([^"]{1,178})"/g);
    if (matches) {
      texts = matches.map((m) => m.slice(1, -1));
    }
  }

  // Валидация
  return texts
    .filter((text): text is string => typeof text === 'string')
    .map((text) => text.trim())
    .filter((text) => text.length > 0 && text.length <= 178)
    .slice(0, expectedCount);
}
````

#### 6. Интеграция с планировщиком

**Изменения в `scheduler.service.ts`:**

```typescript
// При выборе текста для слота
const prefMeta = sourcePref.meta as NotificationPreferenceMeta | null;
const textSource = pref.textSource || 'templates';
const textSource = prefMeta?.textSource;

let text: string | null = null;
let templateIdForSlot = 'custom_user_text';

// Для кастомных
if (isCustomEntity) {
  if (textSource === 'templates' || textSource === 'hybrid') {
    // Используем кастомные тексты (существующая логика)
    text = pickCustomTextFromMeta(prefMeta, userName, customTextIndex);
  }

  if ((textSource === 'ai' || textSource === 'hybrid') && (!text || (textSource === 'hybrid' && Math.random() > 0.5))) {
    // Загружаем AI-тексты из БД
    const aiTexts = await loadAiGeneratedTexts(
      userId,
      sourcePref.id,
      computeGenerationConfigHash({...})
    );
    if (aiTexts && aiTexts.length > 0) {
      text = aiTexts[Math.floor(Math.random() * aiTexts.length)];
      templateIdForSlot = 'ai_generated';
    } else {
      // Fallback на кастомные тексты или пропуск
      if (!text && textSource === 'ai') {
        console.warn('No AI texts found, skipping slot');
        continue;
      }
    }
  }
}
// Для готовых шаблонов
else {
  if (textSource === 'templates' || textSource === 'hybrid') {
    // Используем готовые шаблоны (существующая логика)
    template = findTemplate(...);
    if (template) {
      text = getTemplateText(template, addressing, sourcePref.directness, userName);
      templateIdForSlot = template.id;
    }
  }

  if ((textSource === 'ai' || textSource === 'hybrid') && (!text || (textSource === 'hybrid' && Math.random() > 0.5))) {
    // Загружаем AI-тексты из БД
    const aiTexts = await loadAiGeneratedTexts(
      userId,
      sourcePref.id,
      computeGenerationConfigHash({...})
    );
    if (aiTexts && aiTexts.length > 0) {
      text = aiTexts[Math.floor(Math.random() * aiTexts.length)];
      templateIdForSlot = 'ai_generated';
    } else {
      // Fallback на шаблоны
      if (!text && textSource === 'ai') {
        console.warn('No AI texts found, using templates fallback');
        template = findTemplate(...);
        text = getTemplateText(template, addressing, sourcePref.directness, userName);
        templateIdForSlot = template.id;
      }
    }
  }
}

// Создание слота остается таким же
const isAiGenerated = templateIdForSlot === 'ai_generated';
await db.insert(notificationSlots).values({
  id: slotId,
  payload: {
    body: text,
    templateId: templateIdForSlot,
    data: { isAiGenerated, ... }
  },
  templateId: templateIdForSlot,
  ...
});
```

#### 7. API endpoints

**Новый endpoint для ручной регенерации:**

```typescript
// server/api/notifications/ai/regenerate.post.ts
export default defineEventHandler(async (event) => {
  const user = await getSessionUser(event);
  if (!user?.id) {
    throw createError({ statusCode: 401, message: 'Unauthorized' });
  }

  const body = await readBody<{
    preferenceId: string;
    force?: boolean; // принудительная регенерация даже если тексты есть
  }>(event);

  // Загружаем настройки
  const pref = await loadPreference(body.preferenceId);
  // Генерируем тексты
  await generateNotificationTexts({...});

  return { success: true };
});
```

**Endpoint для получения статуса:**

```typescript
// server/api/notifications/ai/status/[preferenceId].get.ts
export default defineEventHandler(async (event) => {
  const preferenceId = getRouterParam(event, 'preferenceId');
  // Проверяем наличие текстов в БД
  return {
    hasGeneratedTexts: boolean,
    textsCount: number,
    lastGeneratedAt: string | null,
    configHash: string,
  };
});
```

#### 8. Обработка ошибок и fallback

1. **Ошибки API провайдера:**

   - Retry с экспоненциальной задержкой (до 3 попыток)
   - Fallback на другой провайдер (если настроено)
   - Если все провайдеры недоступны → использовать шаблоны/кастомные тексты

2. **Ошибки парсинга:**

   - Если AI вернул невалидный JSON → попытка извлечь тексты через regex
   - Если ничего не удалось → fallback на шаблоны

3. **Превышение лимитов токенов:**
   - Логировать предупреждение
   - Использовать существующие тексты или fallback

### Файлы для изменения

- `server/infrastructure/db/schema.ts` - добавить таблицу `aiGeneratedNotificationTexts`
- `server/infrastructure/db/migrations/XXXX_add_ai_generated_texts.sql` - миграция
- `server/utils/notification-ai-config-hash.ts` - утилита для хеширования (новый файл)
- `server/application/notifications/ai-generation.service.ts` - сервис генерации (новый файл)
- `server/config/index.ts` - добавить настройки моделей и сценариев
- `server/application/llm.service.ts` - добавить параметр `scenario` и `maxOutputTokens` в `chatViaProvider()` и `chatStreamViaProvider()`
- `server/infrastructure/llm/openai.ts` - обновить для поддержки `maxOutputTokens` из options (использовать вместо `defaultMaxOutputTokens` если передан)
- `server/api/notifications/prefs/[kind].put.ts` - проверка хеша и запуск регенерации
- `server/application/notifications/scheduler.service.ts` - загрузка AI-текстов из БД
- `server/api/notifications/ai/regenerate.post.ts` - endpoint для ручной регенерации (новый файл)
- `server/api/notifications/ai/status/[preferenceId].get.ts` - endpoint статуса (новый файл)

---

## 📦 Зависимости

### Новые пакеты

```json
{
  "dependencies": {
    "speakingurl": "^15.0.0"
  }
}
```

**Установка:**

```bash
pnpm add speakingurl
```

---

## 🗄️ Миграции БД

### Миграция 1: Добавление slug

**Файл:** `server/infrastructure/db/migrations/0016_add_slug_to_habits_and_therapy.sql`

```sql
-- Добавляем slug в habits
ALTER TABLE habits
ADD COLUMN slug VARCHAR(255);

-- Добавляем slug в therapy_topics_custom
ALTER TABLE therapy_topics_custom
ADD COLUMN slug VARCHAR(255);

-- Создаем индексы для быстрого поиска
CREATE INDEX idx_habits_user_slug ON habits(user_id, slug);
CREATE INDEX idx_therapy_custom_user_slug ON therapy_topics_custom(user_id, slug);

-- Генерируем slug для существующих записей (опционально, можно сделать скриптом)
-- UPDATE habits SET slug = LOWER(REGEXP_REPLACE(name, '[^a-zA-Z0-9]+', '-', 'g')) WHERE slug IS NULL;
-- UPDATE therapy_topics_custom SET slug = LOWER(REGEXP_REPLACE(name, '[^a-zA-Z0-9]+', '-', 'g')) WHERE slug IS NULL;
```

### Миграция 2: Добавление таблицы для AI-текстов

**Файл:** `server/infrastructure/db/migrations/XXXX_add_ai_generated_notification_texts.sql`

```sql
-- Создаем таблицу для хранения AI-сгенерированных текстов уведомлений
CREATE TABLE ai_generated_notification_texts (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL,
  kind VARCHAR(20) NOT NULL, -- 'habits' | 'therapy'
  entity_key VARCHAR(255) NOT NULL, -- идентификатор сущности
  preference_id TEXT NOT NULL, -- FK к notification_preferences.id
  generation_mode VARCHAR(20) NOT NULL, -- 'ai' | 'hybrid'
  texts JSONB NOT NULL, -- массив сгенерированных текстов (до 100)
  generation_config_hash TEXT NOT NULL, -- хеш настроек, влияющих на генерацию
  provider VARCHAR(50) NOT NULL, -- 'openai' | 'deepseek' | 'groq' | ...
  model VARCHAR(100), -- модель, использованная для генерации
  tokens_used INTEGER, -- количество токенов
  cost_usd DECIMAL(10, 6), -- стоимость генерации
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
  expires_at TIMESTAMP WITH TIME ZONE, -- опционально: срок действия кеша

  UNIQUE(user_id, preference_id, generation_config_hash)
);

-- Индексы для быстрого поиска
CREATE INDEX idx_ai_texts_user_pref ON ai_generated_notification_texts(user_id, preference_id);
CREATE INDEX idx_ai_texts_config_hash ON ai_generated_notification_texts(generation_config_hash);
CREATE INDEX idx_ai_texts_entity ON ai_generated_notification_texts(user_id, kind, entity_key);
```

---

## ✅ Чеклист реализации

### Этап 1: Исправление "undefined"

- [ ] Установить `subtype = null` для кастомных привычек при создании
- [ ] Исправить `devPrefix` в `scheduler.service.ts`
- [ ] Скрыть выбор subtype для кастомных привычек в UI
- [ ] Протестировать уведомления

### Этап 2: Slug для URL

- [ ] Установить `speakingurl`
- [ ] Создать утилиту `server/utils/slug.ts`
- [ ] Создать миграцию для добавления `slug`
- [ ] Обновить API создания привычек/терапии
- [ ] Обновить API обновления привычек/терапии
- [ ] Обновить API получения (поиск по slug/id)
- [ ] Обновить роутинг на фронтенде
- [ ] Протестировать навигацию

### Этап 3: Режимы генерации

**Для кастомных привычек/терапии:**

- [x] Обновить `NotificationPreferencesDto` в DTO (добавить `textSource`)
- [ ] Добавить UI выбора режима (ToggleGroup) в `NotificationSettingsPage.vue` для кастомных
- [ ] Добавить условное отображение секций для кастомных

**Для готовых шаблонов (привычек и терапии):**

- [ ] Обновить `NotificationPreferenceMeta` в DTO (добавить `textSource`)
- [ ] Добавить `TEXT_SOURCE_OPTIONS` в `app/constants/select-options.ts`
- [ ] Добавить UI выбора режима (ToggleGroup) в `NotificationSettingsPage.vue` для всех шаблонных сущностей
- [ ] Унифицировать UI: использовать ToggleGroup с одинаковым заголовком "Способ создания" для всех типов сущностей
- [ ] Добавить условное отображение информационного блока про AI

**Общее:**

- [x] Обновить сохранение настроек (`textSource`)
- [ ] Обновить логику в `scheduler.service.ts` для обработки всех режимов
- [ ] Протестировать все режимы для кастомных и готовых шаблонов

### Этап 4: Метка AI

- [ ] Добавить метку в `NotificationPreview.vue`
- [ ] Добавить метку в `scheduler.service.ts`
- [ ] Протестировать отображение метки

### Этап 5: Интеграция AI-генерации

**Подготовка БД и схемы:**

- [ ] Создать миграцию для таблицы `ai_generated_notification_texts`
- [ ] Добавить схему в `server/infrastructure/db/schema.ts`
- [ ] Создать DTO для AI-текстов в `shared/dto/notifications.ts`

**Утилиты и хеширование:**

- [ ] Создать `server/utils/notification-ai-config-hash.ts`
- [ ] Реализовать функцию `computeGenerationConfigHash()`
- [ ] Добавить тесты для хеширования

**Конфигурация:**

- [ ] Обновить `server/config/index.ts` с настройками моделей для разных сценариев
- [ ] Добавить `models.chat` и `models.notifications`
- [ ] Добавить `settings.chat` и `settings.notifications`

**Сервис генерации:**

- [ ] Создать `server/application/notifications/ai-generation.service.ts`
- [ ] Реализовать функцию `generateNotificationTexts()`
- [ ] Создать промпты для разных типов сущностей
- [ ] Интегрировать с существующей системой провайдеров LLM
- [ ] Добавить валидацию и парсинг ответов
- [ ] Реализовать сохранение в БД

**Интеграция с сохранением настроек:**

- [ ] Модифицировать `/api/notifications/prefs/habits.put.ts`
- [ ] Модифицировать `/api/notifications/prefs/therapy.put.ts`
- [ ] Добавить проверку `generationConfigHash`
- [ ] Реализовать асинхронную регенерацию при изменении настроек
- [ ] Сохранение сгенерированных текстов в БД

**Интеграция с планировщиком:**

- [ ] Модифицировать `scheduler.service.ts`
- [ ] Добавить загрузку AI-текстов из БД
- [ ] Реализовать логику выбора текста (ai/hybrid)
- [ ] Добавить fallback на шаблоны/кастомные тексты
- [ ] Обновить `isAiGenerated` флаг в payload

**API endpoints:**

- [ ] Создать `POST /api/notifications/ai/regenerate`
- [ ] Создать `GET /api/notifications/ai/status/:preferenceId`
- [ ] Добавить валидацию и обработку ошибок

**Обработка ошибок:**

- [ ] Реализовать retry логику
- [ ] Добавить fallback на другие провайдеры
- [ ] Реализовать graceful degradation

**Тестирование:**

- [ ] Unit-тесты для хеширования конфигурации
- [ ] Unit-тесты для генерации текстов
- [ ] Интеграционные тесты для планировщика
- [ ] E2E тесты для полного цикла генерации

---

## 🧪 Тестирование

### Тест-кейсы

1. **Создание кастомной привычки:**

   - Создать привычку "Гимнастика"
   - Проверить, что slug = "gimnastika"
   - Проверить, что URL = `/habits/gimnastika`
   - Проверить, что `subtype = null`

2. **Уведомления с null subtype:**

   - Создать уведомление для кастомной привычки
   - Проверить, что в dev-режиме нет "undefined"
   - Проверить, что отображается "CUSTOM" или корректное значение

3. **Режимы генерации для кастомных:**

   - Выбрать режим "Ручной" → проверить, что секция текстов видна
   - Выбрать режим "ИИ" → проверить, что секция текстов скрыта, показывается блок про AI
   - Выбрать режим "Гибридный" → проверить, что секция текстов видна и блок про AI тоже

4. **Режимы генерации для готовых шаблонов:**

   - Выбрать "Шаблоны" → проверить, что используются готовые тексты
   - Выбрать "ИИ" → проверить, что тексты генерируются AI с учетом всех параметров
   - Выбрать "Гибридный" → проверить, что часть уведомлений из шаблонов, часть от AI

5. **Конфликт имен:**

   - Проверить, что `subtype: 'mixed'` (фокус уведомления) не конфликтует с `textSource: 'hybrid'`
   - Проверить, что в коде нет путаницы между этими понятиями

6. **Метка AI:**

   - Сгенерировать уведомление с AI
   - Проверить, что в начале текста есть метка "✨ AI"

7. **AI-Способ создания:**

   - Выбрать режим "ИИ" для кастомной привычки
   - Сохранить настройки → проверить, что тексты генерируются и сохраняются в БД
   - Изменить название привычки → проверить, что тексты регенерируются
   - Изменить только время уведомлений → проверить, что тексты НЕ регенерируются
   - Проверить, что слоты создаются с `templateId: 'ai_generated'`
   - Проверить fallback на кастомные тексты/шаблоны при отсутствии AI-текстов

8. **Гибридный режим:**

   - Выбрать режим "Гибридный" для готовых шаблонов
   - Проверить, что часть уведомлений из шаблонов, часть от AI
   - Проверить, что соотношение примерно 50/50

9. **Хеширование конфигурации:**

   - Изменить tone → проверить, что хеш изменился и тексты регенерируются
   - Изменить directness → проверить, что хеш изменился и тексты регенерируются
   - Изменить только activeDays → проверить, что хеш НЕ изменился и тексты НЕ регенерируются

10. **Разные модели:**
    - Проверить, что для чата используется `gpt-4o` (из конфига)
    - Проверить, что для уведомлений используется `gpt-4o-mini` (из конфига)
    - Проверить, что настройки (temperature, maxOutputTokens) применяются корректно

---

## 📝 Примечания

1. **Обратная совместимость:** При переходе на slug необходимо сохранить возможность поиска по старому ID для существующих ссылок.

2. **Транслитерация:** Библиотека `speakingurl` поддерживает множество языков, но может потребоваться настройка для специфических случаев.

3. **AI-генерация:** Детальная реализация AI-генерации описана в разделе "Проблема 5: Интеграция AI-генерации текстов уведомлений".

4. **Производительность:** При генерации slug для большого количества существующих записей может потребоваться батч-обработка.

5. **Конфликт имен:** Важно различать:

   - `subtype: 'mixed'` - фокус уведомления (чередование reminder/informational/motivational)
   - `textSource: 'hybrid'` - режим генерации (комбинация пользовательских/шаблонных текстов и AI)
   - `textSource: 'hybrid'` - режим генерации для готовых шаблонов (комбинация шаблонов и AI)

   Использование `'hybrid'` вместо `'mixed'` для режимов генерации исключает путаницу в коде.

6. **Совместимость с текущей логикой:**

   - Все существующие режимы (templates/ai/hybrid) продолжают работать без изменений
   - AI-генерация является расширением, а не заменой существующей логики
   - Слоты создаются в `notification_slots` как обычно, просто источник текста расширяется
   - Нет конфликтов между кастомными текстами, шаблонами и AI-текстами

7. **Гибкость системы:**

   - Легко переключиться между провайдерами (OpenAI/DeepSeek/Groq) через конфигурацию
   - Можно использовать разные модели для разных сценариев (gpt-4o для чата, gpt-4o-mini для уведомлений)
   - Responses API формат одинаковый для всех моделей - различия только в возможностях моделей
   - При появлении новых моделей (например, GPT-5) достаточно добавить их в конфиг и pricing
   - Настройки для разных сценариев (chat/notifications) настраиваются через `config.llm.openai.settings`

8. **Экономия токенов:**
   - Сгенерированные тексты сохраняются в БД и переиспользуются
   - Регенерация происходит только при изменении релевантных настроек (хеш конфигурации)
   - Изменение времени/дней недели не вызывает регенерацию
   - Использование более дешевой модели (gpt-4o-mini) для уведомлений снижает стоимость

---

## 🔗 Связанные документы

- `.docs/mentai_tz_product.md` - Общие требования к продукту
- `.docs/mentai_tz_frontend.md` - Требования к фронтенду
- `.docs/mentai_tz_backend.md` - Требования к бэкенду
- `.docs/architecture.md` - Архитектура системы

---

**Автор:** AI Assistant  
**Последнее обновление:** 2025-01-XX
