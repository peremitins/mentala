# Переменные окружения для безопасности

## Обзор

Для корректной работы системы безопасности необходимо настроить следующие переменные окружения.

---

## 🔗 Deep Links / App Links (опционально, но важно для mobile checkout return)

### `IOS_APP_LINK_TEAM_ID`

**Описание:** Apple Team ID для генерации `/.well-known/apple-app-site-association`.

**Дефолт:** `8QMGJ847K5`

### `IOS_APP_LINK_BUNDLE_IDS`

**Описание:** Список iOS bundle id через запятую для Universal Links.

**Дефолт:** `com.mentala.app`

**Пример:**

```bash
IOS_APP_LINK_BUNDLE_IDS=com.mentala.app,com.mentala.app.dev
```

### `ANDROID_APP_LINK_PACKAGE_NAME`

**Описание:** Android package name для `/.well-known/assetlinks.json`.

**Дефолт:** `com.mentala.app`

### `ANDROID_APP_LINK_SHA256_FINGERPRINTS`

**Описание:** SHA-256 fingerprints сертификатов подписи Android-приложения (через запятую/пробел/`;`).

**Важно:** Для production обязательно указать релизный fingerprint (и при необходимости debug).

**Пример:**

```bash
ANDROID_APP_LINK_SHA256_FINGERPRINTS=12:34:...:AB,CD:EF:...:90
```

---

## 🔐 Production (обязательно)

### `PUBLIC_APP_ORIGIN` (приоритет 1)

**Описание:** Основной домен приложения в production.

**Формат:** Полный URL с протоколом, доменом и портом (если не стандартный)

**Примеры:**

```bash
PUBLIC_APP_ORIGIN=https://app.mentala.com
PUBLIC_APP_ORIGIN=https://mentala.com
PUBLIC_APP_ORIGIN=https://app.mentala.com:443
```

**Где используется:**

- Origin/Referer проверки для cookie-канала
- Определение разрешенных источников запросов

**Важно:**

- Должен быть точным origin (scheme + host + port)
- Не использовать wildcards или подстановки
- Если не указан, используется `ALLOWED_ORIGINS`

---

### `ALLOWED_ORIGINS` (приоритет 2, если `PUBLIC_APP_ORIGIN` не задан)

**Описание:** Список разрешенных origins для Origin/Referer проверок (через запятую).

**Формат:** Список полных URL через запятую

**Примеры:**

```bash
ALLOWED_ORIGINS=https://app.mentala.com,https://admin.mentala.com
ALLOWED_ORIGINS=https://mentala.com
```

**Где используется:**

- Origin/Referer проверки для cookie-канала
- Альтернатива `PUBLIC_APP_ORIGIN` если нужны несколько доменов

**Важно:**

- Каждый origin должен быть точным (scheme + host + port)
- Разделитель: запятая
- Если не указан ни `PUBLIC_APP_ORIGIN`, ни `ALLOWED_ORIGINS` → ошибка в production

---

## ✏️ Development (опционально)

### `DEV_ALLOWED_ORIGINS`

**Описание:** Список разрешенных origins для development режима (через запятую).

**Формат:** Список полных URL через запятую

**Примеры:**

```bash
# Для локальной разработки
DEV_ALLOWED_ORIGINS=http://localhost:3000,http://127.0.0.1:3000

# Для разработки на LAN (мобильные устройства)
DEV_ALLOWED_ORIGINS=http://localhost:3000,http://192.168.1.100:3000,http://10.0.2.2:3000

# Для Android Studio эмулятора
DEV_ALLOWED_ORIGINS=http://localhost:3000,http://10.0.2.2:3000
```

**Где используется:**

- Origin/Referer проверки в development режиме
- Позволяет тестировать на реальных устройствах через LAN

**Важно:**

- Если не указан, используется дефолтный список: `http://localhost:3000,http://127.0.0.1:3000`
- Каждый origin должен быть точным (scheme + host + port)
- Разделитель: запятая

---

### `RATE_LIMIT_MAX`

**Описание:** Максимум запросов в окне глобального API rate-limit middleware.

**Формат:** Целое число `>= 1`

**Дефолт:** `180`

**Где используется:**

- `server/middleware/rate-limit.ts` (только для `/api/*`).

---

### `RATE_LIMIT_WINDOW_MS`

**Описание:** Длительность окна для глобального API rate-limit middleware в миллисекундах.

**Формат:** Целое число `>= 1000`

**Дефолт:** `60000`

**Где используется:**

- `server/middleware/rate-limit.ts` (только для `/api/*`).

---

## 📝 Примеры конфигурации

### Локальная разработка (только на компьютере)

```bash
# .env.development
DEV_ALLOWED_ORIGINS=http://localhost:3000,http://127.0.0.1:3000
```

### Разработка с мобильными устройствами (LAN)

```bash
# .env.development
# Замените 192.168.1.100 на IP вашего компьютера в локальной сети
DEV_ALLOWED_ORIGINS=http://localhost:3000,http://192.168.1.100:3000
```

### Android Studio эмулятор

```bash
# .env.development
# 10.0.2.2 - специальный IP для доступа к localhost хоста из эмулятора
DEV_ALLOWED_ORIGINS=http://localhost:3000,http://10.0.2.2:3000
```

### Production

```bash
# .env.production
PUBLIC_APP_ORIGIN=https://app.mentala.com
# ИЛИ
ALLOWED_ORIGINS=https://app.mentala.com,https://admin.mentala.com
```

---

## ⚠️ Важные замечания

1. **Точность origins:** Все origins должны быть точными (scheme + host + port). Не использовать wildcards или подстановки.

2. **Production обязательность:** В production **обязательно** указать либо `PUBLIC_APP_ORIGIN`, либо `ALLOWED_ORIGINS`. Иначе приложение выбросит ошибку при старте.

3. **Development опциональность:** `DEV_ALLOWED_ORIGINS` опционален. Если не указан, используется дефолтный список.

4. **Порты:** Если используете нестандартный порт, обязательно указывайте его в origin:

   - ✅ `http://localhost:3000`
   - ❌ `http://localhost` (может не работать если порт не 80/443)

5. **HTTPS в production:** В production всегда используйте HTTPS:
   - ✅ `https://app.mentala.com`
   - ❌ `http://app.mentala.com` (небезопасно)

---

## 🔍 Где настраивать

### Локальная разработка

Создайте или обновите файл `.env.development`:

```bash
DEV_ALLOWED_ORIGINS=http://localhost:3000,http://127.0.0.1:3000,http://192.168.1.100:3000
```

### Production

Настройте переменные окружения на сервере (через ваш deployment инструмент):

```bash
PUBLIC_APP_ORIGIN=https://app.mentala.com
```

Или через `.env.production` (если используете):

```bash
PUBLIC_APP_ORIGIN=https://app.mentala.com
```

---

## ✉️ Email и верификация (обязательно для prod, опционально для dev)

## 🧹 Удаление аккаунта (опционально)

### `AUTH_DELETE_GRACE_DAYS`

**Описание:** Сколько дней даётся на восстановление после запроса удаления.

**Формат:** Число дней (0 или пусто — удаление сразу).

**Примеры:**

```bash
# Удалять сразу
AUTH_DELETE_GRACE_DAYS=0

# Окно восстановления 7 дней
AUTH_DELETE_GRACE_DAYS=7
```

**Где используется:**

- `/api/user/delete` — включает 2‑фазное удаление и постановку задачи в очередь

### `AUTH_EMAIL_CODE_SECRET`

**Описание:** Secret для хеширования 6-значных кодов подтверждения email.

**Формат:** Строка (минимум 32 символа).

**Где используется:**

- Хеширование и проверка кода верификации email
- Защита от подбора и timing атак

---

### `AUTH_EMAIL_CODE_SECRET_PREVIOUS` (опционально)

**Описание:** Предыдущий secret для безопасной ротации.

**Где используется:**

- Позволяет валидировать коды, созданные до ротации секретов

---

### `EMAIL_HASH_PEPPER`

**Описание:** Secret (pepper) для HMAC‑SHA256 хеширования нормализованного email.

**Где используется:**

- `trial_usage_tracking` для защиты от злоупотребления триалом
- Хеширование делается только на сервере

**Важно:**

- Должен быть задан в production
- При смене значения требуется миграция/перехеширование

---

### SMTP (Yandex)

**Переменные:**

```bash
SMTP_HOST=smtp.yandex.ru
SMTP_PORT=465
SMTP_SECURE=true
SMTP_USER=your-email@yandex.ru
SMTP_PASSWORD=your-app-password
SMTP_FROM=your-email@yandex.ru
SMTP_FROM_NAME=Mentala
```

**Где используется:**

- Отправка кодов подтверждения email через nodemailer

---

### `AUTH_CLEANUP_ENABLED` (опционально)

**Описание:** Включает ежедневную очистку незавершённых аккаунтов.

**Значения:**

- `true` (по умолчанию)
- `false` — отключить очистку

---

### `TRIAL_USAGE_CLEANUP_ENABLED` (опционально)

**Описание:** Включает ежедневную очистку `trial_usage_tracking` по ретеншну (1 год).

**Значения:**

- `true` (по умолчанию)
- `false` — отключить очистку

---

### `TRIAL_DURATION_HOURS` (опционально)

**Описание:** Длительность trial в часах. Используется сервером при первичной активации trial.

**Значение по умолчанию:**

- `168` (7 дней)

**Примеры для тестов:**

- `TRIAL_DURATION_HOURS=1` — trial на 1 час
- `TRIAL_DURATION_HOURS=24` — trial на 1 день

---

### `TRIAL_BILLING_EARLY_CHARGE_MINUTES` (опционально)

**Описание:** За сколько минут до `nextChargeAt` запускать первую auto-попытку списания для `billingCollectionStatus=scheduled`.

**Значение по умолчанию:**

- `5`

**Зачем нужно:**

- Убирает окно, когда trial уже закончился, а первое списание еще не стартовало из-за интервала воркера.

---

### `TRIAL_BILLING_REMINDER_BATCH_SIZE` (опционально)

**Описание:** Размер одного батча пользователей для отправки reminder о будущем списании (за 24 часа).

**Значение по умолчанию:**

- `200`

---

### `TRIAL_BILLING_REMINDER_MAX_BATCHES_PER_TICK` (опционально)

**Описание:** Максимальное количество reminder-батчей, которое воркер обработает за один tick.

**Значение по умолчанию:**

- `8`

**Зачем нужно:**

- Позволяет в одном 5-минутном tick обработать больше пользователей и не упираться в единичный `limit`.

---

### `TRIAL_BILLING_REMINDER_CONCURRENCY` (опционально)

**Описание:** Параллелизм отправки reminder внутри одного батча.

**Значение по умолчанию:**

- `20`

---

### `TRIAL_BILLING_REMINDER_LOCK_TTL_MINUTES` (опционально)

**Описание:** TTL lock для reminder-claim между инстансами воркера (антидублирование).

**Значение по умолчанию:**

- `30`

---

### `PAYMENT_RETURN_EXTERNAL_SESSION_TTL_SECONDS` (опционально)

**Описание:** TTL (в секундах) одноразового external-session токена для возврата из YooKassa redirect/bind flow во внешний браузер.

**Значение по умолчанию:**

- `7200` (2 часа)

**Зачем нужно:**

- Токен не должен истекать, пока пользователь находится в платежной форме YooKassa.
- После возврата браузер сначала получает web cookie-сессию через `/auth/external-session/consume`, затем открывает `/subscription`.

---

## 🔐 OAuth Google (Web + Native)

### `NUXT_OAUTH_GOOGLE_CLIENT_ID`

**Описание:** Web OAuth Client ID для server-side web callback (`/api/auth/google/callback`) и для валидации ID token на backend.

**Где используется:**

- Web OAuth (Authorization Code)
- Валидация ID token для нативного Google Sign-In

---

### `NUXT_OAUTH_GOOGLE_CLIENT_SECRET`

**Описание:** Секрет Web OAuth клиента (нужен только серверу).

---

### `NUXT_OAUTH_GOOGLE_CLIENT_ID`

**Описание:** Публичный Web Client ID для инициализации нативного Google Sign-In (Android/iOS).\nЕсли не задан, автоматически используется `NUXT_OAUTH_GOOGLE_CLIENT_ID`.\n\n**Примечание:** В большинстве случаев достаточно задать только `NUXT_OAUTH_GOOGLE_CLIENT_ID`, так как значения обычно одинаковые.

---

### `NUXT_PUBLIC_GOOGLE_IOS_CLIENT_ID`

**Описание:** iOS Client ID для Google Sign-In (нужен для iOS).\nБерётся из Google Cloud Console (iOS OAuth client).

---

## 🧪 Проверка конфигурации

После настройки переменных окружения проверьте:

1. **Development:**

   ```bash
   # Запустите приложение
   pnpm dev

   # Проверьте логи - не должно быть ошибок про allowed origins
   ```

2. **Production:**
   ```bash
   # При старте приложения должна быть проверка
   # Если переменные не установлены - будет ошибка
   ```

---

---

## 🔐 Админские права

### `ADMIN_EMAILS` (опционально, для админских функций)

**Описание:** Список email адресов администраторов (через запятую).

**Формат:** Список email адресов через запятую

**Примеры:**

```bash
ADMIN_EMAILS=admin@mentala.com,superadmin@mentala.com
ADMIN_EMAILS=admin1@example.com,admin2@example.com,admin3@example.com
```

**Где используется:**

- Проверка прав доступа к админским endpoints (`/api/users/*`, `/api/db/*`)
- Проверка прав доступа к админским страницам UI (`/users/*`)
- Временное решение до реализации полноценной системы ролей

**Важно:**

- Email адреса сравниваются в нижнем регистре (case-insensitive)
- Если не указан, админские endpoints будут недоступны (requireAdmin выбросит ошибку)
- Это временное решение - в будущем будет заменено на систему ролей из `.docs/roles_and_permissions_tz.md`

**Где настраивать:**

```bash
# .env.development или .env.production
ADMIN_EMAILS=admin@mentala.com,superadmin@mentala.com
```

---

## 🔔 Масштабирование слотов уведомлений

### Feature flags

```bash
slots_scheduler_enabled=true
slots_regen_enabled=true
slots_sharding_enabled=true
slots_backpressure_enabled=true
slots_db_unique_constraint_enabled=true
```

Поддерживаются также UPPER_SNAKE_CASE варианты:
`SLOTS_SCHEDULER_ENABLED`, `SLOTS_REGEN_ENABLED`, `SLOTS_SHARDING_ENABLED`, `SLOTS_BACKPRESSURE_ENABLED`, `SLOTS_DB_UNIQUE_CONSTRAINT_ENABLED`.

### Scheduler / enqueue

```bash
SLOTS_SCHEDULER_BATCH_SIZE=200
SLOTS_SCHEDULER_INTERVAL_MS=60000
SLOTS_SCHEDULER_JITTER_MS=15000
SLOTS_SCHEDULER_SHARDS=16
SLOTS_CURSOR_STALE_MS=7680000
SLOTS_FAIRNESS_MAX_DELAY_HOURS=6
```

Примечание: дефолт `SLOTS_CURSOR_STALE_MS` вычисляется динамически как
`max(10 минут, SLOTS_SCHEDULER_INTERVAL_MS * SLOTS_SCHEDULER_SHARDS * 8)`.

### Worker / regen

```bash
SLOTS_WORKER_CONCURRENCY=2
SLOTS_REGEN_THRESHOLD_PERCENT=80
SLOTS_SAFE_QUEUED_WINDOW_MINUTES=15
SLOTS_REGEN_SAFE_WINDOW_MINUTES=10
SLOTS_TARGET_HORIZON_HOURS=48
SLOTS_MIN_HORIZON_HOURS=36
SLOTS_LOCK_TIMEOUT_MS=2000
SLOTS_REGEN_MAX_RUNTIME_MS=60000
SLOTS_REGEN_TX_TIMEOUT_MS=20000
SLOTS_MAX_ROWS_PER_REGEN=500
SLOTS_MIN_REGEN_INTERVAL_MINUTES=30
SLOTS_JITTER_MINUTES=15
SLOTS_MIN_GAP_MINUTES=10
```

### Backpressure / queue

```bash
SLOTS_BACKPRESSURE_QUEUE_DEPTH=1000
SLOTS_BACKPRESSURE_QUEUE_LAG_MS=300000
SLOTS_BACKPRESSURE_RECOVERY_CYCLES=3
SLOTS_JOB_DEDUP_TTL_MS=21600000
SLOTS_RESCHEDULE_BASE_DELAY_MS=30000
SLOTS_RESCHEDULE_MAX_DELAY_MS=900000
SLOTS_TRACE_PREFIX=slots
```

### Delivery / due slots

```bash
NOTIFICATION_MAX_SLOT_AGE_HOURS_BEFORE_SKIP=24
```

- `NOTIFICATION_MAX_SLOT_AGE_HOURS_BEFORE_SKIP` — максимальный возраст due-слота (в часах), после которого слот помечается `skipped` вместо отправки.
- `0` отключает skip по возрасту полностью (все due-слоты отправляются).
- По умолчанию: `24` часа.

### Где используется

- sharded scheduler: `server/application/notifications/schedulers/notificationSlots.scheduler.ts`
- worker регенерации: `server/application/notifications/workers/notificationSlots.worker.ts`
- безопасная регенерация + xact lock: `server/application/notifications/global-orchestration.service.ts`
- единый конфиг и дефолты: `server/application/notifications/slots-scaling.config.ts`

---

## 🌐 Лендинг (apps/landing)

### `NUXT_PUBLIC_YANDEX_METRIKA_ID` (опционально)

**Описание:** Числовой ID счётчика Яндекс.Метрики для аналитики лендинга. Если не задан, скрипт Метрики не подключается, цели не отправляются.

**Где используется:** плагин `apps/landing/plugins/yandex-metrika.client.ts`, композабл `useLandingAnalytics`. События: `landing_view`, `landing_cta_click`, `landing_modal_open`, `landing_lead_submit_*`, `landing_scroll_depth_*`, `landing_auth_redirect_click`.

**Пример:** `NUXT_PUBLIC_YANDEX_METRIKA_ID=98765432`

**GitHub Actions (деплой лендинга):** в workflow подставляется и **Repository variable**, и **Repository secret** с именем `NUXT_PUBLIC_YANDEX_METRIKA_ID`. Settings → Secrets and variables → Actions → создать Variable или Secret, после этого пересобрать/задеплоить лендинг.

---

## 📚 Дополнительная информация

Подробнее о реализации см. в `.docs/auth_tz.md` (Часть II. Безопасность авторизации).
