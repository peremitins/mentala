# Техническое задание: Унификация логики работы с текстами уведомлений

## 1. Цель и контекст

### 1.1. Проблема

В текущей реализации существует разделение логики работы с текстами уведомлений:

- **Для готовых шаблонов** (каталог привычек/терапий): тексты берутся из статических шаблонов, редактирование недоступно
- **Для кастомных сущностей**: тексты можно редактировать через блок "Тексты уведомлений"

Это создает:

- Несогласованность UX
- Ограниченную гибкость для пользователей готовых шаблонов
- Дублирование логики

### 1.2. Цель

Унифицировать работу с текстами уведомлений для всех типов сущностей, сохранив при этом:

- **Эффект неожиданности**: готовые шаблоны остаются скрытыми
- **Простота использования**: понятная логика без перегрузки интерфейса
- **Гибкость**: возможность дополнять готовые шаблоны своими текстами или использовать только свои

## 2. Текущее состояние

### 2.1. Структура данных

#### Frontend (`NotificationSettingsPage.vue`):

```typescript
// Текущие переменные состояния
const customTexts = ref<string[]>(['']); // Только для кастомных сущностей
const textSource = ref<'templates' | 'ai' | 'hybrid'>('templates');
const isCustomEntity = computed(() => ...); // Определяет, кастомная ли сущность

// Условия показа
const showCustomTextsSection = computed(() => {
  if (!isCustomEntity.value) return false; // НЕ показывается для готовых
  return textSource.value === 'templates' || textSource.value === 'hybrid';
});
```

#### Backend (API):

```typescript
// Структура meta в NotificationPreferencesDto
meta: {
  customTexts?: string[]; // Только для кастомных сущностей
  textSource: 'templates' | 'ai' | 'hybrid';
}
```

### 2.2. Текущая логика получения текстов

**Для готовых шаблонов:**

- Тексты берутся из `notificationTemplates.ts` через `findTemplate()` и `getTemplateText()`
- Фильтрация по: `kind`, `entityKey`, `subtype`, `addressing`, `directness`
- Пользователь не видит тексты, только получает их в уведомлениях

**Для кастомных сущностей:**

- Тексты хранятся в `pref.meta.customTexts`
- Пользователь может добавлять/редактировать/удалять через UI
- Обязательны для режимов `templates` и `hybrid`

## 3. Требуемые изменения

### 3.1. Новая логика работы

#### Концепция:

1. **Блок "Тексты уведомлений"** показывается **всегда** для всех типов сущностей
2. Добавляется **чекбокс "Использовать только свои тексты"**
3. Готовые шаблоны остаются скрытыми (не показываются пользователю)

#### Поведение:

**Режим 1: Готовые шаблоны + свои (по умолчанию)**

- Чекбокс выключен
- Используются: готовые шаблоны (из `notificationTemplates.ts`) + кастомные тексты пользователя
- Кастомные тексты не обязательны

**Режим 2: Только свои тексты**

- Чекбокс включен
- Используются: только кастомные тексты пользователя
- Кастомные тексты обязательны (минимум 1)

### 3.2. Изменения в структуре данных

#### Frontend:

```typescript
// Новые/измененные переменные
const customTexts = ref<string[]>([]); // Теперь для всех типов
const useOnlyCustomTexts = ref(false); // НОВОЕ: чекбокс
const textSource = ref<'templates' | 'ai' | 'hybrid'>('templates'); // Без изменений

// Удалить/изменить:
// - showCustomTextsSection (больше не нужна, показывается всегда)
```

#### Backend (API):

```typescript
// Измененная структура meta
meta: {
  customTexts?: string[]; // Теперь для всех типов сущностей
  useOnlyCustomTexts?: boolean; // НОВОЕ: флаг использования только своих
  textSource: 'templates' | 'ai' | 'hybrid';
}
```

## 4. Детали реализации

### 4.1. Изменения в `NotificationSettingsPage.vue`

#### 4.1.1. Новые computed свойства

```typescript
// Определяет, используются ли только кастомные тексты
const useOnlyCustomTexts = ref(false);

// Определяет, какие тексты должны использоваться
const effectiveNotificationTexts = computed(() => {
  if (useOnlyCustomTexts.value) {
    return normalizedCustomTexts.value;
  }

  // Для режимов templates и hybrid: готовые + кастомные
  if (textSource.value === 'templates' || textSource.value === 'hybrid') {
    // Готовые шаблоны получаются динамически через getTemplateTexts()
    const templateTexts = getAvailableTemplateTexts();
    return [...templateTexts, ...normalizedCustomTexts.value];
  }

  // Для режима AI: только кастомные (если есть)
  return normalizedCustomTexts.value;
});

// Валидация: если useOnlyCustomTexts = true, нужен минимум 1 текст
const canSaveSettings = computed(() => {
  if (useOnlyCustomTexts.value && textSource.value !== 'ai') {
    return hasCustomTexts.value && !hasCustomTextError.value;
  }
  // Для режима AI тексты не обязательны
  if (textSource.value === 'ai') {
    return true;
  }
  // Для готовых шаблонов + свои: кастомные не обязательны
  return !hasCustomTextError.value;
});

// Индикатор количества используемых текстов
const textsCountInfo = computed(() => {
  if (useOnlyCustomTexts.value) {
    const count = normalizedCustomTexts.value.length;
    return count > 0
      ? `Используется: только ${count} ваших текстов`
      : 'Добавьте хотя бы один текст';
  }

  const customCount = normalizedCustomTexts.value.length;
  const templatesCount = getAvailableTemplateTexts().length;

  if (customCount > 0) {
    return `Используется: ${templatesCount} готовых + ${customCount} ваших текстов`;
  }
  return `Используется: ${templatesCount} готовых текстов`;
});
```

#### 4.1.2. Новая функция для получения готовых шаблонов

```typescript
// Получает все доступные тексты из шаблонов для текущих настроек
function getAvailableTemplateTexts(): string[] {
  if (textSource.value === 'ai') {
    return [];
  }

  // Получаем все подходящие шаблоны
  // Примечание: может потребоваться создать функцию findAllTemplates,
  // которая возвращает все подходящие шаблоны (не только первый)
  // Временно используем существующую логику findTemplate в цикле
  // или создаем новую функцию findAllTemplates в notificationTemplates.ts
  const templates = findAllTemplatesForSettings({
    kind: isHabits.value ? 'habits' : 'therapy',
    entityKey: props.entityKey,
    subtype: subtype.value,
    addressing: addressing.value,
    directness: directness.value,
  });

  // Извлекаем тексты из шаблонов
  const texts: string[] = [];
  templates.forEach((template) => {
    const text = getTemplateText(template, addressing.value, directness.value);
    if (text) {
      texts.push(text);
    }
  });

  return texts;
}

// Новая функция для поиска всех подходящих шаблонов (не только первого)
// Рекомендуется добавить в notificationTemplates.ts как экспортируемую функцию
function findAllTemplatesForSettings(options: {
  kind: NotificationKind;
  entityKey?: string;
  subtype?: HabitSubtype;
  addressing: Addressing;
  directness: Directness;
}): NotificationTemplate[] {
  // ВАРИАНТ 1 (Рекомендуется): Создать функцию в notificationTemplates.ts
  // export function findAllTemplates(kind, options) которая использует
  // ту же логику фильтрации, что и findTemplate, но возвращает массив

  // ВАРИАНТ 2 (Временный): Использовать существующую findTemplate в цикле
  // Это менее эффективно, но работает без изменений в notificationTemplates.ts
  const matchedTemplates: NotificationTemplate[] = [];
  const excludeIds: string[] = [];
  const maxIterations = 100; // Защита от бесконечного цикла

  // Получаем intent из entityKey (для habits)
  let intent: HabitIntent | undefined;
  if (options.kind === 'habits' && options.entityKey) {
    // Определяем intent по entityKey (build/quit/custom)
    // Можно использовать существующую логику из компонента
    intent = getIntentFromEntityKey(options.entityKey);
  }

  for (let i = 0; i < maxIterations; i++) {
    const template = findTemplate(options.kind, {
      entityKey: options.entityKey,
      subtype: options.subtype,
      intent: intent,
      useFirst: true, // Детерминированный выбор
      templateIndex: i, // Для получения разных шаблонов по индексу
      excludeTemplateIds: excludeIds,
    });

    if (!template) break; // Больше нет подходящих шаблонов

    matchedTemplates.push(template);
    excludeIds.push(template.id);
  }

  return matchedTemplates;
}

// Вспомогательная функция для определения intent из entityKey
function getIntentFromEntityKey(entityKey: string): HabitIntent | undefined {
  // Маппинг entityKey -> intent
  // Можно использовать существующую логику из компонента или каталога
  const buildHabits = [
    'water',
    'steps',
    'sleep',
    'training',
    'focus',
    'nutrition',
    'meditation',
    'gratitude',
    'morning_routine',
    'planning',
  ];
  const quitHabits = [
    'smoking',
    'alcohol',
    'sugar',
    'screentime',
    'caffeine',
    'procrastination',
  ];

  if (buildHabits.includes(entityKey)) return 'build';
  if (quitHabits.includes(entityKey)) return 'quit';
  return 'custom';
}
```

**Примечание для реализации**:

- Для оптимизации рекомендуется создать функцию `findAllTemplates()` в `notificationTemplates.ts`, которая будет напрямую фильтровать массив `notificationTemplates`, используя ту же логику, что и `findTemplate()`, но без случайного выбора.
- Это будет эффективнее, чем цикличный вызов `findTemplate()`.

#### 4.1.3. Изменения в функции загрузки настроек

```typescript
// В onMounted / watch при загрузке pref.meta
if (pref.meta) {
  // Теперь customTexts загружаются для всех типов
  const storedTexts = pref.meta?.customTexts ?? null;
  customTexts.value = storedTexts && storedTexts.length ? [...storedTexts] : [];

  // НОВОЕ: загружаем флаг useOnlyCustomTexts
  useOnlyCustomTexts.value = pref.meta?.useOnlyCustomTexts ?? false;

  textSource.value = pref.meta?.textSource ?? 'templates';
} else {
  // Значения по умолчанию
  customTexts.value = [];
  useOnlyCustomTexts.value = false;
  textSource.value = 'templates';
}
```

#### 4.1.4. Изменения в функции сохранения

```typescript
// В saveSettings() при формировании body
const body = {
  // ... другие поля
  meta: {
    // Теперь customTexts отправляются для всех типов (не только кастомных)
    customTexts: textSource.value === 'ai' ? [] : normalizedCustomTexts.value,

    // НОВОЕ: отправляем флаг
    useOnlyCustomTexts: useOnlyCustomTexts.value,

    textSource: textSource.value,
  },
  // ... остальные поля
};
```

#### 4.1.5. Изменения в computeStateSignature

```typescript
function computeStateSignature() {
  // ... существующий код
  return JSON.stringify({
    // ... существующие поля
    customTexts: normalizedCustomTexts.value,
    useOnlyCustomTexts: useOnlyCustomTexts.value, // НОВОЕ
    textSource: textSource.value,
    // ... остальные поля
  });
}
```

### 4.2. Изменения в UI (`NotificationSettingsPage.vue`)

#### 4.2.1. Блок "Тексты уведомлений" - теперь всегда видимый

```vue
<!-- УДАЛИТЬ условие v-if="isCustomEntity && showCustomTextsSection" -->
<!-- ИЗМЕНИТЬ на: -->
<div
  v-if="textSource === 'templates' || textSource === 'hybrid'"
  class="space-y-3 rounded-2xl border border-dashed border-primary bg-button-active-soft p-4 transition-all"
>
  <!-- Заголовок и описание -->
  <div class="flex items-center justify-between gap-3 flex-wrap">
    <div class="flex-1">
      <div class="flex items-center gap-2 mb-1">
        <p class="text-sm font-semibold text-foreground">
          Тексты уведомлений
        </p>
        <span class="text-xs text-muted-foreground">
          {{ textsCountInfo }}
        </span>
      </div>
      <p class="text-xs text-muted-foreground">
        До {{ MAX_CUSTOM_NOTIFICATION_TEXTS }} вариантов, максимум
        {{ MAX_NOTIFICATION_TEXT_LENGTH }} символов. Можно использовать {'{name}'}
      </p>
    </div>
  </div>

  <!-- НОВЫЙ чекбокс -->
  <div class="flex items-center gap-2 pb-2 border-b border-border/50">
    <input
      id="useOnlyCustomTexts"
      v-model="useOnlyCustomTexts"
      type="checkbox"
      class="rounded border-border"
    />
    <label
      for="useOnlyCustomTexts"
      class="text-sm text-foreground cursor-pointer"
    >
      Использовать только свои тексты
    </label>
  </div>

  <!-- Кнопка добавления -->
  <button
    type="button"
    class="inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-semibold border border-blue-200 text-blue-600 hover:bg-blue-50 disabled:opacity-30"
    :disabled="!canAddCustomText"
    @click="addCustomText"
  >
    <span>+</span> Добавить текст
  </button>

  <!-- Список текстов (существующий код) -->
  <TransitionGroup name="fade" tag="div" class="space-y-3">
    <!-- ... существующий код списка текстов ... -->
  </TransitionGroup>

  <!-- Валидационные сообщения -->
  <p
    v-if="useOnlyCustomTexts && !hasCustomTexts"
    class="text-xs text-red-500 font-medium"
  >
    Добавьте хотя бы один текст
  </p>
</div>
```

#### 4.2.2. Обновление информационного блока для режима "Шаблоны"

```vue
<!-- Обновить текст в информационном блоке -->
<div
  v-if="textSource === 'templates'"
  class="rounded-xl border border-primary bg-button-active-soft p-4"
>
  <div class="flex items-baseline gap-3">
    <span>✍️</span>
    <div class="flex-1">
      <p class="text-sm font-semibold text-surface-raised-foreground">
        Использование шаблонов
      </p>
      <p class="text-xs text-surface-raised-subtitle mt-1">
        Тексты уведомлений будут браться из готовых шаблонов с учетом
        всех параметров настроек (фокус, стиль, обращение).
        Вы можете добавить свои тексты для дополнения готовых.
      </p>
    </div>
  </div>
</div>
```

### 4.3. Изменения в `NotificationPreview.vue`

```typescript
// Обновить логику получения текста для превью
function updatePreview(useFirstTemplate = false) {
  // Приоритет: кастомные тексты (если useOnlyCustomTexts = true)
  // Иначе: готовые шаблоны + кастомные
  if (props.customTexts?.length && props.useOnlyCustomTexts) {
    // Только кастомные
    previewText.value = formatNotificationTextWithName(
      props.customTexts[0],
      props.userName
    );
    return;
  }

  // Если есть кастомные и они должны быть включены
  if (props.customTexts?.length && !props.useOnlyCustomTexts) {
    // Можно показать первый кастомный или первый из готовых
    previewText.value = formatNotificationTextWithName(
      props.customTexts[0],
      props.userName
    );
    return;
  }

  // Иначе используем готовые шаблоны (существующая логика)
  const template = findTemplate(props.kind, {
    entityKey: props.entityKey,
    subtype: props.subtype,
    useFirst: useFirstTemplate || !isDevelopment.value,
  });

  // ... остальная логика
}
```

### 4.4. Backend изменения (если требуются)

#### 4.4.1. Обновление типов DTO

```typescript
// В shared/dto/notifications.ts
export const NotificationPreferencesDto = z.object({
  // ... существующие поля
  meta: z
    .object({
      customTexts: z.array(z.string()).optional(), // Теперь опционально для всех
      useOnlyCustomTexts: z.boolean().optional(), // НОВОЕ
      textSource: z.enum(['templates', 'ai', 'hybrid']),
    })
    .optional(),
});
```

#### 4.4.2. Логика получения текстов на бэкенде

```typescript
// При отправке уведомлений
function getNotificationTexts(
  prefs: NotificationPreferencesDto,
  settings: UserSettings
) {
  const meta = prefs.meta || {};
  const { customTexts = [], useOnlyCustomTexts = false, textSource } = meta;

  if (useOnlyCustomTexts && customTexts.length > 0) {
    // Только кастомные
    return customTexts;
  }

  if (textSource === 'templates' || textSource === 'hybrid') {
    // Готовые шаблоны + кастомные
    const templateTexts = getTemplateTextsForSettings({
      kind: prefs.kind,
      entityKey: prefs.entityKey,
      subtype: prefs.subtype,
      addressing: settings.addressing,
      directness: prefs.directness,
    });
    return [...templateTexts, ...customTexts];
  }

  // Для режима AI: только кастомные (если есть)
  return customTexts;
}
```

## 5. Миграция данных

### 5.1. Существующие данные

Для существующих настроек:

- Если `customTexts` есть в `meta` → сохранить как есть
- Если `useOnlyCustomTexts` отсутствует → установить `false` (по умолчанию)
- Для готовых шаблонов без `customTexts` → `customTexts = []`, `useOnlyCustomTexts = false`

### 5.2. Обратная совместимость

- Если в `meta` нет `useOnlyCustomTexts` → считать `false`
- Старая логика `isCustomEntity` больше не влияет на отображение блока текстов

## 6. UI/UX детали

### 6.1. Визуальная иерархия

1. **Блок "Способ создания"** (существующий, без изменений)
2. **Информационный блок** (существующий, обновленный текст)
3. **Блок "Тексты уведомлений"** (новый/измененный)
   - Заголовок + индикатор количества
   - Чекбокс "Использовать только свои тексты"
   - Кнопка "Добавить текст"
   - Список текстов

### 6.2. Состояния интерфейса

**Состояние 1: Готовые шаблоны, нет своих текстов**

```
Тексты уведомлений
Используется: 20 готовых текстов

[ ] Использовать только свои тексты
[+ Добавить текст]
```

**Состояние 2: Готовые шаблоны + свои тексты**

```
Тексты уведомлений
Используется: 20 готовых + 3 ваших текстов

[ ] Использовать только свои тексты
[+ Добавить текст]

[Список из 3 кастомных текстов]
```

**Состояние 3: Только свои тексты**

```
Тексты уведомлений
Используется: только 3 ваших текстов

[✓] Использовать только свои тексты
[+ Добавить текст]

[Список из 3 кастомных текстов]
```

**Состояние 4: Только свои тексты, но нет текстов**

```
Тексты уведомлений
Добавьте хотя бы один текст

[✓] Использовать только свои тексты
[+ Добавить текст]

[Красное сообщение: "Добавьте хотя бы один текст"]
```

### 6.3. Интерактивность

- Чекбокс реагирует на клик, обновляет `useOnlyCustomTexts`
- При включении чекбокса: если нет текстов → показывается валидационная ошибка
- При выключении чекбокса: тексты не удаляются, просто добавляются к готовым

## 7. Валидация

### 7.1. Правила валидации

1. **Если `useOnlyCustomTexts = true` и `textSource !== 'ai'`:**

   - Обязателен минимум 1 кастомный текст
   - Кнопка "Сохранить" неактивна, пока не добавлен хотя бы 1 текст

2. **Если `useOnlyCustomTexts = false` или `textSource = 'ai'`:**

   - Кастомные тексты не обязательны
   - Можно сохранить без кастомных текстов

3. **Общие правила:**
   - Максимум `MAX_CUSTOM_NOTIFICATION_TEXTS` текстов
   - Максимум `MAX_NOTIFICATION_TEXT_LENGTH` символов на текст
   - Пустые тексты (после trim) не учитываются

## 8. Тестирование

### 8.1. Сценарии тестирования

1. **Готовые шаблоны:**

   - [ ] Блок "Тексты уведомлений" виден
   - [ ] Чекбокс выключен по умолчанию
   - [ ] Можно добавить свои тексты
   - [ ] После добавления индикатор показывает "X готовых + Y ваших"
   - [ ] Можно включить чекбокс и использовать только свои

2. **Кастомные сущности:**

   - [ ] Блок "Тексты уведомлений" виден
   - [ ] Существующие тексты загружаются
   - [ ] Работает переключение чекбокса
   - [ ] Валидация работает корректно

3. **Режим AI:**

   - [ ] Блок "Тексты уведомлений" скрыт (т.к. `textSource === 'ai'`)
   - [ ] При переключении на templates/hybrid блок появляется

4. **Сохранение и загрузка:**

   - [ ] Настройки сохраняются корректно
   - [ ] При загрузке восстанавливаются `customTexts` и `useOnlyCustomTexts`
   - [ ] Миграция старых данных работает

5. **Отправка уведомлений:**
   - [ ] При `useOnlyCustomTexts = false`: используются готовые + кастомные
   - [ ] При `useOnlyCustomTexts = true`: используются только кастомные
   - [ ] Правильная фильтрация готовых шаблонов по настройкам

## 9. Чеклист реализации

### Frontend

- [ ] Добавить переменную `useOnlyCustomTexts`
- [ ] Обновить функцию `getAvailableTemplateTexts()`
- [ ] Обновить computed `canSaveSettings`
- [ ] Обновить computed `textsCountInfo`
- [ ] Удалить условие `v-if="isCustomEntity"` из блока текстов
- [ ] Добавить чекбокс в UI
- [ ] Обновить информационный блок для шаблонов
- [ ] Обновить логику загрузки настроек
- [ ] Обновить логику сохранения настроек
- [ ] Обновить `computeStateSignature`
- [ ] Обновить `NotificationPreview.vue` (если требуется)

### Backend (если требуется)

- [ ] Обновить типы DTO
- [ ] Обновить логику получения текстов при отправке уведомлений
- [ ] Добавить миграцию данных (если требуется)

### Тестирование

- [ ] Протестировать все сценарии из раздела 8.1
- [ ] Проверить обратную совместимость
- [ ] Проверить валидацию

## 10. Примечания

- **Важно**: Готовые шаблоны остаются скрытыми от пользователя. Он не видит тексты, только их количество.
- **Миграция**: Старые данные должны работать без изменений. Если `useOnlyCustomTexts` отсутствует → `false`.
- **Производительность**: Функция `getAvailableTemplateTexts()` вызывается только при необходимости (computed свойство кешируется).
