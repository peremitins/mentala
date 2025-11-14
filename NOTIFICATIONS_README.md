# 📱 Персонализированные уведомления Mentai

Система персонализированных push-уведомлений с AI-оркестрацией для поддержки и формирования привычек.

## ✨ Возможности

- 🧘 **Therapy (Терапия)** — дыхательные практики, заземление, body scan, рефрейминг
- 🎯 **Habits (Привычки)** — формирование полезных привычек
- 🎨 **Персонализация** — настройка обращения (ты/Вы) и стиля подачи (мягко/умеренно/жёстко)
- ⏰ **Умное планирование** — равномерное распределение с джиттером
- 🔔 **Snooze** — отложить на 15 мин / 1 час / 4 часа / до завтра
- 📊 **Трекинг** — автоматический сбор метрик взаимодействия
- 🌍 **Timezone-aware** — автоопределение часового пояса

## 🚀 Быстрый старт

### 1. Применить миграции

```bash
pnpm db:migrate
```

### 2. Настроить Firebase (опционально для production)

```bash
# 1. Создать Firebase проект
# 2. Скачать google-services.json (Android)
# 3. Добавить переменную окружения
FIREBASE_SERVICE_ACCOUNT_JSON='{"type":"service_account",...}'
```

### 3. Запустить приложение

```bash
# Development (воркер отключён по умолчанию)
pnpm dev

# Включить воркер в dev
ENABLE_NOTIFICATIONS_WORKER=true pnpm dev
```

### 4. Настроить уведомления

1. Перейти в `/settings` → настроить **обращение** (ты/Вы)
2. Перейти в `/therapy` или `/habits` → включить уведомления, выбрать **частоту** и **стиль подачи**
3. Нажать **"Отправить тест"** для проверки

## 📁 Структура проекта

```
server/
├─ api/
│  ├─ settings/preferences.{get,put}.ts     # Глобальные настройки
│  ├─ notifications/
│  │  ├─ prefs/[kind].{get,put}.ts          # Локальные настройки
│  │  ├─ register-token.post.ts             # Регистрация FCM токена
│  │  ├─ snooze.post.ts                     # Отложить уведомление
│  │  ├─ test.post.ts                       # Тестовая отправка
│  │  └─ interaction.post.ts                # Трекинг взаимодействий
│  └─ habits/                               # CRUD для привычек
├─ application/notifications/
│  ├─ scheduler.service.ts                  # Генерация слотов
│  └─ delivery.service.ts                   # Отправка через FCM
├─ plugins/
│  └─ notifications-worker.ts               # Запуск воркера
└─ infrastructure/db/
   ├─ schema.ts                             # Drizzle схемы
   └─ migrations/0006_add_notifications_system.sql

app/
├─ components/
│  ├─ notifications/NotificationPreview.vue # Dev-превью
│  └─ settings/
│     ├─ SettingsGeneral.vue               # Глобальные настройки
│     └─ SettingsNotificationsTherapy.vue  # Настройки therapy
├─ composables/
│  └─ useNotificationsSettings.ts          # API wrapper
├─ lib/
│  └─ notificationTemplates.ts             # Каталог шаблонов
├─ pages/
│  ├─ settings.vue                         # → SettingsGeneral
│  └─ therapy.vue                          # → SettingsNotificationsTherapy
└─ plugins/
   └─ push-notifications.client.ts         # Capacitor интеграция

shared/dto/
└─ notifications.ts                         # Shared типы
```

## 🗄️ База данных

### Основные таблицы

- `habits` — привычки пользователя
- `user_preferences` — глобальные настройки (addressing для выбора текста informal/formal)
- `notification_preferences` — локальные настройки по типу
- `notification_slots` — запланированные слоты
- `user_devices` — FCM токены устройств
- `notification_interactions` — трекинг взаимодействий
- `daily_adherence` — дневная агрегация метрик

### Применение миграций

```bash
# Автоматически
pnpm db:migrate

# Вручную (если нужно)
psql -d your_db -f server/infrastructure/db/migrations/0006_add_notifications_system.sql
```

## 📚 Документация

- **Полное ТЗ:** [.docs/mentai-notifications-AI-spec-v2.md](.docs/mentai-notifications-AI-spec-v2.md)
- **Инструкции по настройке:** [.docs/notifications_setup.md](.docs/notifications_setup.md)
- **Архитектура системы:** [.docs/notifications_architecture.md](.docs/notifications_architecture.md)

## 🎯 MVP Scope

### ✅ Реализовано

- ✅ База данных (7 таблиц, индексы, constraints)
- ✅ API эндпоинты (15+ endpoints для настроек, привычек, токенов, snooze, трекинга)
- ✅ Каталог шаблонов (20+ шаблонов для therapy с 3x5x3 комбинациями)
- ✅ Планировщик слотов (генерация на 7 дней с джиттером ±15 мин)
- ✅ Воркер отправки (обработка due-слотов каждые 5 минут)
- ✅ UI компоненты (глобальные и локальные настройки, dev-превью)
- ✅ Capacitor интеграция (регистрация токенов, обработка уведомлений, snooze)

### 🔜 Следующие шаги

- ⏳ Firebase Admin SDK (настройка FCM для production)
- ⏳ BullMQ + Redis (надёжная очередь вместо setInterval)
- ⏳ Habits типы (реализация уведомлений для привычек)
- ⏳ Оркестрация (управление лимитами при нескольких типах)
- ⏳ Статистика и отчёты (графики, метрики, рекомендации)

## 🔧 Конфигурация

### Переменные окружения

```bash
# Firebase (опционально для production)
FIREBASE_SERVICE_ACCOUNT_JSON='{"type":"service_account",...}'

# Включить воркер в dev
ENABLE_NOTIFICATIONS_WORKER=true
```

### Конфигурация планировщика

```typescript
// server/application/notifications/scheduler.service.ts
const SCHEDULE_CONFIG = {
  horizonDays: 7, // Генерируем на 7 дней вперёд
  awakeWindowStart: '09:00', // Начало окна бодрствования
  awakeWindowEnd: '22:30', // Конец окна бодрствования
  jitterMinutes: 15, // Джиттер ±15 минут
  dailyCap: 8, // Глобальный лимит/день
  perHourCap: 2, // Лимит/час
  minGapMinutes: 25, // Минимальный шаг между уведомлениями
};
```

## 🧪 Тестирование

### Тестовая отправка

1. Зарегистрировать устройство (автоматически при запуске приложения)
2. Перейти в `/therapy`
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

## 🐛 Troubleshooting

### Push-уведомления не приходят

1. Проверить что устройство зарегистрировано (`user_devices`)
2. Проверить что слоты генерируются (`notification_slots`)
3. Проверить логи воркера в консоли сервера
4. Проверить Firebase настройки (если используется production FCM)

### Dev-превью не отображается

Проверить что:

1. Глобальные настройки загружены (`addressing` для выбора текста)
2. Локальные настройки загружены (`directness`, `subtype`)
3. В каталоге шаблонов есть подходящий шаблон

### Ошибки миграции

```bash
# Применить вручную
psql -d your_db -f server/infrastructure/db/migrations/0006_add_notifications_system.sql
```

## 📖 API Документация

Полная документация по API доступна через Scalar:

```
http://localhost:3000/_scalar
```

## 🏗️ Масштабирование

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

## 🤝 Участие в разработке

Система разработана по спецификации [mentai-notifications-AI-spec-v2.md](.docs/mentai-notifications-AI-spec-v2.md) с учётом лучших практик:

- **Архитектура:** Event-driven с разделением на Scheduler + Worker
- **Масштабируемость:** Готова к переходу на BullMQ + Redis
- **Персонализация:** Настройка обращения (informal/formal) и стиля подачи (soft/moderate/hard)
- **UX:** Dev-превью, Snooze, автоопределение timezone, дефолтное значение subtype = 'mixed' для habits
- **Безопасность:** Валидация, аутентификация, обработка невалидных токенов

## 📝 Лицензия

Proprietary — разработано для Mentai

---

**При вопросах обращайтесь к команде разработки Mentai.**
