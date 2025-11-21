# Архитектура: Режимы генерации текстов уведомлений

## Концепция

Система уведомлений использует единое поле `textSource` для определения источника текстов уведомлений. Поле поддерживает три режима: `'templates'`, `'ai'`, `'hybrid'`.

### Семантика `textSource`:

**Для кастомных привычек/терапии:**

- `'templates'` → использовать `customTexts` (ручные тексты пользователя)
- `'ai'` → использовать только AI-тексты
- `'hybrid'` → чередовать `customTexts` и AI-тексты

**Для готовых шаблонов:**

- `'templates'` → использовать готовые шаблоны из каталога
- `'ai'` → использовать только AI-тексты
- `'hybrid'` → чередовать шаблоны и AI-тексты

## Структура базы данных

### Таблица `notification_preferences`

```sql
notification_preferences (
  id: bigint (PK)
  user_id: bigint (FK)
  kind: 'therapy' | 'habits'
  entity_key: varchar(255)
  text_source: 'templates' | 'ai' | 'hybrid'  -- Способ создания текстов
  meta: jsonb | null  -- { customTexts: [...] }
  -- другие поля
)
```

### Таблица `ai_generated_notification_texts`

```sql
ai_generated_notification_texts (
  id: varchar(255) (PK)
  user_id: bigint (FK)
  entity_key: varchar(255)
  text: text
  text_source: 'ai' | 'hybrid'  -- Только для AI-текстов
  config_hash: varchar(255)
  created_at: timestamp
)
```

## Типы и DTO

### `shared/dto/notifications.ts`

```typescript
export interface NotificationPreferenceMeta {
  customTexts?: string[]; // Пользовательские тексты (для кастомных)
  // Дополнительные параметры (techniques, goalType и т.д.)
}

export interface NotificationPreferencesDto {
  id: string;
  userId: number;
  kind: 'therapy' | 'habits';
  entityKey?: string | null;
  textSource: 'templates' | 'ai' | 'hybrid'; // Единое поле для всех
  meta?: NotificationPreferenceMeta | null;
  // другие поля
}
```

## Использование в коде

### Определение источника текста

```typescript
// В scheduler.service.ts
const textSource = pref.textSource || 'templates';

if (textSource === 'templates' || textSource === 'hybrid') {
  // Использовать шаблоны или customTexts
  if (isCustom && prefMeta?.customTexts?.length) {
    text = pickCustomText(prefMeta.customTexts);
  } else {
    template = findTemplate(kind, { entityKey });
    text = getTemplateText(template, addressing, directness, userName);
  }
  
  // В hybrid режиме 30% заменяем на AI
  if (textSource === 'hybrid' && Math.random() < 0.3) {
    text = await generateAiText({ ... });
  }
}

if (!text && (textSource === 'ai' || textSource === 'hybrid')) {
  // Генерировать через AI
  text = await generateAiText({ ... });
}
```

### AI-Способ создания

```typescript
// В ai-generation.service.ts
export async function generateNotificationTexts(params: {
  userId: number;
  kind: NotificationKind;
  entityKey: string;
  textSource: 'ai' | 'hybrid';
  // другие параметры
}): Promise<void> {
  // Генерация AI-текстов
}
```

### Сохранение настроек

```typescript
// В API endpoint
await db.insert(notificationPreferences).values({
  userId,
  kind,
  entityKey,
  textSource: 'templates', // По умолчанию для новых сущностей
  // другие поля
});
```

## UI компонент

### Выбор режима генерации

```vue
<ToggleGroup v-model="textSource" type="single">
  <ToggleGroupItem value="templates">
    📋 Шаблоны
  </ToggleGroupItem>
  <ToggleGroupItem value="ai">
    ✨ ИИ
  </ToggleGroupItem>
  <ToggleGroupItem value="hybrid">
    🔀 Гибридный
  </ToggleGroupItem>
</ToggleGroup>
```

### Условное отображение секций

```typescript
// Для кастомных
const showCustomTextsSection = computed(() => 
  textSource.value === 'templates' || textSource.value === 'hybrid'
);

const showAiInfo = computed(() => 
  textSource.value === 'ai' || textSource.value === 'hybrid'
);
```

## Логика работы режимов

### Templates

- **Кастомные:** Использует `meta.customTexts` (пользовательские тексты)
- **Готовые шаблоны:** Использует тексты из `notificationTemplates.ts`
- **Требования:** Для кастомных требуется хотя бы один текст в `customTexts`

### AI

- **Все сущности:** Генерирует тексты с помощью AI (OpenAI GPT)
- **Параметры:** Учитывает `subtype`, `directness`, `addressing`, название и описание сущности
- **Кэширование:** Использует `configHash` для предотвращения дублирования

### Hybrid

- **Кастомные:** Чередует `customTexts` и AI-тексты (70% customTexts, 30% AI)
- **Готовые шаблоны:** Чередует шаблоны и AI-тексты (70% шаблоны, 30% AI)
- **Требования:** Для кастомных требуется хотя бы один текст в `customTexts`

## Валидация

### При сохранении настроек

```typescript
// Для кастомных в режиме templates или hybrid
if ((textSource === 'templates' || textSource === 'hybrid') && isCustom) {
  if (!meta?.customTexts?.length) {
    throw new Error('Требуется хотя бы один текст для режима templates/hybrid');
  }
}
```

## Важные моменты

1. **По умолчанию:** Новые сущности создаются с `textSource: 'templates'`
2. **Кэширование:** AI-тексты кэшируются по `configHash` для оптимизации
3. **Регенерация:** При изменении параметров (название, описание, subtype) AI-тексты пересоздаются
4. **Метка AI:** AI-генерированные тексты помечаются эмодзи `✨` в начале
5. **Чередование:** В hybrid режиме используется детерминированный выбор для консистентности
