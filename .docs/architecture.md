Архитектура проекта MentAI

📌 Общий обзор
• Фронтенд: Nuxt 4 + TypeScript + Pinia + TailwindCSS + shadcn-vue + vue-query.
• Бэкенд: Nitro (Node.js runtime) + Postgres + Drizzle ORM.
• Мобильность: Capacitor + Ionic (iOS/Android).
• Валидация и схемы: Zod (в связке с @vee-validate/zod).
• Логи и мониторинг: Pino + Sentry.
• Миграции БД: Drizzle Kit (SQL файлы хранятся для совместимости с будущими системами).

Система проектируется так, чтобы в будущем можно было безболезненно перенести бэкенд на Laravel (PHP), сохранив API-контракты и миграции.

🏗 Каркас приложения (Фронтенд)
• Layouts:
• default (со встроенным BottomNav),
• blank (fullscreen),
• auth (центрирование форм).
• Страницы:
index, onboarding, chat (layout blank), therapy, habits, profile/\*, billing.
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
• Аутентификация: JWT или PASETO v4.
• Шифрование данных: end-to-end для чатов, ключи разделяются (как в Telegram).
• Middleware:
• helmet (защита заголовков),
• rate-limit (DDOS),
• cors (ограничение доменов).

⸻

📑 Контракты API
• Валидация: Zod DTO.
• Документация: OpenAPI (zod-to-openapi).
• UI: Swagger / Scalar UI (@scalar/nuxt).
• SDK для фронта: генерируется из OpenAPI → фронтенд не зависит от конкретного бэкенда.

⸻

🔔 Настройки уведомлений
• Таблица `notification_preferences` хранит `active_days`, `time_range_start/end`, `custom_slot_times` и `entity_key` (унифицированное поле для идентификации сущности - привычки или темы терапии).
• `custom_slot_times` — массив длиной до 5 значений (в минутах, 0–1439). `null` означает автоматическое распределение и теперь безопасно передаётся/сохраняется как `null` без 400 от API.
• `entity_key` — единое поле для идентификации источника уведомлений. Для кастомных сущностей используется ID, для готовых шаблонов - ключ шаблона.
• API `/api/notifications/prefs` поддерживает CRUD этих полей, принимает `subtype = mixed` для привычек и отдаёт то же значение; на уровне БД обновлённое ограничение `notification_prefs_subtype_check` теперь тоже разрешает `mixed`.
• Фронт использует `WeekdaySelector`, `TimeRangeSelector`, а также кликабельные чипы под слайдером частоты для точного времени.
• Планировщик (`scheduler.service.ts`) при генерации слотов даёт приоритет кастомным временам, остальное распределяет равномерно внутри выбранного окна.
• UI (habits и therapy) отражает вручную заданные слоты: под слайдером частоты отображается интерактивный список слотов с тайм-пикерами; компонент TimePicker использует Radix ScrollArea без `overflow-hidden`, поэтому свайпы/прокрутка работают нативно, а кнопки синхронно центрируют выбранное значение.

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
• **Изоляция данных**: тексты с `userId IS NULL` больше не используются для пользовательских данных. Каждый пользователь работает только со своими текстами (`userId = userId`, `source='default'` или `source='user'`). Источником истины для дефолтных текстов является таблица `notification_text_presets` (read-only, только для разработчиков/админов). При первом обращении к текстам автоматически копируются из presets в персональные копии пользователя через сервис `initialize-texts.service.ts`. **Freeze-модель пресетов**: После первой инициализации новые пресеты не попадут к существующим пользователям автоматически (только через reset или миграции).
• Планировщик (`scheduler.service.ts`) загружает тексты из таблицы `notification_texts` по фильтрам (`kind`, `entityKey`, `directness`, `addressing`, `intent`, `subtype`). При `textSource === 'templates'` используются тексты из БД; при `textSource === 'ai'` или `'hybrid'` используются AI-генерированные тексты с чередованием.
• Пользовательские темы терапии:
• Таблица `therapy_topics_custom` + DTO (`Create/UpdateTherapyTopicDto`) + CRUD ручки `/api/therapy/custom/*` позволяют хранить названия/описания/emoji кастомной терапии с привязкой к userId.
• Pinia-store `useTherapyTopicsStore` синхронизирует список тем между страницами, а компоненты `NotificationIndexPage` и `CreateTherapyModal` добавляют CTA-карточку, модалку создания и кнопку удаления (с `ConfirmModal`).
• NotificationSettingsPage для режима therapy загружает кастомные темы по id, позволяет inline-редактирование названия/описания. Управление текстами уведомлений доступно через отдельную страницу `/notifications/therapy/[entityKey]/texts` (та же архитектура, что и для привычек).
• Тексты уведомлений хранятся в таблице `notification_texts`; планировщик обрабатывает терапию так же, как привычки: при `textSource === 'templates'` используются тексты из БД; при `textSource === 'ai'` или `'hybrid'` используются AI-генерированные тексты.
• Удаление кастомной темы через UI очищает локальный store и оставляет пользователя на списке (navigateTo `/therapy`), а отдельная кнопка корзины выровнена с arrow-иконкой в NotificationIndexPage, чтобы список для therapy/habits выглядел единообразно.

• HeyGen Streaming Avatar (BFF-прокси):
• Nitro-ручки: `server/api/heygen/session.post.ts` (streaming.new v2 → LiveKit url/token/session_id), `start.post.ts`, `stop.post.ts`, `speak.post.ts`, `close.post.ts` — фронт не видит приватный ключ.
• Конфиг (server-only): `runtimeConfig.heygenApiKey`, `heygenBaseUrl`, `heygenAvatarId` в `nuxt.config.ts`.
• Клиент: `useHeygenStore` создаёт сессию и подключается к LiveKit через `livekit-client`, треки крепятся в `HeyGenPlayer` к `video/audio` ref. LiveKit Room и DOM-узлы держим вне Pinia state (`markRaw` переменная), чтобы Vue devtools/SSR сериализация не падала на `constructor.name` внутри LiveKit.
• Безопасность: ключ хранится только на сервере; клиент использует `useAPI`/`$api` с относительными путями (автоматически используют текущий origin), токен/URL очищаются при stop/unmount.

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
• `.docs/security_requirements.md` - Требования к безопасности

⸻

Весь код должен работать на всех устройствах и браузерах, включая web, iOS и Android.

Для ассинхронных операций использовать async/await.

✅ Теперь этот architecture.md содержит и UI-правила, и описание фронтенда, и бэкенда, и секцию по безопасности, и дорожку на Laravel.
