# Mentai Notifications v2 — Инструкция по применению

## 📋 Что реализовано

Система персонализированных уведомлений v2 с единой архитектурой для:

1. **Habits (Привычки)** — формирование полезных привычек (🚭 бросить курить, 💧 пить воду, 😴 лучше спать)
2. **Therapy Topics (Темы терапии)** — эмоциональная поддержка по 10 темам (😰 тревога, 😮‍💨 стресс, 😔 настроение и др.)

## 🚀 Быстрый старт

### 1. Применить миграции БД

```bash
# Если используете Drizzle Kit
npm run db:push

# Или применить SQL миграции напрямую
psql -d mentai -f server/infrastructure/db/migrations/0021_refactor_generationMode_to_textSource.sql
psql -d mentai -f server/infrastructure/db/migrations/0022_refactor_habitId_topicKey_to_entityKey.sql
```

### 2. Запустить проект

```bash
npm run dev
```

### 3. Проверить работу

- Перейдите на `/habits` — создайте привычку и настройте уведомления
- Перейдите на `/support` — выберите тему поддержки и настройте

## 📁 Структура изменений

### Backend

```
server/
├── api/
│   ├── habits/                          # CRUD для привычек
│   │   ├── index.get.ts                 # GET /api/habits
│   │   ├── index.post.ts                # POST /api/habits
│   │   ├── [id].get.ts                  # GET /api/habits/:id (НОВОЕ)
│   │   ├── [id].put.ts                  # PUT /api/habits/:id
│   │   └── [id].delete.ts               # DELETE /api/habits/:id
│   ├── therapy/
│   │   └── topics.get.ts                # GET /api/therapy/topics (НОВОЕ)
│   └── notifications/prefs/
│       ├── [kind].get.ts                # ОБНОВЛЕНО: поддержка ?entityKey
│       └── [kind].put.ts                # ОБНОВЛЕНО: сохранение с entityKey
├── application/notifications/
│   └── scheduler.service.ts             # ОБНОВЛЕНО: генерация слотов с entityKey
└── infrastructure/db/
    ├── schema.ts                         # Схема БД с entityKey и textSource
    └── migrations/
        ├── 0021_refactor_generationMode_to_textSource.sql
        └── 0022_refactor_habitId_topicKey_to_entityKey.sql
```

### Frontend

```
app/
├── lib/
│   ├── therapyCatalog.ts                  # НОВОЕ: справочник 10 тем
│   └── notificationTemplates.ts          # ОБНОВЛЕНО: поля topic, category
├── components/
│   ├── notifications/                    # НОВОЕ: общие компоненты
│   │   ├── NotificationPreview.vue      # Превью с кнопкой 🎲
│   │   ├── FrequencyStepper.vue         # Слайдер 1-5 раз/день
│   │   └── NotificationToggle.vue       # Вкл/Выкл
│   └── habits/                           # НОВОЕ: компоненты привычек
│       ├── HabitGoalPicker.vue
│       ├── HabitCard.vue
│       └── HabitsList.vue
└── pages/
    ├── habits/                           # НОВОЕ
    │   ├── index.vue                    # Главная: picker + список
    │   └── [id].vue                     # Настройка привычки
    └── therapy/                           # НОВОЕ
        ├── index.vue                    # Главная: picker + список
        └── [key].vue                    # Настройка темы
```

### Shared

```
shared/dto/notifications.ts              # DTO с entityKey и textSource
```

## 🔑 Ключевые изменения

### 1. Единая таблица `notification_preferences`

```sql
notification_preferences (
  kind,           -- 'therapy' | 'habits'
  entityKey,      -- единое поле для идентификации сущности
  textSource,     -- 'templates' | 'ai' | 'hybrid'
  meta,           -- JSONB для доп. параметров (customTexts и т.д.)
  enabled,        -- включены ли уведомления
  timesPerDay,    -- количество уведомлений в день
  directness,     -- 'soft' | 'moderate' | 'hard'
  timezone,       -- IANA timezone
  ...
)
```

### 2. API endpoints с query параметрами

```typescript
// Habits (настройки для конкретной привычки)
GET /api/notifications/prefs/habits?entityKey=habit_123

// Therapy Topics (настройки для конкретной темы)
GET /api/notifications/prefs/therapy?entityKey=anxiety
```

### 3. Scheduler с entityKey

```typescript
generateSlotsForUser(userId, kind, { entityKey? })
```

### 4. Режимы генерации текстов (textSource)

```typescript
// textSource: 'templates' | 'ai' | 'hybrid'
// - templates: готовые шаблоны или пользовательские тексты
// - ai: AI-генерированные тексты
// - hybrid: чередование пользовательских и AI-текстов
```

## 🎨 UI особенности

### Адаптивный дизайн

- Mobile-first подход
- Grid layout для разных размеров экрана
- Touch-friendly интерфейс

### Анимации

- Hover эффекты на карточках
- Плавные transitions
- Микро-анимации при взаимодействии

### Темная тема

- Полная поддержка dark mode
- Адаптивные цвета и контрасты

### Accessibility

- Правильные ARIA-атрибуты
- Семантическая разметка
- Навигация с клавиатуры

## 🧪 Проверка работы

### 1. Создание привычки

```bash
# Откройте браузер
open http://localhost:3000/habits

# 1. Выберите цель (например, "Бросить курить")
# 2. Настройте частоту и стиль
# 3. Сохраните
```

### 2. Выбор темы терапии

```bash
# Откройте браузер
open http://localhost:3000/therapy

# 1. Выберите тему (например, "Тревога и паника")
# 2. Настройте частоту и стиль
# 3. Сохраните
```

### 3. Проверка слотов в БД

```sql
-- Проверить, что слоты создались с entityKey
SELECT * FROM notification_slots
WHERE entity_key IS NOT NULL
ORDER BY scheduled_at DESC
LIMIT 10;

-- Проверить слоты для конкретной сущности
SELECT * FROM notification_slots
WHERE entity_key = 'your-entity-key'
ORDER BY scheduled_at DESC;
```

## 📝 Примечания

### Индексы

Миграции создают следующие индексы:

- `notification_preferences_entity_key_idx` — для быстрого поиска по entityKey
- `notification_slots_entity_key_idx` — для быстрого поиска слотов
- `notification_preferences_user_kind_entity` — уникальность (userId + kind + entityKey)
- `ai_generated_notification_texts_entity_key_idx` — для быстрого поиска AI-текстов по entityKey

### Производительность

- Все запросы используют индексы
- SSR-safe fetching (useFetch)
- Оптимизированные SQL запросы

## 🐛 Troubleshooting

### Ошибка: "column entity_key does not exist"

**Решение:** Примените миграции БД

```bash
# Применить все миграции
npm run db:push

# Или вручную применить необходимые миграции
psql -d mentai -f server/infrastructure/db/migrations/0021_refactor_generationMode_to_textSource.sql
psql -d mentai -f server/infrastructure/db/migrations/0022_refactor_habitId_topicKey_to_entityKey.sql
```

### Ошибка: "No template found"

**Причина:** Нет шаблонов с нужными параметрами

**Решение:** Добавьте больше шаблонов в `app/lib/notificationTemplates.ts` или проверьте фильтрацию по `entityKey` и другим параметрам

### UI компоненты не отображаются

**Решение:** Перезапустите dev server

```bash
npm run dev
```

## 📚 Документация

Подробная документация:

- `.docs/mentai-notifications-update.md` — полная спецификация v2.3
- `.docs/notifications_implementation_summary.md` — итоги реализации
- `.docs/notifications_architecture.md` — архитектура системы

## ✨ Готово!

Система готова к использованию. Наслаждайтесь красивыми и функциональными уведомлениями! 🎉

---

_Версия:_ 2.5  
_Дата:_ 2025-01-XX  
_Статус:_ Production Ready ✅

**Текущая архитектура:**

- Используется единое поле `entityKey` для идентификации сущностей
- Режимы генерации текстов: `textSource` (`templates`/`ai`/`hybrid`)
