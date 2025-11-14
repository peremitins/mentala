# Mentai Notifications v2 — Инструкция по применению

## 📋 Что реализовано

Система персонализированных уведомлений v2 с единой архитектурой для:

1. **Habits (Привычки)** — формирование полезных привычек (🚭 бросить курить, 💧 пить воду, 😴 лучше спать)
2. **Therapy Topics (Темы терапии)** — эмоциональная поддержка по 10 темам (😰 тревога, 😮‍💨 стресс, 😔 настроение и др.)

## 🚀 Быстрый старт

### 1. Применить миграцию БД

```bash
# Если используете Drizzle Kit
npm run db:push

# Или применить SQL миграцию напрямую
psql -d mentai -f server/infrastructure/db/migrations/0007_add_topic_key_support.sql
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
│       ├── [kind].get.ts                # ОБНОВЛЕНО: поддержка ?habitId / ?topicKey
│       └── [kind].put.ts                # ОБНОВЛЕНО: сохранение с habitId/topicKey
├── application/notifications/
│   └── scheduler.service.ts             # ОБНОВЛЕНО: генерация слотов с habitId/topicKey
└── infrastructure/db/
    ├── schema.ts                         # ОБНОВЛЕНО: добавлены topicKey, meta
    └── migrations/
        └── 0007_add_topic_key_support.sql # НОВОЕ
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
│   │   ├── DirectnessSelector.vue       # Мягко/Умеренно/Жёстко
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
shared/dto/notifications.ts              # ОБНОВЛЕНО: добавлены topicKey, meta
```

## 🔑 Ключевые изменения

### 1. Единая таблица `notification_preferences`

До:

```sql
-- Только kind и habitId
notification_preferences (kind, habitId, ...)
```

После:

```sql
-- Добавлены topicKey и meta
notification_preferences (
  kind,           -- 'therapy' | 'habits'
  habitId,        -- для habits (per-habit)
  topicKey,       -- для therapy (per-topic) ← НОВОЕ
  meta,           -- JSONB для доп. параметров ← НОВОЕ
  ...
)
```

### 2. API endpoints с query параметрами

```typescript
// Habits (per-habit настройки)
GET /api/notifications/prefs/habits?habitId=habit_123

// Therapy Topics (per-topic настройки)
GET /api/notifications/prefs/therapy?topicKey=anxiety
```

### 3. Scheduler с habitId/topicKey

```typescript
// Было
generateSlotsForUser(userId, kind)

// Стало
generateSlotsForUser(userId, kind, { habitId?, topicKey? })
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
-- Проверить, что слоты создались с habitId
SELECT * FROM notification_slots
WHERE habit_id IS NOT NULL
ORDER BY scheduled_at DESC
LIMIT 10;

-- Проверить, что слоты создались с topicKey
SELECT * FROM notification_slots
WHERE topic_key IS NOT NULL
ORDER BY scheduled_at DESC
LIMIT 10;
```

## 📝 Примечания

### Индексы

Миграция создаёт следующие индексы:

- `notification_preferences_topic_key_idx` — для быстрого поиска по topicKey
- `notification_slots_topic_key_idx` — для быстрого поиска слотов
- `notification_preferences_user_therapy_topic` — уникальность (userId + kind + topicKey)
- `notification_preferences_user_therapy_general` — уникальность общих настроек
- `notification_preferences_user_habits` — уникальность (userId + kind + habitId)

### Производительность

- Все запросы используют индексы
- SSR-safe fetching (useFetch)
- Оптимизированные SQL запросы

## 🐛 Troubleshooting

### Ошибка: "column topic_key does not exist"

**Решение:** Примените миграцию БД

```bash
npm run db:push
```

### Ошибка: "No template found"

**Причина:** Нет шаблонов с нужными параметрами

**Решение:** Добавьте больше шаблонов в `app/lib/notificationTemplates.ts` или проверьте фильтрацию по `topic`/`category`

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

_Версия:_ 2.3  
_Дата:_ 2025-11-06  
_Статус:_ Production Ready ✅
