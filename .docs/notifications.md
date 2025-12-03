# Система персонализированных уведомлений MentAI

**Версия:** 2.6  
**Дата:** 2025-01-XX  
**Статус:** Production Ready ✅

**Последние изменения:**

- Реализована AI Buffer Pool модель (генерация 50 текстов вместо 15)
- Добавлена таблица `ai_notification_text_usage` для отслеживания отправленных текстов
- Реализовано автоматическое пополнение пула при приближении к концу
- Добавлен retry механизм с exponential backoff для надежности генерации
- Динамический расчет токенов: `count * 200 + 5000` для гарантии получения всех текстов

## 📋 Обзор

Система персонализированных push-уведомлений для MentAI с поддержкой:

- **Therapy (Терапия)** — дыхательные практики, заземление, body scan, рефрейминг
  - **Support Topics** — тематические направления поддержки (тревога, стресс, сон и др.)
- **Habits (Привычки)** — формирование полезных привычек и отказ от вредных

### Ключевые возможности

- 🎨 **Персонализация** — настройка обращения (ты/Вы) и стиля подачи (Мягкий/Сдержанный/Строгий)
- ⏰ **Умное планирование** — равномерное распределение с джиттером ±15 минут
- 🔔 **Snooze** — отложить на 15 мин / 1 час / 4 часа / до завтра
- 📊 **Трекинг** — автоматический сбор метрик взаимодействия
- 🌍 **Timezone-aware** — автоопределение часового пояса
- 🤖 **AI-генерация** — режимы templates/ai/hybrid для создания текстов
- ⏱️ **Кастомные слоты** — ручное задание времени уведомлений

---

## 🏗 Архитектура

```
┌─────────────────┐
│  Client (Nuxt)  │
│  + Capacitor    │
└────────┬────────┘
         │
         │ REST API
         │
┌────────▼────────────────────────────┐
│  Server (Nitro)                     │
│  ├─ API Endpoints                   │
│  ├─ Scheduler Service (генерация)  │
│  └─ Delivery Worker (отправка)     │
└────────┬────────────────────────────┘
         │
    ┌────▼────┐     ┌──────────┐
    │   DB    │     │   FCM    │
    │ (Postgres) │  │ (Firebase)│
    └─────────┘     └──────────┘
```

### Компоненты

1. **База данных** — PostgreSQL с Drizzle ORM
2. **API Endpoints** — REST API для настроек, привычек, токенов
3. **Планировщик** — генерация слотов на 7 дней вперёд
4. **Воркер отправки** — обработка due-слотов каждые 5 минут
5. **Frontend Components** — UI для настройки и превью
6. **Capacitor Push Notifications** — регистрация токенов и обработка уведомлений

---

## 🗄 База данных

### Основные таблицы

- `habits` — привычки пользователя
- `therapy_topics_custom` — пользовательские темы терапии
- `user_preferences` — глобальные настройки (addressing для выбора текста informal/formal)
- `notification_preferences` — локальные настройки по типу (с поддержкой `entityKey`)
- `notification_slots` — запланированные слоты уведомлений (с поддержкой `entityKey`)
- `ai_generated_notification_texts` — AI-генерированные тексты (с поддержкой `entityKey`)
- `ai_notification_text_usage` — отслеживание отправленных AI-текстов (новая таблица)
- `user_devices` — FCM токены устройств
- `notification_interactions` — трекинг взаимодействий
- `daily_adherence` — дневная агрегация метрик

### Структура `notification_preferences`

```typescript
notification_preferences {
  id: string (PK)
  userId: integer
  kind: 'therapy' | 'habits'

  // Унифицированное поле для идентификации сущности
  entityKey: string | null  // Для habits: ID привычки, для therapy: ID темы или ключ шаблона

  enabled: boolean
  timesPerDay: integer (1-5)
  directness: 'soft' | 'moderate' | 'hard'
  timezone: string (IANA)
  subtype: 'reminder' | 'informational' | 'motivational' | 'mixed' | null  // Для habits
  textSource: 'templates' | 'ai' | 'hybrid'  // Способ создания текстов

  // Дополнительные параметры
  activeDays: integer[]  // Дни недели (0-6)
  timeRangeStart: integer  // Начало окна (в минутах, 0-1439)
  timeRangeEnd: integer  // Конец окна (в минутах, 0-1439)
  customSlotTimes: integer[] | null  // Кастомные времена (максимум 5, в минутах)
  meta: jsonb | null  // { customTexts: [...], techniques: [...] }

  createdAt: timestamp
  updatedAt: timestamp
}
```

### Миграции

**Важные миграции:**

- `0021_refactor_generationMode_to_textSource.sql` — настройка поля `textSource`
- `0022_refactor_habitId_topicKey_to_entityKey.sql` — настройка поля `entityKey`
- `0027_add_ai_notification_text_usage.sql` — таблица для отслеживания отправленных AI-текстов

**Применение:**

```bash
# Автоматически
pnpm db:migrate

# Вручную
psql -d mentai -f server/infrastructure/db/migrations/0021_refactor_generationMode_to_textSource.sql
psql -d mentai -f server/infrastructure/db/migrations/0022_refactor_habitId_topicKey_to_entityKey.sql
psql -d mentai -f server/infrastructure/db/migrations/0027_add_ai_notification_text_usage.sql
```

---

## 🔌 API Endpoints

### Глобальные настройки

- `GET /api/settings/preferences` — получить addressing и tone
- `PUT /api/settings/preferences` — обновить addressing и tone

### Локальные настройки уведомлений

- `GET /api/notifications/prefs` — все локальные настройки
- `GET /api/notifications/prefs/:kind` — настройки конкретного типа
- `GET /api/notifications/prefs/:kind?entityKey=:id` — настройки для конкретной сущности
- `PUT /api/notifications/prefs/:kind` — обновить настройки типа

**Пример запроса:**

```json
{
  "entityKey": "habit_123",
  "enabled": true,
  "timesPerDay": 3,
  "directness": "moderate",
  "subtype": "reminder",
  "textSource": "templates",
  "activeDays": [1, 2, 3, 4, 5],
  "timeRangeStart": 540, // 09:00
  "timeRangeEnd": 1350, // 22:30
  "customSlotTimes": [540, 720, 1080], // Кастомные времена
  "meta": {
    "customTexts": ["Текст 1", "Текст 2"]
  }
}
```

### CRUD для привычек

- `GET /api/habits` — список привычек
- `POST /api/habits` — создать привычку
- `GET /api/habits/:id` — получить привычку
- `PUT /api/habits/:id` — обновить привычку
- `DELETE /api/habits/:id` — удалить привычку

### CRUD для кастомной терапии

- `GET /api/therapy/custom` — список кастомных тем
- `POST /api/therapy/custom` — создать тему
- `GET /api/therapy/custom/:id` — получить тему
- `PUT /api/therapy/custom/:id` — обновить тему
- `DELETE /api/therapy/custom/:id` — удалить тему

### Управление уведомлениями

- `POST /api/notifications/register-token` — регистрация FCM токена
- `POST /api/notifications/snooze` — отложить уведомление
- `POST /api/notifications/test` — отправить тестовое (dev only)
- `POST /api/notifications/interaction` — трекинг взаимодействия

---

## 📚 Каталог шаблонов

Файл: `app/lib/notificationTemplates.ts`

### Типы для Therapy

- `breath_cue` — дыхание 4-7-8, box-breathing
- `grounding` — 5-4-3-2-1, тактильный якорь
- `body_scan` — плечи, челюсть, живот
- `reframe` — рефрейминг мыслей
- `mi_prompt` — мотивационное интервьюирование
- `sos` — быстрый вызов SOS-карты

### Параметры шаблонов

- `addressing` — informal (ты) / formal (Вы) — берётся из `user_preferences`
- `directness` — soft / moderate / hard — из `notification_preferences`
- `topic` — ключ темы терапии (anxiety, stress, mood и др.)
- `habitKey` — ключ привычки (water, smoking, sleep и др.)

**Примечание:** Support Topics (темы поддержки) хранятся как статичный справочник в коде (`app/lib/therapyCatalog.ts`), а их настройки — в `notification_preferences` через поле `entityKey`.

---

## ⚙️ Планировщик слотов

Файл: `server/application/notifications/scheduler.service.ts`

### Функции

- `generateSlotsForUser(userId, kind, options?)` — генерирует слоты на 7 дней
  - `options` может содержать `entityKey` для per-entity генерации
- `regenerateAllSlots()` — пересоздаёт слоты для всех пользователей
- `triggerSlotRegeneration(userId, kind, options?)` — триггер при изменении настроек

### Конфигурация

- Окно бодрствования: 09:00 – 22:30 (локальное время)
- Джиттер: ±15 минут
- Горизонт: 7 дней
- Кастомные слоты: приоритет над автоматическими

### Алгоритм генерации

1. Получаем настройки с учётом `entityKey`
2. Получаем глобальные настройки (`addressing` из `user_preferences`)
3. Удаляем старые запланированные слоты
4. Генерируем времена слотов:
   - Приоритет кастомным временам (`customSlotTimes`)
   - Остальные распределяются равномерно внутри окна (`timeRangeStart` - `timeRangeEnd`)
5. Для каждого слота:
   - Определяем `textSource` (templates/ai/hybrid)
   - Выбираем текст (кастомные тексты → AI-тексты → шаблоны)
   - Создаём слот в БД

---

## 🤖 Режимы генерации текстов (textSource)

### Режимы

1. **`templates`** — использование готовых шаблонов или пользовательских текстов
   - Для кастомных: используется `meta.customTexts`
   - Для готовых шаблонов: используется каталог `notificationTemplates.ts`
2. **`ai`** — тексты генерируются искусственным интеллектом
   - Используется OpenAI GPT (модель `gpt-4o-mini` для экономии)
   - Тексты сохраняются в `ai_generated_notification_texts`
   - Кэширование по `generationConfigHash`
3. **`hybrid`** — комбинация пользовательских/шаблонных текстов и AI-генерации
   - 70% пользовательских/шаблонных, 30% AI-текстов

### Логика выбора текста

```typescript
// Для кастомных сущностей
if (textSource === 'templates' || textSource === 'hybrid') {
  // Используем кастомные тексты
  text = pickCustomTextFromMeta(prefMeta, userName);
  if (textSource === 'hybrid' && Math.random() < 0.3) {
    // 30% AI в hybrid режиме
    text = await generateAiNotification({ ... });
  }
}

if (!text && (textSource === 'ai' || textSource === 'hybrid')) {
  // Генерируем через AI
  text = await generateAiNotification({ ... });
}

// Для готовых шаблонов
if (textSource === 'templates' || textSource === 'hybrid') {
  // Используем готовые шаблоны
  template = findTemplate(kind, { entityKey, ... });
  text = getTemplateText(template, addressing, directness, userName);

  if (textSource === 'hybrid' && Math.random() < 0.3) {
    // 30% AI в hybrid режиме
    text = await generateAiNotification({ ... });
  }
}
```

### AI-генерация

**Таблица:** `ai_generated_notification_texts`

- Хранение сгенерированных текстов для переиспользования
- Кэширование по `generationConfigHash` (хеш настроек, влияющих на генерацию)
- Регенерация только при изменении релевантных параметров (название, описание, tone, directness)

**Таблица:** `ai_notification_text_usage` (отслеживание отправленных текстов)

- Хранит информацию о том, какие тексты из пула уже были отправлены
- Связь между текстами (`ai_text_id`), слотами (`slot_id`) и индексами текстов
- Предотвращает повторную отправку одного и того же текста

**AI Buffer Pool модель:**

- **Количество текстов по умолчанию**: 50 (настраивается через `AI_NOTIFICATIONS_DEFAULT_COUNT`)
- Генерируется большой пул текстов сразу, который используется постепенно
- Автоматическое пополнение при приближении к концу (менее 2 дней запаса)
- Защита от дублирования: отслеживание уже отправленных текстов

**Конфигурация моделей:**

- Чат: `gpt-4o` (более мощная модель)
- Уведомления: `gpt-4o-mini` (экономичная модель)
- **Динамический расчет токенов**: `count * 200 + 5000` (для гарантии получения всех текстов)
- **Retry механизм**: автоматические повторы при ошибках с exponential backoff

---

## 👤 Пользовательские привычки и терапия

### Пользовательские привычки

- Создание через `/api/habits` с полями: название, тип, описание, emoji
- Настройки уведомлений через `/api/notifications/prefs/habits?entityKey=:id`
- Пользовательские тексты в `meta.customTexts` (до 100 текстов, каждый ≤ 178 символов)
- Плейсхолдер `{name}` для имени пользователя

### Пользовательские темы терапии

- Создание через `/api/therapy/custom` с полями: название, описание, emoji
- Настройки уведомлений через `/api/notifications/prefs/therapy?entityKey=:id`
- Пользовательские тексты в `meta.customTexts` (до 100 текстов, каждый ≤ 178 символов)

### UI особенности

- Для кастомных сущностей скрыты блоки «Фокус уведомления» и «Стиль уведомлений»
- Доступен блок «Тексты уведомлений» с валидацией
- Анимации при добавлении/удалении текстов

---

## 🔔 Воркер отправки

Файл: `server/application/notifications/delivery.service.ts`

### Функции

- `sendFCMNotification(token, payload)` — отправка через FCM
- `sendToUser(userId, payload)` — отправка всем устройствам пользователя
- `processDueSlots()` — обработка due-слотов
- `startDeliveryWorker()` — запуск воркера (интервал 5 минут)

### Запуск

Воркер запускается автоматически через плагин `server/plugins/notifications-worker.ts`.

**Development:**

```bash
# Воркер отключён по умолчанию
# Включить через переменную окружения:
ENABLE_NOTIFICATIONS_WORKER=true pnpm dev
```

**Production:**

Воркер запускается автоматически.

---

## 🎨 Frontend Components

### Компоненты

- `NotificationPreview.vue` — dev-превью уведомления
- `SettingsGeneral.vue` — глобальные настройки (addressing, tone)
- `SettingsNotificationsTherapy.vue` — настройки therapy
- `NotificationSettingsPage.vue` — универсальная страница настроек
- `WeekdaySelector.vue` — выбор дней недели
- `TimeRangeSelector.vue` — выбор окна времени
- `TimePicker.vue` — выбор конкретного времени

### Composables

- `useNotificationsSettings()` — работа с API
- `detectTimezone()` — автоопределение timezone
- `useCopyToClipboard()` — копирование в буфер обмена

### Страницы

- `/settings` → `SettingsGeneral.vue` (глобальные настройки)
- `/therapy` → список тем + настройка конкретной темы
- `/habits` → список привычек + настройка конкретной привычки

---

## 📱 Capacitor Push Notifications

Файл: `app/plugins/push-notifications.client.ts`

### Функциональность

- Регистрация FCM токена на сервере
- Обработка входящих push-уведомлений
- Трекинг взаимодействий (yes/no/later)
- Snooze через action buttons
- Deep link навигация

---

## 🚀 Установка и настройка

### 1. База данных

```bash
# Применить миграции
pnpm db:migrate
```

### 2. Firebase Setup (для production)

1. Создать Firebase проект: https://console.firebase.google.com
2. Включить Cloud Messaging
3. Скачать `google-services.json` для Android
4. Скачать `GoogleService-Info.plist` для iOS
5. Получить Service Account JSON для сервера

**Переменные окружения:**

```bash
# .env
FIREBASE_SERVICE_ACCOUNT_JSON='{"type":"service_account",...}'
```

**Для Android:**

```bash
# Поместить google-services.json в
android/app/google-services.json
```

**Для iOS:**

```bash
# Поместить GoogleService-Info.plist в
ios/App/App/GoogleService-Info.plist
```

### 3. Установка зависимостей (опционально)

#### Firebase Admin SDK (для production)

```bash
pnpm add firebase-admin
```

#### BullMQ + Redis (для production)

```bash
pnpm add bullmq ioredis
```

### 4. Запуск воркера

**Development:**

```bash
# Воркер отключён по умолчанию
# Включить через переменную окружения:
ENABLE_NOTIFICATIONS_WORKER=true pnpm dev
```

**Production:**

```bash
# Воркер запускается автоматически
pnpm build
pnpm preview
```

---

## 🧪 Тестирование

### Тестовая отправка

1. Зарегистрировать устройство (автоматически при запуске приложения)
2. Перейти в `/therapy` или `/habits`
3. Включить уведомления
4. Нажать **"Отправить тест"**

### Проверка генерации слотов

```sql
SELECT * FROM notification_slots
WHERE user_id = YOUR_USER_ID
  AND status = 'planned'
ORDER BY scheduled_at;
```

### Проверка регистрации устройств

```sql
SELECT * FROM user_devices
WHERE user_id = YOUR_USER_ID;
```

### Создание тестового слота "через 1 минуту"

Для быстрого тестирования можно создать слот через 1 минуту:

1. Нажать кнопку **"🔔 Тест через 1 мин"**
2. Появится toast: "Тестовое уведомление запланировано через 1 минуту!"
3. **Ждать 5 минут** — воркер проверяет слоты каждые 5 минут

---

## 🐛 Troubleshooting

### Push-уведомления не приходят

1. Проверить что устройство зарегистрировано:

   ```sql
   SELECT * FROM user_devices WHERE user_id = YOUR_USER_ID;
   ```

2. Проверить что слоты генерируются:

   ```sql
   SELECT * FROM notification_slots WHERE user_id = YOUR_USER_ID AND status = 'planned';
   ```

3. Проверить логи воркера:

   ```bash
   # В консоли сервера должны быть логи вида:
   [DeliveryWorker] Processing N due slots
   ```

4. Проверить Firebase настройки (если используется production FCM).

### Ошибки миграции

Если миграция не применилась, выполнить вручную:

```bash
psql -d YOUR_DB_NAME -f server/infrastructure/db/migrations/0021_refactor_generationMode_to_textSource.sql
psql -d YOUR_DB_NAME -f server/infrastructure/db/migrations/0022_refactor_habitId_topicKey_to_entityKey.sql
```

### Dev-превью не отображается

Проверить что:

1. Глобальные настройки загружены (`addressing`, `tone`)
2. Локальные настройки загружены (`directness`, `subtype`)
3. В каталоге шаблонов есть подходящий шаблон

### Ошибка: "column entity_key does not exist"

**Решение:** Применить миграции БД

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

---

## 📊 MVP Scope

### ✅ Реализовано

- ✅ База данных (таблицы, индексы, constraints)
  - ✅ Добавлена поддержка `entityKey` в `notification_preferences` и `notification_slots`
  - ✅ Добавлена поддержка `textSource` для режимов генерации
  - ✅ Добавлена поддержка `customSlotTimes` для кастомных слотов
- ✅ API эндпоинты (настройки, привычки, токены, snooze, трекинг)
- ✅ Каталог шаблонов (therapy типы с addressing/directness)
- ✅ Планировщик слотов (генерация на 7 дней с джиттером)
  - ✅ Поддержка генерации для конкретных сущностей через entityKey
  - ✅ Поддержка кастомных слотов времени
- ✅ Воркер отправки (обработка due-слотов каждые 5 минут)
- ✅ UI компоненты (глобальные и локальные настройки, превью)
- ✅ Capacitor интеграция (регистрация токенов, обработка уведомлений, snooze)
- ✅ Пользовательские привычки и тексты
- ✅ Пользовательские темы терапии
- ✅ Режимы генерации текстов (templates/ai/hybrid)

### 🔜 Следующие шаги

- ⏳ Firebase Admin SDK (настройка FCM для production)
- ⏳ BullMQ + Redis (надёжная очередь вместо setInterval)
- ⏳ Habit logs и streak (чек-ины, графики выполнения)
- ⏳ Support logs (отметки состояния, динамика)
- ⏳ Оркестрация (управление лимитами при нескольких типах)
- ⏳ Статистика и отчёты (графики, метрики, рекомендации)

---

## 🏗 Масштабирование

### MVP (текущая реализация)

- Один процесс Nitro (сервер + воркер)
- setInterval для периодической обработки
- PostgreSQL для хранения
- Подходит для ~1000 пользователей, ~10K уведомлений/день

### Production (рекомендации)

1. **BullMQ + Redis** — надёжная очередь
2. **Horizontal scaling** — несколько воркеров
3. **Rate limiting** — глобальные лимиты
4. **Мониторинг** — метрики, алерты, логи

---

## 📝 Примечания

### Обратная совместимость

Все идентификаторы используют стабильный ID (nanoid), который не меняется при изменении названия сущности.

### Производительность

- Все запросы используют индексы
- SSR-safe fetching (useFetch)
- Оптимизированные SQL запросы

### Безопасность

- Валидация через Zod DTO
- Аутентификация через JWT
- Обработка невалидных токенов

---

## 🔗 Связанные документы

- `.docs/architecture.md` — Общая архитектура проекта
- `.docs/mentai_tz_product.md` — Общие требования к продукту
- `.docs/mentai_tz_frontend.md` — Требования к фронтенду
- `.docs/mentai_tz_backend.md` — Требования к бэкенду
- `.docs/security_requirements.md` — Требования к безопасности

---

**При вопросах обращайтесь к команде разработки Mentai.**
