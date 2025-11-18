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
• Таблица `notification_preferences` хранит `active_days`, `time_range_start/end` и `custom_slot_times`.
• `custom_slot_times` — массив длиной до 5 значений (в минутах, 0–1439). `null` означает автоматическое распределение и теперь безопасно передаётся/сохраняется как `null` без 400 от API.
• API `/api/notifications/prefs` поддерживает CRUD этих полей, принимает `subtype = mixed` для привычек и отдаёт то же значение; на уровне БД обновлённое ограничение `notification_prefs_subtype_check` теперь тоже разрешает `mixed`.
• Фронт использует `WeekdaySelector`, `TimeRangeSelector`, а также кликабельные чипы под слайдером частоты для точного времени.
• Планировщик (`scheduler.service.ts`) при генерации слотов даёт приоритет кастомным временам, остальное распределяет равномерно внутри выбранного окна.
• UI (habits и therapy) отражает вручную заданные слоты: под слайдером частоты отображается интерактивный список слотов с тайм-пикерами; компонент TimePicker использует Radix ScrollArea без `overflow-hidden`, поэтому свайпы/прокрутка работают нативно, а кнопки синхронно центрируют выбранное значение.

• Пользовательские привычки и тексты:
• На странице `/habits` теперь есть карточка CTA «Создать свою привычку», открывающая модалку с полями Название/Тип/Описание/Эмодзи и интегрированным store `useUserHabitsStore`.
• Пользовательские привычки (без `habitKey`) сохраняются через `/api/habits`, поддерживают opz. описание и emoji; список хранится в Pinia и объединяется с каталогом.
• В настройках пользовательской привычки скрыты блоки «Тип уведомления» и «Стиль подачи», вместо этого доступен новый блок «Тексты уведомлений» (до 100 текстов, каждый ≤ 178 символов, поддерживается плейсхолдер `{name}` и анимации при добавлении/удалении).
• Фронт (NotificationSettingsPage) и бэк (`/api/notifications/prefs/habits`) валидируют customTexts: trim, фильтр пустых значений, строгий лимит длины/количества, UI блокирует сохранение при ошибках.
• Планировщик (`scheduler.service.ts`) и тестовая отправка сначала проверяют `meta.customTexts`: если массив задан, текст берётся из него (равномерный случайный выбор) и попадает в слот с templateId `custom_user_text`; только при отсутствии пользовательских текстов происходит подбор шаблонов.
• Шаблоны с `type: 'custom'` удалены из `app/lib/notificationTemplates.ts`, чтобы не конфликтовать с новой пользовательской логикой.
• Пользовательские темы терапии:
• Таблица `therapy_topics_custom` + DTO (`Create/UpdateTherapyTopicDto`) + CRUD ручки `/api/therapy/custom/*` позволяют хранить названия/описания/emoji кастомной терапии с привязкой к userId.
• Pinia-store `useTherapyTopicsStore` синхронизирует список тем между страницами, а компоненты `NotificationIndexPage` и `CreateTherapyModal` добавляют CTA-карточку, модалку создания и кнопку удаления (с `ConfirmModal`).
• NotificationSettingsPage для режима therapy загружает кастомные темы по id, позволяет inline-редактирование названия/описания и включает блок пользовательских текстов с теми же ограничениями, что и для привычек.
• Сохранение настроек (`/api/notifications/prefs/therapy`) кладёт кастомные тексты в `meta.customTexts`; планировщик и тестовая отправка обрабатывают терапию так же, как привычки: при наличии кастомных текстов шаблоны не подбираются, а в слоты попадает текст пользователя и templateId `custom_user_text`.
• Удаление кастомной темы через UI очищает локальный store и оставляет пользователя на списке (navigateTo `/therapy`), а отдельная кнопка корзины выровнена с arrow-иконкой в NotificationIndexPage, чтобы список для therapy/habits выглядел единообразно.

• HeyGen Streaming Avatar (BFF-прокси):
• Серверные ручки (Nitro): `server/api/heygen/session.post.ts`, `server/api/heygen/speak.post.ts`, `server/api/heygen/close.post.ts`.
• Назначение: фронт не раскрывает ключ, Nitro проксирует запросы к HeyGen.
• Конфиг (server-only): `runtimeConfig.heygenApiKey`, `heygenBaseUrl`, `heygenAvatarId` в `nuxt.config.ts`.
• Клиент: компонент `app/components/HeyGenPlayer.vue` создаёт `RTCPeerConnection`, отправляет SDP-offer в `/api/heygen/session`, принимает SDP-answer и отображает видео; `speak` и `close` через BFF.
• Безопасность: ключ хранится только на сервере; клиент использует `useAPI`/`$api` с базовым `public.apiBase`.

⸻

📊 Логирование и мониторинг
• Node.js (Nitro): Pino + Sentry.
• Laravel (в будущем): Monolog + Sentry.
• Правила:
• request_id, user_id, service, env всегда в логах.
• структура логов совместима между Pino и Monolog.

⸻

🕒 Очереди и фоновые задачи
• Брокер: Redis.
• Node.js: BullMQ.
• Laravel: Horizon.
• Payload: JSON-структуры, совместимые между системами.

⸻

🚀 Рекомендации для миграции в будущем 1. Использовать pg вместо postgres (шире поддержка). 2. Стандартизировать БД (snake_case, auto-increment PK). 3. Пароли сразу хранить в Argon2id. 4. Контракты API поддерживать в OpenAPI. 5. Все миграции хранить в SQL (чтобы Laravel мог накатывать). 6. Сохранять единый подход к логам.

⸻

✅ Теперь этот architecture.md содержит и UI-правила, и описание фронтенда, и бэкенда, и секцию по безопасности, и дорожку на Laravel.
