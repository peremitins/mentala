# Архитектура: Идентификация сущностей в системе уведомлений

## Концепция

Система уведомлений использует единое поле `entityKey` для идентификации источника уведомлений (привычки или терапии), независимо от типа.

### Семантика `entityKey`:

- **Для habits (`kind === 'habits'`):** `entityKey` содержит ID, slug или ключ шаблона привычки
- **Для therapy (`kind === 'therapy'`):** `entityKey` содержит ID, slug или ключ шаблона темы терапии
- **Для общих настроек:** `entityKey` = `null` (когда нет привязки к конкретной сущности)

### Преимущества:

1. Упрощение кода - единая логика вместо двух веток
2. Консистентность - единое поле для всех типов
3. Меньше ошибок - невозможно перепутать поля
4. Унификация - единый подход во всем коде

## Структура базы данных

### Таблица `notification_preferences`

```sql
notification_preferences (
  id: bigint (PK)
  user_id: bigint (FK)
  kind: 'therapy' | 'habits'
  entity_key: varchar(255)  -- Единое поле для идентификации сущности
  enabled: boolean
  times_per_day: integer
  directness: 'soft' | 'moderate' | 'hard'
  timezone: varchar(50)
  subtype: varchar(20) | null
  text_source: 'templates' | 'ai' | 'hybrid'
  meta: jsonb | null
  created_at: timestamp
  updated_at: timestamp
)
```

### Таблица `notification_slots`

```sql
notification_slots (
  id: varchar(255) (PK)
  user_id: bigint (FK)
  kind: 'therapy' | 'habits'
  entity_key: varchar(255)  -- Единое поле для идентификации сущности
  scheduled_at: timestamp
  payload: jsonb
  template_id: varchar(255)
  status: 'planned' | 'sent' | 'snoozed' | 'cancelled'
  created_at: timestamp
)
```

### Таблица `ai_generated_notification_texts`

```sql
ai_generated_notification_texts (
  id: varchar(255) (PK)
  user_id: bigint (FK)
  entity_key: varchar(255).notNull()  -- Единое поле для идентификации сущности
  text: text
  text_source: 'ai' | 'hybrid'
  config_hash: varchar(255)
  created_at: timestamp
)
```

## Типы и DTO

### `shared/dto/notifications.ts`

```typescript
export interface NotificationPreferencesDto {
  id: string;
  userId: number;
  kind: 'therapy' | 'habits';
  entityKey?: string | null; // Единое поле для идентификации сущности
  enabled: boolean;
  timesPerDay: number;
  directness: 'soft' | 'moderate' | 'hard';
  timezone: string;
  subtype?: string | null;
  textSource: 'templates' | 'ai' | 'hybrid';
  meta?: NotificationPreferenceMeta | null;
  createdAt: string;
  updatedAt: string;
}

export interface UpdateNotificationPreferencesDto {
  entityKey?: string | null;
  enabled?: boolean;
  timesPerDay?: number;
  directness?: 'soft' | 'moderate' | 'hard';
  timezone?: string;
  subtype?: string | null;
  textSource?: 'templates' | 'ai' | 'hybrid';
  meta?: NotificationPreferenceMeta | null;
}

export interface NotificationSlotDto {
  id: string;
  userId: number;
  kind: 'therapy' | 'habits';
  entityKey?: string | null; // Единое поле для идентификации сущности
  scheduledAt: string;
  payload: NotificationPayload;
  templateId: string;
  status: 'planned' | 'sent' | 'snoozed' | 'cancelled';
  createdAt: string;
}
```

## Схема БД (Drizzle ORM)

### `server/infrastructure/db/schema.ts`

```typescript
export const notificationPreferences = pgTable('notification_preferences', {
  id: serial('id').primaryKey(),
  userId: integer('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  kind: varchar('kind', { length: 20 }).notNull(),
  entityKey: varchar('entity_key', { length: 255 }), // Единое поле
  enabled: boolean('enabled').notNull().default(false),
  timesPerDay: integer('times_per_day').notNull().default(1),
  directness: varchar('directness', { length: 20 })
    .notNull()
    .default('moderate'),
  timezone: varchar('timezone', { length: 50 }).notNull(),
  subtype: varchar('subtype', { length: 20 }),
  textSource: varchar('text_source', { length: 20 })
    .notNull()
    .default('templates'),
  meta: jsonb('meta'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

export const notificationSlots = pgTable('notification_slots', {
  id: varchar('id', { length: 255 }).primaryKey(),
  userId: integer('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  kind: varchar('kind', { length: 20 }).notNull(),
  entityKey: varchar('entity_key', { length: 255 }), // Единое поле
  scheduledAt: timestamp('scheduled_at').notNull(),
  payload: jsonb('payload').notNull(),
  templateId: varchar('template_id', { length: 255 }),
  status: varchar('status', { length: 20 }).notNull().default('planned'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

export const aiGeneratedNotificationTexts = pgTable(
  'ai_generated_notification_texts',
  {
    id: varchar('id', { length: 255 }).primaryKey(),
    userId: integer('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    entityKey: varchar('entity_key', { length: 255 }).notNull(), // Единое поле
    text: text('text').notNull(),
    textSource: varchar('text_source', { length: 20 }).notNull(),
    configHash: varchar('config_hash', { length: 255 }).notNull(),
    createdAt: timestamp('created_at').notNull().defaultNow(),
  }
);
```

## Использование в коде

### Поиск настроек по entityKey

```typescript
// Получить настройки для конкретной сущности
const prefs = await db
  .select()
  .from(notificationPreferences)
  .where(
    and(
      eq(notificationPreferences.userId, userId),
      eq(notificationPreferences.kind, kind),
      eq(notificationPreferences.entityKey, entityKey)
    )
  )
  .limit(1);
```

### Генерация слотов

```typescript
// Генерация слотов для конкретной сущности
await generateSlotsForUser(userId, kind, { entityKey });
```

### API Endpoints

```typescript
// Получить настройки
GET /api/notifications/prefs/habits?entityKey=habit-slug
GET /api/notifications/prefs/therapy?entityKey=anxiety

// Обновить настройки
PUT /api/notifications/prefs/habits
Body: {
  entityKey: 'habit-slug',
  enabled: true,
  timesPerDay: 3,
  // ...
}
```

## Важные моменты

1. **Валидация:** При `kind === 'habits'` или `kind === 'therapy'` `entityKey` должен быть заполнен для per-entity настроек
2. **Нормализация:** Для кастомных сущностей использовать slug вместо ID
3. **Поиск:** Все запросы используют `entityKey` для поиска (включая поиск по ID и slug)
4. **Логирование:** Все логи используют `entityKey` для идентификации сущности
5. **Индексы:** Созданы индексы для эффективного поиска по `entity_key`
