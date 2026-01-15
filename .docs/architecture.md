Архитектура проекта Mentala

📌 Общий обзор
• Фронтенд: Nuxt 4 + TypeScript + Pinia + TailwindCSS + shadcn-vue + vue-query.
• Бэкенд: Nitro (Node.js runtime) + Postgres + Drizzle ORM.
• Мобильность: Capacitor + Ionic (iOS/Android).
• Валидация и схемы: Zod (в связке с @vee-validate/zod).
• Логи и мониторинг: Pino + Sentry.
• Миграции БД: Drizzle Kit (SQL файлы хранятся для совместимости с будущими системами).
• Медитации v1: аудио и обложки в `public/meditations/*` (сервисная таблица в БД — источник метаданных, для плеера используем `backgroundPath`; секции каталога: Избранное, Сон, Стресс, Тревога, Фокус, Самооценка, Эмоции, Поддержка).

Система проектируется так, чтобы в будущем можно было безболезненно перенести бэкенд на Laravel (PHP), сохранив API-контракты и миграции.

🏗 Каркас приложения (Фронтенд)
• Layouts:
• default (со встроенным BottomNav),
• blank (fullscreen),
• auth (центрирование форм).
• Страницы:
index, onboarding, chat (layout blank), therapy, habits, profile/\*, billing.
• Медитации:
• Страницы `/meditations` и `/meditations/:id`.
• Состояния: компонент StateBlock отображает idle/loading/empty/error.
• Сторы Pinia:
• ui
• user
• chat
• DTO (Zod): shared/dto/index.ts.

⸻

⚙️ Бэкенд (Nitro)
• Структура:

server/
├─ config/ # конфигурация (env, keys)
├─ domain/ # бизнес-логика
├─ ports/ # контракты интерфейсов
├─ application/ # сервисы и use-cases
├─ infrastructure/ # доступ к БД (Drizzle, Postgres)
├─ interface/ # REST API, контроллеры
└─ middleware/ # cors, helmet, rate-limit

    •	БД: PostgreSQL
    •	snake_case для таблиц и полей
    •	PK: BIGINT AUTO INCREMENT (совместимость с Laravel)
    •	хранение миграций в SQL
    •	ORM: Drizzle ORM
    •	преимущества: типобезопасность, простые миграции, готовые SQL.
    •	легко заменить на Eloquent (Laravel) при необходимости.

⸻

🔐 Безопасность
• Хранение паролей: Argon2id (в Node через argon2, в Laravel встроено).
• Аутентификация: Система сессий с httpOnly cookie (Web) и заголовком X-Session-Token (Mobile).
• Cookie-канал: используется только каноничное имя cookie (fallback на альтернативное имя отключён).
• CSRF защита: Double Submit Cookie паттерн для web-запросов.
• Шифрование данных: end-to-end для чатов, ключи разделяются (как в Telegram).
• Middleware:
• helmet (защита заголовков),
• rate-limit (DDOS),
• cors (whitelist origins из env),
• csrf (для cookie-канала, state-changing методы).
• Логирование security events (csrf_mismatch, origin_mismatch, ip_mismatch и т.д.).
• Email‑верификация: коды в Redis (`auth:email_verification:*`), hash `sha256(code+secret)`, TTL 15 минут, 5 попыток, rate limit по IP/email.
• Временный пароль до верификации: `auth:email_verification_password:*` (TTL 15 минут), перенос в БД только после подтверждения.
• OAuth-линковка: временные данные `auth:oauth_link:*` + код `auth:oauth_link_code:*`, TTL 15 минут, до 5 попыток.
• OAuth redirect в dev: если configured `PUBLIC_APP_ORIGIN` не совпадает с origin запроса, используется origin текущего запроса (нужно для ngrok/туннелей и мобильного dev).
• Очистка незавершённых аккаунтов: nightly cleanup по `emailVerifiedAt = null` и `passwordHash = null` (можно отключить `AUTH_CLEANUP_ENABLED=false`).
• OAuth защита от дублей: уникальный constraint на `(provider, providerUserId)` в `oauth_accounts`.
• Восстановление осиротевших OAuth-аккаунтов: если `oauth_accounts` указывает на несуществующего пользователя, запись перевязывается на пользователя по email или создаётся новый пользователь.
• Email обязателен для всех аккаунтов (NOT NULL); OAuth без email не создаёт пользователя.
• Осиротевшие/заблокированные сессии: если сессия указывает на удалённого или заблокированного пользователя, она удаляется и cookies сбрасываются.
• Политика удаления аккаунта: по умолчанию удаление происходит сразу (hard delete), но можно включить grace‑период через `AUTH_DELETE_GRACE_DAYS` (тогда используется 2‑фазное удаление и очередь).
• Нативный Google Sign-In (Capacitor): клиент получает `idToken` и отправляет в `/api/auth/google/native`, сервер валидирует через `google-auth-library` и создаёт сессию.
• Диагностика Google Sign-In на мобильных: клиент валидирует Web Client ID и показывает понятные ошибки по типовым кодам Google (DEVELOPER_ERROR, отмена входа, сеть).
• Capacitor dev CORS: при запуске через `server.url` в dev клиент использует `window.location.origin` как API baseURL, чтобы избегать CORS между ngrok/локальным доменом.
• Медитации v1:
• Таблицы: `meditation_tracks` (каталог), `meditation_favorites` (избранное).
• Настройки пользователя: `user_preferences.meditation_timer_minutes`.
• Плеер мини/детальной страницы: кнопки «Назад/Вперёд» для треков, при переключении активного трека во время воспроизведения автоплей не прерывается (следующий/предыдущий трек стартует сразу); для `isLoop` треков используется Web Audio API (AudioBufferSourceNode + loopStart/loopEnd) для бесшовного лупа без пауз, с fallback на HTMLAudio при недоступности Web Audio. Фон детальной медитации подтягивается из `backgroundPath` на уровне layout `default.vue`, тянется на весь экран, выше aurora-слоя и без затемнения. Для одной медитации поддерживается несколько тем через массив `topicKeys`, поэтому трек может появляться в нескольких секциях, но в «Все» остаётся один раз.

⸻

📑 Контракты API
• Валидация: Zod DTO.
• Документация: OpenAPI (zod-to-openapi).
• UI: Swagger / Scalar UI (@scalar/nuxt).
• SDK для фронта: генерируется из OpenAPI → фронтенд не зависит от конкретного бэкенда.

⸻

🧭 Онбординг welcome_setup
• Пол обязателен, но для генерации текстов есть нейтральный fallback на случай отсутствия/невалидности.
• Возрастные диапазоны: "До 30" (`under_30`), "30–45" (`30_45`), "45+" (`45_plus`).
• Кнопка "Назад" обязательна; прогресс-бар считает `Y` динамически при пропусках.
• Имя из онбординга всегда перезаписывает OAuth имя в `users.name`.
• В `users`: `gender`, `age_range`, `onboarding` (jsonb с флагами, сейчас `welcome`).
• `GET /api/user/me` возвращает `onboarding.welcome`; `POST /api/user/onboarding/complete` сохраняет профиль и `userPreferences.tone`.

⸻

🔔 Настройки уведомлений
• Таблица `notification_preferences` хранит `active_days`, `time_range_start/end`, `custom_slot_times` и `entity_key` (унифицированное поле для идентификации сущности - привычки или темы терапии).
• `custom_slot_times` — массив длиной до 5 значений (в минутах, 0–1439). `null` означает автоматическое распределение и теперь безопасно передаётся/сохраняется как `null` без 400 от API.
• `entity_key` — единое поле для идентификации источника уведомлений. Для кастомных сущностей используется ID, для готовых шаблонов - ключ шаблона.
• API `/api/notifications/prefs` поддерживает CRUD этих полей, принимает `subtype = mixed` для привычек и отдаёт то же значение; на уровне БД обновлённое ограничение `notification_prefs_subtype_check` теперь тоже разрешает `mixed`.
• Фронт использует `WeekdaySelector`, `TimeRangeSelector`, а также кликабельные чипы под слайдером частоты для точного времени.
• Планировщик (`scheduler.service.ts`) при генерации слотов даёт приоритет кастомным временам, остальное распределяет равномерно внутри выбранного окна.
• Глобальная оркестрация слотов описана в `.docs/NOTIFICATION_SCHEDULING_ORCHESTRATION.md`: учитывается `sent/queued/planned` в текущем дне, допускается перевес групп, фиксированные времена не сдвигаются.
• При изменении настроек уведомлений регенерация использует флаг `forceTodaySlots`: если до конца окна достаточно времени, гарантируется минимум 1 слот сегодня (и полное заполнение при раннем включении).
• Доставка слотов: если planned-слот опоздал больше чем на 10 минут, он не отправляется, помечается как `skipped` и считается выполненным для дневной квоты.
• UI (habits и therapy) отражает вручную заданные слоты: под слайдером частоты отображается интерактивный список слотов с тайм-пикерами; компонент TimePicker использует Radix ScrollArea без `overflow-hidden`, поэтому свайпы/прокрутка работают нативно, а кнопки синхронно центрируют выбранное значение.
• Изображения уведомлений: подбираются по `kind/entityKey` из `public/notifications/*` с разрезом `male/female/neutral`, c циклическим перебором по порядку и равномерным смешиванием gender+neutral, fallback на `common` и allowlist тем, URL строится от `PUBLIC_APP_ORIGIN`/`NUXT_PUBLIC_APP_URL`.

• Режимы генерации текстов (`textSource`):
• `templates` — использование готовых шаблонов или пользовательских текстов (для кастомных привычек/терапии)
• `ai` — Способ создания с помощью AI (OpenAI GPT) - генерируется 50 текстов сразу (AI Buffer Pool модель)
• `hybrid` — комбинация пользовательских текстов и AI-генерированных (чередование)

• AI Buffer Pool для уведомлений:
• Генерируется 50 текстов сразу при создании/изменении настроек
• Тексты хранятся в `ai_generated_notification_texts` и используются постепенно
• Отслеживание отправленных текстов через таблицу `ai_notification_text_usage`
• Автоматическое пополнение при приближении к концу (менее 2 дней запаса)
• Динамический расчет токенов: `count * 200 + 5000` для гарантии получения всех текстов
• Retry механизм с exponential backoff для надежности генерации

• Пользовательские привычки и тексты:
• На странице `/habits` теперь есть карточка CTA «Создать свою привычку», открывающая модалку с полями Название/Тип/Описание/Эмодзи и интегрированным store `useUserHabitsStore`.
• Пользовательские привычки (без `habitKey`) сохраняются через `/api/habits`, поддерживают opz. описание и emoji; список хранится в Pinia и объединяется с каталогом.
• **Архитектура текстов уведомлений с изоляцией данных пользователей**: все тексты (дефолтные и пользовательские) хранятся в таблице `notification_texts` в БД. Каждый пользователь имеет свои персональные копии дефолтных текстов (lazy initialization при первом обращении). Управление текстами доступно через отдельную страницу `/notifications/[kind]/[entityKey]/texts` с полноценным редактором (`NotificationTextsEditorPage`).
• Форматирование уведомлений учитывает `gender`: варианты вида `сделал(а)` заменяются на корректную форму, скобочные варианты не попадают в итоговый текст.
• **Изоляция данных**: тексты с `userId IS NULL` больше не используются для пользовательских данных. Каждый пользователь работает только со своими текстами (`userId = userId`, `source='default'` или `source='user'`). Источником истины для дефолтных текстов является таблица `notification_text_presets` (read-only, только для разработчиков/админов). При первом обращении к текстам автоматически копируются из presets в персональные копии пользователя через сервис `initialize-texts.service.ts`. **Freeze-модель пресетов**: После первой инициализации новые пресеты не попадут к существующим пользователям автоматически (только через reset или миграции).
• Планировщик (`scheduler.service.ts`) загружает тексты из таблицы `notification_texts` по фильтрам (`kind`, `entityKey`, `directness`, `addressing`, `intent`, `subtype`). При `textSource === 'templates'` используются тексты из БД; при `textSource === 'ai'` или `'hybrid'` используются AI-генерированные тексты с чередованием.
• Пользовательские темы терапии:
• Таблица `therapy_topics_custom` + DTO (`Create/UpdateTherapyTopicDto`) + CRUD ручки `/api/therapy/custom/*` позволяют хранить названия/описания/emoji кастомной терапии с привязкой к userId.
• Pinia-store `useTherapyTopicsStore` синхронизирует список тем между страницами, а компоненты `NotificationIndexPage` и `CreateTherapyModal` добавляют CTA-карточку, модалку создания и кнопку удаления (с `ConfirmModal`).
• NotificationSettingsPage для режима therapy загружает кастомные темы по id, позволяет inline-редактирование названия/описания. Управление текстами уведомлений доступно через отдельную страницу `/notifications/therapy/[entityKey]/texts` (та же архитектура, что и для привычек).
• Тексты уведомлений хранятся в таблице `notification_texts`; планировщик обрабатывает терапию так же, как привычки: при `textSource === 'templates'` используются тексты из БД; при `textSource === 'ai'` или `'hybrid'` используются AI-генерированные тексты.
• Удаление кастомной темы через UI очищает локальный store и оставляет пользователя на списке (navigateTo `/therapy`), а отдельная кнопка корзины выровнена с arrow-иконкой в NotificationIndexPage, чтобы список для therapy/habits выглядел единообразно.

⸻

💳 Подписки, минуты и биллинг

• Данные и таблицы:
• `subscription_plans` — конфигурация тарифов (`basic/pro/premium`), лимиты минут, фичи.
• `user_subscriptions` — периоды подписок пользователя + статус оплаты (`active/pending/expired/canceled`) + `billing_period`.
• `subscription_events` — аудит/аналитика (trial_started, checkout_started, purchase_success/failed, subscription_canceled и т.д.).
• `payments` — идемпотентность webhook по `payment.id` YooKassa (PK = text).
• `idempotency_keys` — идемпотентность команд (ключ = userId+route+Idempotency-Key), хранит `response_json` для повторов.
• `therapy_sessions` — учёт минут: `started_at`, `last_activity_at`, `ended_at`, `duration_seconds`.
• `trial_usage_tracking` — защита от злоупотребления Trial по идентификатору пользователя (email, в будущем phone).

• Trial:
• Trial — это **состояние пользователя**, а не отдельный план: `users.has_used_trial`, `users.trial_started_at`, `users.trial_ended_at`.
• При регистрации создаётся `Basic` подписка; если Trial активен — функционал как Premium на 7 дней.
• Идентификатор Trial: сейчас **email обязателен**, без email регистрация не поддерживается.
• Нормализация email: `normalizeEmail` (lowercase + Gmail aliases + Unicode NFKC) — единая для auth и trial tracking.
• Идентификатор: `email_hash` (HMAC‑SHA256 + `EMAIL_HASH_PEPPER`) как ключ; `email_normalized` хранится для поддержки.
• Консистентность: операции Trial выполняются в одной транзакции; `trial_usage_tracking` обновляется через UPSERT.
• Ретеншн PII для `trial_usage_tracking`: 1 год после последнего использования Trial или удаления аккаунта (см. `.docs/trial_abuse_prevention_tz.md`).
• Очистка ретеншна: ежедневная фоновая очистка `trial_usage_tracking` (можно отключить `TRIAL_USAGE_CLEANUP_ENABLED=false`).

• Checkout (MVP, без реального YooKassa checkout):
• `POST /api/subscriptions/start-checkout` требует заголовок `Idempotency-Key`.
• Создаёт `pending` подписку и сохраняет «ожидаемые» checkout-поля прямо в `user_subscriptions`:
`checkout_amount`, `checkout_currency`, `billing_credit_applied`, `billing_credit_granted`, `yookassa_payment_id`.
• Кредит `billingCredit` **резервируется** на старте checkout (уменьшаем `users.billing_credit`) и:
• при `payment.succeeded` не списывается повторно,
• при `payment.canceled` возвращается.
• Если `toPay === 0` — финализация происходит сразу в `start-checkout` (без webhook).

• YooKassa webhook:
• В `POST /api/payments/yookassa/webhook` подлинность уведомления подтверждается через API YooKassa:
`GET https://api.yookassa.ru/v3/payments/{payment_id}` (Basic Auth `shopId:secretKey`).
• Сумма/валюта сверяются с `user_subscriptions.checkout_*` перед активацией.
• Все мутации — в транзакции; конкурентные повторы защищены `ON CONFLICT DO NOTHING` по `payments.id`.

• Доступ к AI и лимиты:
• Сервер жёстко проверяет доступ к AI и недельный лимит минут (с overdraft `WEEKLY_OVERDRAFT_MINUTES`).
• `/api/therapy/session/start` откажет, если нет доступа к AI или лимит исчерпан.
• `/api/chat/stream` требует `therapySessionId`, обновляет `last_activity_at` на сервере и проверяет лимиты перед запросом к LLM.
• Suggested replies (чипы): возвращаются отдельным финальным SSE‑чанком в `/api/chat/stream` перед `[DONE]`, формат и поля описываются в Zod‑DTO.
• Генерация чипов: сервис `suggested-chips.service.ts` с анти‑повторами (in‑memory store последних N=30 на сессию), без fallback‑чипов, с одним ретраем.
• Summary сессий сохраняется только при наличии достаточных ответов пользователя; без фактов из сообщений пользователя summary не генерируется.
• Welcome‑приветствия в повторных сессиях формулируются нейтрально и не утверждают факт обсуждения конкретной темы.

• Миграции (Drizzle):
• Меняем `server/infrastructure/db/schema.ts` → запускаем `pnpm db:generate` → `pnpm db:migrate`.
• Миграции для подписок/биллинга сейчас: `0005_*` (база), `0006_*` (payments/idempotency/billing*period/last_activity_at), `0007*\*` (checkout-поля + response_json).

⸻

📊 Логирование и мониторинг
• Node.js (Nitro): Pino + Sentry.
• Laravel (в будущем): Monolog + Sentry.
• Правила:
• request_id, user_id, service, env всегда в логах.
• структура логов совместима между Pino и Monolog.

⸻

🕒 Очереди и фоновые задачи
• Брокер: Redis (локально через Docker, в production через Upstash).
• Node.js: BullMQ 5.x для обработки фоновых задач.
• Структура очередей:
• `notification-slots-generation` — генерация слотов уведомлений для пользователей
• `notification-delivery` — отправка уведомлений через FCM
• `ai-text-pool-refill` — пополнение пула AI-генерированных текстов
• Воркеры запускаются автоматически через плагин `server/plugins/bullmq-workers.ts`.
• Конфигурация: `BULLMQ_ENABLE_WORKERS` (по умолчанию `true`, для масштабирования можно отключить на web-контейнерах).
• Payload: JSON-структуры, совместимые между системами.
• Retry механизм: 3 попытки с exponential backoff (10 секунд между ретраями).
• Graceful shutdown: все воркеры корректно завершаются при получении SIGTERM/SIGINT.

⸻

🚀 Рекомендации для миграции в будущем 1. Использовать pg вместо postgres (шире поддержка). 2. Стандартизировать БД (snake_case, auto-increment PK). 3. Пароли сразу хранить в Argon2id. 4. Контракты API поддерживать в OpenAPI. 5. Все миграции хранить в SQL (чтобы Laravel мог накатывать). 6. Сохранять единый подход к логам.

⸻

📋 Связанные документы
• `.docs/notifications.md` - Полная документация по системе уведомлений (архитектура, API, настройка, тестирование)
• `.docs/mentai_tz_product.md` - Общие требования к продукту
• `.docs/mentai_tz_frontend.md` - Требования к фронтенду
• `.docs/mentai_tz_backend.md` - Требования к бэкенду
• `.docs/meditation_page_redesign_tz.md` - ТЗ на редизайн страницы медитаций
• `.docs/security_requirements.md` - Требования к безопасности

⸻

Весь код должен работать на всех устройствах и браузерах, включая web, iOS и Android.

Для ассинхронных операций использовать async/await.

✅ Теперь этот architecture.md содержит и UI-правила, и описание фронтенда, и бэкенда, и секцию по безопасности, и дорожку на Laravel.
