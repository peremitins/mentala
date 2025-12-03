# Идентификация сущностей в системе уведомлений

## Обзор

Система уведомлений использует единое поле `entityKey` для идентификации источника уведомлений (привычки или темы терапии). Это поле позволяет унифицировать работу с кастомными и шаблонными сущностями.

## Принципы идентификации

### Кастомные сущности

Для пользовательских привычек и тем терапии используется **стабильный ID** (nanoid), который:

- Генерируется при создании сущности
- Не меняется при изменении названия или других полей
- Гарантирует стабильность ссылок и данных
- Используется во всех таблицах уведомлений (`notification_preferences`, `notification_slots`, `ai_generated_notification_texts`)

**Пример:**

- Привычка создана с ID: `f7wSDCbyCi1r87PPufATS`
- При изменении названия ID остается прежним
- Все настройки уведомлений привязаны к этому ID

### Шаблонные сущности

Для готовых шаблонов (из каталога) используется **ключ шаблона**:

- Для привычек: `water`, `meditation`, `training`, `less_alcohol` и т.д.
- Для терапии: `anxiety`, `stress`, `sleep`, `mood` и т.д.

Эти ключи статичны и определены в коде приложения.

## Структура данных

### Таблица `habits`

```typescript
{
  id: string (PK, nanoid),        // Стабильный идентификатор
  userId: number,
  name: string,
  intent: 'build' | 'quit',
  habitKey: string | null,        // Ключ шаблона (если это шаблонная привычка)
  emoji: string | null,
  description: string | null,
  createdAt: timestamp,
  updatedAt: timestamp
}
```

### Таблица `therapy_topics_custom`

```typescript
{
  id: string (PK, nanoid),       // Стабильный идентификатор
  userId: number,
  name: string,
  description: string | null,
  emoji: string | null,
  createdAt: timestamp,
  updatedAt: timestamp
}
```

### Поле `entityKey` в таблицах уведомлений

В таблицах `notification_preferences`, `notification_slots`, `ai_generated_notification_texts` поле `entityKey` содержит:

- **Для кастомных сущностей**: ID сущности (например, `f7wSDCbyCi1r87PPufATS`)
- **Для шаблонных сущностей**: ключ шаблона (например, `water`, `anxiety`)

## API Endpoints

### Привычки

- `GET /api/habits` — список всех привычек пользователя
- `GET /api/habits/:id` — получить привычку по ID
- `POST /api/habits` — создать новую привычку (возвращает ID)
- `PUT /api/habits/:id` — обновить привычку по ID
- `DELETE /api/habits/:id` — удалить привычку по ID

### Терапия

- `GET /api/therapy/custom` — список всех кастомных тем пользователя
- `GET /api/therapy/custom/:id` — получить тему по ID
- `POST /api/therapy/custom` — создать новую тему (возвращает ID)
- `PUT /api/therapy/custom/:id` — обновить тему по ID
- `DELETE /api/therapy/custom/:id` — удалить тему по ID

### Настройки уведомлений

- `GET /api/notifications/prefs/:kind?entityKey=:id` — получить настройки для сущности
- `PUT /api/notifications/prefs/:kind?entityKey=:id` — обновить настройки для сущности

**Важно:** В параметре `entityKey` передается ID для кастомных сущностей или ключ шаблона для шаблонных.

## Фронтенд

### Навигация

Фронтенд использует ID в URL для навигации:

- `/habits/:id` — страница настройки привычки
- `/therapy/:id` — страница настройки темы терапии

### Получение данных

1. При загрузке списка привычек/тем API возвращает объекты с полем `id`
2. Фронтенд использует этот `id` для:
   - Навигации по URL
   - Запросов к API уведомлений
   - Отображения в UI

### Пример работы

```typescript
// 1. Пользователь создает привычку
const habit = await $api.post('/api/habits', {
  name: 'Пить воду',
  intent: 'build',
});
// habit.id = 'f7wSDCbyCi1r87PPufATS'

// 2. Навигация на страницу настройки
navigateTo(`/habits/${habit.id}`);

// 3. Загрузка настроек уведомлений
const prefs = await $api.get(
  `/api/notifications/prefs/habits?entityKey=${habit.id}`
);

// 4. Обновление настроек
await $api.put(`/api/notifications/prefs/habits?entityKey=${habit.id}`, {
  enabled: true,
  timesPerDay: 5,
});
```

## Преимущества подхода

1. **Стабильность**: ID не меняется при изменении названия
2. **Простота**: Один идентификатор вместо двух (ID и slug)
3. **Производительность**: Прямой поиск по ID без дополнительных проверок
4. **Масштабируемость**: Легко добавлять новые типы сущностей
5. **Надежность**: Нет рассинхрона между разными идентификаторами

## Миграция данных

При переходе на новую систему идентификации:

1. Все существующие записи в таблицах уведомлений очищаются
2. Новые записи создаются с правильным `entityKey` (ID для кастомных, ключ для шаблонных)
3. Колонка `slug` удаляется из таблиц `habits` и `therapy_topics_custom`

## Технические детали

### Генерация ID

Используется библиотека `nanoid` для генерации уникальных идентификаторов:

```typescript
import { nanoid } from 'nanoid';

const id = nanoid(); // Например: 'f7wSDCbyCi1r87PPufATS'
```

### Поиск в БД

Все поиски по кастомным сущностям используют только ID:

```typescript
// Правильно
const [habit] = await db
  .select()
  .from(habits)
  .where(and(eq(habits.id, entityKey), eq(habits.userId, userId)))
  .limit(1);

// Неправильно (такого кода больше нет)
// or(eq(habits.id, entityKey), eq(habits.slug, entityKey))
```

### Удаление сущностей

При удалении кастомной привычки или темы автоматически удаляются все связанные данные:

- Настройки уведомлений (`notification_preferences`)
- Запланированные слоты (`notification_slots`)
- AI-генерированные тексты (`ai_generated_notification_texts`)
- Использование AI-текстов (`ai_notification_text_usage`)

Это обеспечивает целостность данных и предотвращает появление "осиротевших" записей.
