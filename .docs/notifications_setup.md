# Настройка системы персонализированных уведомлений

## Обзор

Система персонализированных push-уведомлений для Mentai с поддержкой:

- **Therapy (Терапия)** — дыхательные практики, заземление, body scan, рефрейминг
  - **Support Topics** — тематические направления поддержки (тревога, стресс, сон и др.)
- **Habits (Привычки)** — формирование полезных привычек и отказ от вредных

## Архитектура

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

## Компоненты

### 1. База данных (Drizzle ORM)

**Таблицы:**

- `habits` — привычки пользователя
- `user_preferences` — глобальные настройки (addressing, tone)
- `notification_preferences` — локальные настройки по типу (с поддержкой `entityKey` - унифицированное поле для идентификации сущности)
- `notification_slots` — запланированные слоты уведомлений (с поддержкой `entityKey`)
- `ai_generated_notification_texts` — AI-генерированные тексты (с поддержкой `entityKey`)
- `user_devices` — FCM токены устройств
- `notification_interactions` — трекинг взаимодействий
- `daily_adherence` — дневная агрегация метрик

**Примечание:** Support Topics (темы поддержки) хранятся как статичный справочник в коде, а их настройки — в `notification_preferences` через поле `entityKey`.

**Миграции:**

```bash
# Создать миграцию
pnpm db:generate

# Применить миграции
pnpm db:migrate
```

**Важные миграции:**

- `0021_refactor_generationMode_to_textSource.sql` — настройка поля `textSource`
- `0022_refactor_habitId_topicKey_to_entityKey.sql` — настройка поля `entityKey`

### 2. API Endpoints

#### Глобальные настройки

- `GET /api/settings/preferences` — получить addressing и tone
- `PUT /api/settings/preferences` — обновить addressing и tone

#### Локальные настройки уведомлений

- `GET /api/notifications/prefs` — все локальные настройки
- `GET /api/notifications/prefs/:kind` — настройки конкретного типа
- `PUT /api/notifications/prefs/:kind` — обновить настройки типа

#### CRUD для привычек

- `GET /api/habits` — список привычек
- `POST /api/habits` — создать привычку
- `PUT /api/habits/:id` — обновить привычку
- `DELETE /api/habits/:id` — удалить привычку

#### Управление уведомлениями

- `POST /api/notifications/register-token` — регистрация FCM токена
- `POST /api/notifications/snooze` — отложить уведомление
- `POST /api/notifications/test` — отправить тестовое (dev only)
- `POST /api/notifications/interaction` — трекинг взаимодействия

### 3. Каталог шаблонов

Файл: `app/lib/notificationTemplates.ts`

**Типы для Therapy:**

- `breath_cue` — дыхание 4-7-8, box-breathing
- `grounding` — 5-4-3-2-1, тактильный якорь
- `body_scan` — плечи, челюсть, живот
- `reframe` — рефрейминг мыслей
- `mi_prompt` — мотивационное интервьюирование
- `sos` — быстрый вызов SOS-карты

**Параметры:**

- `addressing` — informal (ты) / formal (Вы)
- `tone` — delicate / neutral / uplifting / resolute / demanding
- `directness` — soft / moderate / hard

### 4. Планировщик слотов

Файл: `server/application/notifications/scheduler.service.ts`

**Функции:**

- `generateSlotsForUser(userId, kind, options?)` — генерирует слоты на 7 дней
  - `options` может содержать `entityKey` для per-entity генерации
- `regenerateAllSlots()` — пересоздаёт слоты для всех пользователей
- `triggerSlotRegeneration(userId, kind, options?)` — триггер при изменении настроек

**Конфигурация:**

- Окно бодрствования: 09:00 – 22:30 (локальное время)
- Джиттер: ±15 минут
- Горизонт: 7 дней

### 5. Воркер отправки

Файл: `server/application/notifications/delivery.service.ts`

**Функции:**

- `sendFCMNotification(token, payload)` — отправка через FCM
- `sendToUser(userId, payload)` — отправка всем устройствам пользователя
- `processDueSlots()` — обработка due-слотов
- `startDeliveryWorker()` — запуск воркера (интервал 5 минут)

Воркер запускается автоматически через плагин `server/plugins/notifications-worker.ts`.

### 6. Frontend Components

#### Компоненты

- `NotificationPreview.vue` — dev-превью уведомления
- `SettingsGeneral.vue` — глобальные настройки (addressing, tone)
- `SettingsNotificationsTherapy.vue` — настройки therapy с превью

#### Composables

- `useNotificationsSettings()` — работа с API
- `detectTimezone()` — автоопределение timezone

#### Страницы

- `/settings` → `SettingsGeneral.vue` (глобальные настройки)
- `/therapy` → `SettingsNotificationsTherapy.vue` (настройки therapy, общие)
- `/support` → Picker тем + список активных тем (в разработке)
- `/support/:key` → Настройка конкретной темы поддержки (в разработке)
- `/habits` → Picker целей + список активных привычек (в разработке)
- `/habits/:id` → Настройка конкретной привычки (в разработке)

### 7. Capacitor Push Notifications

Файл: `app/plugins/push-notifications.client.ts`

**Функциональность:**

- Регистрация FCM токена на сервере
- Обработка входящих push-уведомлений
- Трекинг взаимодействий (yes/no/later)
- Snooze через action buttons
- Deep link навигация

## Установка и настройка

### 1. База данных

```bash
# Применить миграции
pnpm db:migrate
```

### 2. Firebase Setup (TODO)

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
ios/App/GoogleService-Info.plist
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

## Использование

### 1. Настройка глобальных параметров

Перейти на страницу `/settings` и настроить:

- **Обращение**: ты / Вы
- **Тон общения**: деликатный / нейтральный / воодушевляющий / решительный / требовательный

### 2. Включение уведомлений для Therapy

Перейти на страницу `/therapy` и настроить:

- **Включить уведомления**: toggle
- **Частота**: 1-5 раз в день (слайдер)
- **Стиль уведомлений**: Поддерживающий / Сдержанный / Требовательный

Превью уведомления обновляется автоматически при изменении параметров.

### 3. Тестовая отправка

На странице `/therapy` нажать кнопку **"Отправить тест"**.

> ⚠️ Для тестовой отправки устройство должно быть зарегистрировано (FCM токен).

### 4. Snooze

В push-уведомлении нажать на action "Later" или выбрать длительность:

- 15 минут
- 1 час
- 4 часа
- До завтра

### 5. Трекинг взаимодействий

При клике на уведомление или action (Yes/No/Later) автоматически отправляется трекинг на сервер (`POST /api/notifications/interaction`).

## MVP Scope

В MVP реализовано:

- ✅ База данных (таблицы, индексы, constraints)
  - ✅ Добавлена поддержка `entityKey` в `notification_preferences` и `notification_slots`
- ✅ API эндпоинты (настройки, привычки, токены, snooze, трекинг)
- ✅ Каталог шаблонов (therapy типы с addressing/tone/directness)
- ✅ Планировщик слотов (генерация на 7 дней с джиттером)
  - ✅ Поддержка генерации для конкретных сущностей через entityKey
- ✅ Воркер отправки (обработка due-слотов каждые 5 минут)
- ✅ UI компоненты (глобальные и локальные настройки, превью)
- ✅ Capacitor интеграция (регистрация токенов, обработка уведомлений, snooze)

В разработке:

- 🚧 Support Topics UI (picker тем, список, настройка каждой темы)
- 🚧 Habits UI (picker целей, список, настройка каждой привычки)
- 🚧 Расширение каталога шаблонов (темы поддержки, типы привычек)

Следующие шаги (после MVP):

- ⏳ Firebase Admin SDK (настройка FCM для production)
- ⏳ BullMQ + Redis (надёжная очередь вместо setInterval)
- ⏳ Habit logs и streak (чек-ины, графики выполнения)
- ⏳ Support logs (отметки состояния, динамика)
- ⏳ Оркестрация (управление лимитами при нескольких типах)
- ⏳ Статистика и отчёты (графики, метрики, рекомендации)

## Troubleshooting

### Push-уведомления не приходят

1. Проверить что устройство зарегистрировано:

   ```bash
   SELECT * FROM user_devices WHERE user_id = YOUR_USER_ID;
   ```

2. Проверить что слоты генерируются:

   ```bash
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
psql -d YOUR_DB_NAME -f server/infrastructure/db/migrations/0006_add_notifications_system.sql
```

### Dev-превью не отображается

Проверить что:

1. Глобальные настройки загружены (`addressing`, `tone`)
2. Локальные настройки загружены (`directness`)
3. В каталоге шаблонов есть подходящий шаблон

## API Документация

Полная документация по API доступна через Scalar:

```
http://localhost:3000/_scalar
```

## Мониторинг (TODO)

Для production рекомендуется настроить:

- **Метрики**: количество отправленных/failed слотов, latency
- **Алерты**: рост failed > 5%, падение active devices, увеличение latency
- **Логирование**: структурированные логи (Pino) + Sentry для ошибок

См. раздел "Приложение E — Наблюдаемость" в ТЗ.

## Контакты

При вопросах обращайтесь к команде разработки Mentai.
