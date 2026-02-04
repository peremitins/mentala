Архитектура проекта Mentala

📌 Общий обзор
• Фронтенд: Nuxt 4 + TypeScript + Pinia + TailwindCSS + shadcn-vue + vue-query.
• Бэкенд: Nitro (Node.js runtime) + Postgres + Drizzle ORM.
• Мобильность: Capacitor + Ionic (iOS/Android).
• Валидация и схемы: Zod (в связке с @vee-validate/zod).
• Логи и мониторинг: Pino + Sentry.
• Миграции БД: Drizzle Kit (SQL файлы хранятся для совместимости с будущими системами).
• Процесс миграций: запуск только через скрипты `db:migrate` и `db:baseline` с обязательным `--env=development|production`; для production требуется подтверждение `MIGRATE_PROD_CONFIRM=YES`. Env‑файл выбирается явно (dev: `.env.development`, local prod: `.env.production`, server prod: `.env`), автоматическое подмешивание `.env` запрещено, в env фиксируется `MENTALA_DB_ENV`. Для защиты от гонок используется PostgreSQL advisory lock. В CI миграции проверяются на тестовой БД при PR и push в main (apply + повторный запуск без ошибок), production‑секреты в PR недоступны.
• Медитации v1: медиа в Object Storage + CDN `media.mentala.app`, в БД — относительные пути `/meditations/*`, на фронте URL строятся через `NUXT_PUBLIC_MEDIA_BASE_URL` (public), `public/meditations/*` в проде не используется; кнопка Play показывает лоадер при буферизации аудио (сервисная таблица в БД — источник метаданных, для плеера используем `backgroundPath`; секции каталога: Избранное, Сон, Стресс, Тревога, Фокус, Самооценка, Эмоции, Поддержка).

Система проектируется так, чтобы в будущем можно было безболезненно перенести бэкенд на Laravel (PHP), сохранив API-контракты и миграции.

🏗 Каркас приложения (Фронтенд)
• Layouts:
• default (со встроенным BottomNav),
• blank (fullscreen),
• auth (центрирование форм; при входе на auth экран фоновые звуки и медитации принудительно выключаются).
• Глобальная защита аудио: `app/plugins/audio-playback-guard.client.ts` отслеживает auth/роуты и через `setPlaybackAllowed` в `useSceneAudio` и `useMeditationPlayer` блокирует любой звук на публичных страницах и при разлогине.
• UI‑настройки: `useUiSettingsStore` хранит локальные параметры интерфейса (яркость фона) в `persistentStorage` (web: localStorage, mobile: Capacitor Preferences). Яркость применяется к aurora‑слою и к затемнению фоновых изображений сцен (overlay).
• Тема интерфейса: приложение использует только тёмную тему (dark theme) по умолчанию. Переключение между светлой и тёмной темой не поддерживается. Все CSS-переменные настроены на тёмную палитру в `:root`, класс `.dark` не используется. PWA manifest (`site.webmanifest`) и favicon настроены на тёмные цвета.
• Страницы:
index, onboarding, chat (layout blank), therapy, habits, practices, breath-practices, profile/\*, settings, privacy, subscription, billing.
• Настройки (IA v2):
• `/settings` — главный список (профиль, подписка, ассистент, приватность, приложение, служебное).
• `/settings/profile` — редактирование профиля и безопасности (имя, пол, email, пароль, подтверждение).
• `/settings/assistant` — тон/обращение.
• `/settings/language` — выбор языка/локали (RU/EN).
• `/privacy` — память и данные, ссылка на политику.
• Юридические документы: статические HTML в `public/legal/` (`terms-of-service.html`, `privacy-policy.html`), ссылки используются в auth/settings/privacy.
• Согласия с документами: в `users` храним `termsAcceptedAt`, `privacyAcceptedAt`, версии и источник принятия; маркетинговое согласие хранится отдельно (`marketingConsentAt`).
• В настройках: переключатель «Маркетинговые сообщения» пишет согласие через `PATCH /api/user/me`.
• ID пользователя показывается внизу `/settings` с копированием (useClipboard/Capacitor Clipboard с fallback).
• Чат: welcome‑ответ стартует при пустом `messages`, параметр `mode` удалён; `entryContext` приходит из разделов `/habits` и `/therapy` и учитывается в prompt.
• Чат: suggested‑chips не сбрасываются при наборе текста, очищаются только при отправке/выборе.
• Чат: микрофон в инпуте имеет индикацию записи через ::before/::after (пульсирующая точка), отправка на мобильных срабатывает на первый тап через pointerdown‑хэндлер даже во время записи.
• Голосовой ввод: Whisper‑fallback временно отключён, используются только native/webspeech движки.
• Чат: кнопки действий (микрофон/отправка) оформлены как отдельные «приподнятые» элементы с градиентом и мягкой тенью для лучшей читаемости.
• Практики:
• Хаб `/practices` объединяет дыхательные практики и медитации.
• Дыхательные практики: страницы `/breath-practices` и `/breath-practices/:slug`, каталог в `app/lib/breathPracticesCatalog.ts`.
• Контекст группы дыхательных практик передаётся через query `group` на `/breath-practices/:slug`; в плеере доступны кнопки «Назад/Вперёд» для перелистывания практик внутри выбранной группы (built-in: anxiety/sleep/focus/popular, custom: custom).
• Кастомные практики и настройки хранятся в `app/stores/breathPractices.ts` через `app/utils/persistentStorage.ts` (web: localStorage, mobile: Capacitor Preferences).
• Тренажёр использует `app/composables/useBreathPracticePlayer.ts` (тайминг фаз, отсчёт; при уходе в фон не ставим паузу).
• Звуки фаз лежат в `public/breath/sounds/`: `inhale.m4a`, `exhale.m4a`, `wait.m4a` (задержка), `pause.m4a` (пауза).
• Howler для дыхательных cue инициализируется заранее (prepare при монтировании/включении), чтобы мобильный auto‑unlock срабатывал на первом тапе; при `playerror` идёт повтор после `unlock`. Сигнал играет полностью, но при старте следующей фазы плавно кроссфейдится (~200 мс). При паузе/стопе звук быстро затухает через fade (~120 мс). Изменение громкости применяется к активному звуку, плюс есть небольшой volume‑boost для тихих файлов.
• Ограничение кастомных фаз: 1–30 секунд, 2–4 фазы.
• Длительность сессии выбирается через `TimePicker` в режиме минут (1–60 минут) в настройках практики; поповер портируется в контейнер диалога, чтобы не ломать скролл.
• Медитации:
• Страницы `/meditations` (каталог + детальный плеер через query `trackId`), `/meditations/:id` — только редирект в query.
• Карточки тем терапии/привычек показывают быстрые действия (чат/медитация/дыхание), маппинги и скрытия кнопок описаны в `app/lib/meditations.ts` и `app/lib/practiceActions.ts`.
• Заголовок детального плеера использует контекст секции (`queueKey` или query `topic`), чтобы для мульти-треков показывать правильную тему.
• Состояния: компонент StateBlock отображает idle/loading/empty/error.
• Скелетоны: в `Skeleton.vue` есть общий тип `practice-page` для медитаций и дыхательных практик.
• Сторы Pinia:
• ui
• user
• chat
• DTO (Zod): shared/dto/index.ts.
• shadcn-nuxt auto-import опирается на `index.ts` в директориях компонентов `app/components/ui/shadcn/*` (реэкспорт), поэтому все компоненты имеют index-файлы.

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

• ORM: Drizzle ORM
• chat_settings хранит только UI/память (без mode), welcome_prompts содержит тексты по признаку первой сессии и языку.
• преимущества: типобезопасность, простые миграции, готовые SQL.
• легко заменить на Eloquent (Laravel) при необходимости.
• Пул Postgres: keepAlive + idle/connection timeouts + maxLifetimeSeconds; при ошибках соединения фоновые задачи пересоздают пул через `resetDbPool`, чтобы воркеры восстанавливались после рестарта БД.
• AI Relay (проектирование): внутренний стрим — **дельты текста**, SSE формируется в `server/api/chat/stream.post.ts`; выбран вариант 1 — Relay проксирует raw SSE OpenAI, а `relayClient` парсит и возвращает дельты; `relayClient` отвечает за подпись HMAC, парсинг SSE и сохранение `response_id` для `previous_response_id`; Relay по умолчанию не удаляет summary/entryContext (качество), расширенные логи промптов допустимы только локально в dev (в проде — без контента/только хэш). Org/project должны учитываться в non‑stream и stream (или на стороне Relay при включённом Relay). Клиентский флаг `CHAT_STREAM_MODE` сохраняет текущее поведение (/api/chat/stream vs /api/chat).
• Память чата (LLM): единственный механизм — `previous_response_id` (Responses API) + `truncation: auto`; summary‑память отключена, история сообщений в запрос не передаётся; управление памятью — только через UI.

🧪 Инициализация БД (seed)
• Для пустой базы используется общий скрипт `pnpm seed:required` (см. `scripts/seed-required.ts`).
• Скрипт последовательно заполняет системные справочники: роли, тарифные планы, каталог медитаций и дефолтные тексты уведомлений.
• Перенос шаблонов уведомлений запускается через `scripts/migrate-templates-to-db.ts` и очищает таблицы пресетов/текстов — безопасно только на пустой БД. При необходимости можно пропустить через флаг `--skip-templates`.
• Production-миграции теперь включают `0026_roles_baseline.sql`, который гарантирует наличие базовых записей (`admin`, `user`, `moderator`, `support`) ещё до запуска `seed:required`, поэтому FK `users.role_id` никогда не будет нарушен даже без предварительного заполнения. Дополнительно, наличие `roles` теперь проверяется перед созданием пользователя: если нужной роли нет, она создаётся как часть миграции/seed-а, что позволяет выполнять регистрацию на «cold» базе.
• После выполнения `pnpm db:migrate` обязательно запускается новая проверка `pnpm verify:schema -- --env=<...>` (или `NODE_ENV=production`), которая сравнивает колонки `information_schema` с теми, что описаны в `server/infrastructure/db/schema.ts`. Скрипт падает (и CI/развёртывание останавливается), если хотя бы одна колонка отсутствует, что делает невозможными случаи типа «column deletion_requested_at does not exist».
• Для prod окружения используйте `--env=production` или `NODE_ENV=production`, чтобы подтянуть `.env`.

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
• Email‑верификация: коды в Redis (`auth:email_verification:*`), hash `sha256(code+secret)`, TTL 15 минут, 5 попыток; для регистрации (`/api/auth/email/register`) rate limit по IP/устройству (UA‑hash) — 15/час, без email, чтобы не раскрывать наличие аккаунта.
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
• Плеер мини/детальной страницы: кнопки «Назад/Вперёд» для треков, при переключении активного трека во время воспроизведения автоплей не прерывается (следующий/предыдущий трек стартует сразу); для `isLoop` треков используется Web Audio API (AudioBufferSourceNode + loopStart/loopEnd) для бесшовного лупа без пауз, с fallback на HTMLAudio при недоступности/ошибке Web Audio. Фон детальной медитации подтягивается из `backgroundPath` на уровне layout `default.vue`, тянется на весь экран, выше aurora-слоя и без затемнения. Для одной медитации поддерживается несколько тем через массив `topicKeys`, поэтому трек может появляться в нескольких секциях, но в «Все» остаётся один раз. Контекст очереди (список треков текущей секции) сохраняется при открытии трека, поэтому перемотка вперёд/назад идёт по выбранной секции (например «Все» или конкретная тема).
• Контроль конкурентных запусков: `useMeditationPlayer` использует глобальный `playbackActionId`, чтобы отменять устаревшие `play/pause/stop` и гарантировать единственный активный трек.
• При смене трека применяется короткий fade (~80 мс) даже без основного fade, чтобы избежать щелчков на мобильных динамиках.
• Автоплей при быстром переключении треков учитывает `isBuffering`, чтобы серия нажатий «вперёд/назад» не оставляла плеер на паузе.
• Детальная страница трека автозапускает воспроизведение при входе; повтор трека включён по умолчанию; для `isLoop` треков прогрессбар скрыт.
• Автоплей на мобильных: если браузер блокирует `audio.play()` без жеста, плеер снимает лоадер и ставит запуск в очередь до первого пользовательского взаимодействия (gestures).
• Для `isLoop` треков при заблокированном WebAudio плеер ждёт жест и не переключается на HTML‑луп, чтобы сохранить бесшовность.
• Для `isLoop` треков fallback на HTML‑плеер отключён: если WebAudio недоступен/не готов, трек не стартует, чтобы не создавать слышимый шов.
• Аудиофайлы медитаций версионируются по content‑hash в имени (`*.{hash}.m4a`), поэтому CDN кэшируется бессрочно; карта переименований хранится в `scripts/meditation-audio-map.json`, обновление БД выполняется через `server/infrastructure/db/update-meditation-audio-paths.ts`.
• Картинки медитаций (covers/backgrounds) версионируются по content‑hash в имени (`*.{hash}.webp`), портретные варианты используют тот же hash (`*-portrait`/`portrait-*`), карта переименований хранится в `scripts/meditation-image-map.json`, обновление БД — `server/infrastructure/db/update-meditation-image-paths.ts`.
• Проверка хэш‑имен медиа доступна через `pnpm media:check` и используется в CI, чтобы не пропускать нехэшированные `.m4a`/картинки.
• Обслуживание Object Storage: `scripts/upload-media-safe.sh` запускает `scripts/cleanup-incomplete-uploads.sh --yes --bucket mentala --endpoint https://storage.yandexcloud.net`, который проверяет зависимости (`aws`, `jq`), обходит пагинацию, выводит список всех незавершённых multipart uploads и, при необходимости, подгружает ключи из `.env.local` / `.env.development`. Можно вручную вызвать `pnpm cleanup:incomplete-uploads -- --env-file .env.development --yes`. Хэшированные картинки медитаций и уведомлений публикуются с `aws s3 sync ... --delete`, поэтому старые версии автоматически удаляются, а `notification-images.service.ts` опирается на `server/application/notifications/notification-image-map.json`, построенный `scripts/hash-notification-images.mjs`, чтобы отдавать клиенту свежие пути.
• WebAudio в медитациях также требует жеста: `useMeditationPlayer` заранее вешает global gesture‑unlock и делает `AudioContext.resume()` только после него, чтобы автозапуск после переходов срабатывал стабильнее.
• При перелистывании треков в состоянии паузы автозапуск не выполняется; текущий плеер сбрасывается, чтобы исключить случайный старт.
• Длительность в UI медитаций (карточки/списки/деталка) форматируется через `date-fns-tz` в `mm:ss` (UTC), чтобы секунды отображались стабильно.
• Таймер на детальной странице управляется через TimePicker (режим минут): выбор `00:00` отключает таймер и показывает текст «Без таймера».
• Выбранное значение таймера хранится в состоянии плеера (`preferredTimerMinutes`), чтобы сохраняться при смене треков/роутов.
• Фон детальной медитации рисуется на уровне layout `default.vue` и анимируется CSS‑панорамой всегда (fallback на `prefers-reduced-motion`).
• Размытие нижней панели навигации применяется только на странице плеера медитаций (`/meditations?trackId=...`).
• Мини‑плеер медитаций остаётся видимым при паузе (закрытие только через крестик); для `isLoop` треков прогрессбар скрыт.
• Горизонтальные отступы мини‑плеера выравниваются с `BottomNav` через `inset-x-0` + `px-2` (совпадает с паддингом layout).
• Фоновая сцена приложения (Scene Selection):
• Страница `/scene-selection` позволяет выбрать фон и фоновый трек для всего приложения (кроме детальной медитации).
• Список сцен фиксирован в `app/lib/sceneSelectionCatalog.ts` (на основе seed медитаций).
• Дефолтная сцена — «Горный ручей» (обои включены сразу).
• Настройки возвращаются в `/api/user/me` как `sceneSettings` и сохраняются через `/api/user/me` (PATCH).
• Дополнительный флаг `sceneSettings.animateBackground` управляет анимацией обоев.
• Pinia-store `useSceneSettingsStore` отвечает за локальное состояние и дебаунс‑сохранение.
• Сохранение настроек сцены отменяет предыдущий `PATCH /api/user/me` через `AbortController`, чтобы не было откатов при быстром переключении.
• Дополнительно фиксируется версия локальных изменений (changeVersion), чтобы устаревшие ответы не могли откатить выбранную сцену даже до старта следующего запроса.
• `useSceneAudio` управляет воспроизведением, fade‑in/out и таймером выключения при уходе в фон; при уходе в фон звук продолжается только если задан `backgroundPlayMinutes` (иначе останавливается), при возвращении в foreground пытается восстановиться (visibilitychange/AppState). На мобильных WebAudio отключается в пользу HTMLAudio, а таймаут старта в HTML увеличен для медленных сетей.
• Для надёжности при быстрых переключениях сцен применяется защита от гонок: устаревшие play‑операции игнорируются по actionId, а ответы сохранения настроек не перезаписывают последние изменения.
• В layout `default.vue` фон сцены отображается на всех страницах, кроме `/meditations?trackId=...`; при входе в медитацию фоновые звуки приложения приглушаются и возобновляются после выхода. Панорама фона упрощена до одного слоя с диагональным движением, увеличенной длительностью и меньшим масштабом для снижения нагрузки.
• Во время выхода из аккаунта выставляется `auth.isLoggingOut`: layout `default.vue` не запускает `useSceneAudio`, а logout‑запрос отправляется в фоне, чтобы UI не зависал и фон не стартовал заново.
• Автозапуск фоновой сцены учитывает autoplay‑политику браузеров: `useSceneAudio` заранее слушает пользовательский жест и делает `AudioContext.resume()` только после него, чтобы звук мог стартовать сразу после логина.

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
• В `notification_preferences` есть вычисляемое поле `text_source_normalized`, которое нормализует `meta.textSource` в `templates/ai` (любое значение кроме `ai` трактуется как `templates`).
• `notification_preferences.custom_prompt_notification` хранит персональные пожелания **только для шаблонных тем** (nullable). Поле используется **только для AI** и включается в `configHash`, чтобы при изменении автоматически запускалась регенерация. В промпте при конфликте с `subtype/directness/tone` приоритет за пожеланиями пользователя.
• Для **кастомных** тем приоритет задан для описания пользователя: если описание противоречит `subtype/directness/tone`, приоритет за описанием.
• `custom_slot_times` — массив длиной до 5 значений (в минутах, 0–1439). `null` означает автоматическое распределение и теперь безопасно передаётся/сохраняется как `null` без 400 от API.
• `entity_key` — единое поле для идентификации источника уведомлений. Для кастомных сущностей используется ID, для готовых шаблонов - ключ шаблона.
• API `/api/notifications/prefs` поддерживает CRUD этих полей, принимает `subtype = mixed` для привычек и отдаёт то же значение; на уровне БД обновлённое ограничение `notification_prefs_subtype_check` теперь тоже разрешает `mixed`.
• Фронт использует `WeekdaySelector`, `TimeRangeSelector`, а также кликабельные чипы под слайдером частоты для точного времени.
• Планировщик (`scheduler.service.ts`) при генерации слотов даёт приоритет кастомным временам, остальное распределяет равномерно внутри выбранного окна.
• Глобальная оркестрация слотов описана в `.docs/NOTIFICATION_SCHEDULING_ORCHESTRATION.md`: учитывается `sent/queued/planned` в текущем дне, допускается перевес групп, фиксированные времена не сдвигаются.
• При изменении настроек уведомлений регенерация использует флаг `forceTodaySlots`: если до конца окна достаточно времени, гарантируется минимум 1 слот сегодня (и полное заполнение при раннем включении).
• Logout отключает уведомления **только на текущем устройстве**: токен удаляется через `/api/notifications/unregister-token` (таблица `user_devices`).
• При логине токен устройства повторно регистрируется (если есть) и в фоне проверяется наличие активных слотов: если нужно регенерировать или активные настройки есть, но слотов нет — запускается `generateAllSlotsForUser`.
• AI‑генерация текстов уведомлений выполняется через очередь BullMQ `ai-text-generation` с debounce‑dedup (`id = ai-gen-{preferenceId}`, TTL≈20с) и лимитом на пользователя (не больше 3 активных задач одновременно). При ошибках AI слоты **не** создаются, задача ретраится с backoff; после успешной генерации выполняется глобальная регенерация слотов. При повторных сбоях объём генерации снижается (50 → 25 → 12), чтобы не срывать процесс.
• При изменении глобальных настроек (`tone`, `addressing`) через `/api/settings/preferences` ставится регенерация AI‑пулов для всех `ai` preferences пользователя (через ту же очередь).
• Шаблонные тексты из `notificationTemplates` по умолчанию без изображений (`imageTag = null`), но могут иметь явный `imageTag`.
• В native (Capacitor) регистрация push‑токена всегда идёт через `$api` и `NUXT_PUBLIC_API_SERVER_URL`, чтобы запросы не уходили на `capacitor://localhost` и `user_devices` корректно заполнялась.
• Доставка слотов: если planned-слот опоздал больше чем на 10 минут, он не отправляется, помечается как `skipped` и считается выполненным для дневной квоты.
• UI (habits и therapy) отражает вручную заданные слоты: под слайдером частоты отображается интерактивный список слотов с тайм-пикерами; компонент TimePicker использует Radix ScrollArea без `overflow-hidden`, поэтому свайпы/прокрутка работают нативно, а кнопки синхронно центрируют выбранное значение.
• NotificationSettingsPage визуально сгруппирован в `glass-deep` карточки с внутренними подложками, чтобы текст читался на фоне обоев и сохранялась иерархия блоков.
• NotificationSettingsPage показывает блок «Мои пожелания» для **шаблонных** тем (не для кастомных). Пожелания сохраняются в `custom_prompt_notification` и влияют на AI-генерацию.
• Изображения уведомлений: подбираются по `kind/entityKey` из `public/notifications/*` **без гендерных подкаталогов** (только нейтральные наборы). Порядок: сущностные (`/notifications/habits/{entityKey}/{imageTag}/`), затем общие (`/notifications/common/{imageTag}/`). Для therapy допускаются сущностные папки (`/notifications/therapy/{entityKey}/{imageTag}/` и вложенные `/notifications/therapy/{entityKey}/**/{imageTag}/`); если есть верхний уровень и вложенные — они миксуются между собой и с common. Для кастомных сущностей (`entityKey = null`) разрешены только нейтральные теги (`activity/nature/meditation/daily_life/neutral_abstract`), `harm_*` запрещены. Legacy‑пулы (старый формат без `imageTag/subtype`) используют только safe‑only fallback `nature` → `neutral_abstract`, `harm_*` запрещены. `harm_*` допускаются в common только как универсальные медицинские визуалы без предметных контекстов, сущностные `harm_*` остаются в habits. Ротация изображений должна быть устойчивой и бесконечной: минимизировать повторы и сохранять позицию между перегенерациями текстов и изменениями настроек. URL строится от `NUXT_PUBLIC_MEDIA_BASE_URL` (fallback: `PUBLIC_APP_ORIGIN`/`NUXT_PUBLIC_APP_URL`). Нормализация файлов выполняется скриптом, который переносит `male/female` в нейтральные каталоги и затем синхронизирует Yandex Object Storage с `--delete`.
• Для **шаблонов** картинки выключены по умолчанию (`imageTag = null`), но их можно включить точечно, задав `imageTag` в шаблоне.
• Если для выбранного `imageTag` нет файлов ни в сущности, ни в common (AI‑источник), используется safe‑fallback в порядке `nature → daily_life → activity → meditation → neutral_abstract`. Для привычки `meditation` допускается только `meditation`. Для привычки `water` в промпте задано требование `imageTag = neutral_abstract`.
• Android push: канал `mentai_high` создаётся нативно в `MainApplication` и задан как `default_notification_channel_id` в манифесте; fallback канал `fcm_fallback_notification_channel` удаляется, чтобы все уведомления были в одном разделе. Для FCM используется `tag = slotId`, чтобы Android не перезаписывал уведомления внутри группы.

• Режимы генерации текстов (`textSource`):
• `templates` — использование готовых шаблонов или пользовательских текстов (для кастомных привычек/терапии)
• `ai` — Способ создания с помощью AI (OpenAI GPT) - запрашивается **до 50** текстов, сохраняется любой непустой результат (AI Buffer Pool модель)

• AI Buffer Pool для уведомлений:
• Запрашивается **до 50** текстов при создании/изменении настроек; сохраняется любой **непустой** результат (недобор допустим)
• Тексты хранятся в `ai_generated_notification_texts` и используются постепенно
• Отслеживание отправленных текстов через таблицу `ai_notification_text_usage`
• Автоматическое пополнение при приближении к концу (менее 2 дней запаса)
• Динамический расчет токенов: `count * 180 + 1200` с **верхним cap** `AI_NOTIFICATIONS_MAX_OUTPUT_TOKENS` (по умолчанию 12000)
• Refill использует **advisory lock** (Postgres), чтобы не сжигать токены при параллельных воркерах; частичный результат (если не пустой) сохраняется
• При refill новые тексты дедуплицируются по `hashNotificationText`, в пул добавляются только уникальные
• Retry механизм с exponential backoff для ошибок провайдера; **недобор** не ретраится

• **Временная блокировка OpenAI**: все вызовы провайдера OpenAI (чат/стрим/summary/уведомления) отключены на уровне `openai.ts` и возвращают 503 до снятия блокировки (`OPENAI_REQUESTS_DISABLED`).

• Пользовательские привычки и тексты:
• На странице `/habits` теперь есть карточка CTA «Создать свою привычку», открывающая модалку с полями Название/Тип/Описание/Эмодзи и интегрированным store `useUserHabitsStore`.
• Пользовательские привычки (без `habitKey`) сохраняются через `/api/habits`, поддерживают opz. описание и emoji; список хранится в Pinia и объединяется с каталогом.
• **Архитектура текстов уведомлений с изоляцией данных пользователей**: все тексты (дефолтные и пользовательские) хранятся в таблице `notification_texts` в БД. Каждый пользователь имеет свои персональные копии дефолтных текстов (lazy initialization при первом обращении). Управление текстами доступно через отдельную страницу `/notifications/[kind]/[entityKey]/texts` с полноценным редактором (`NotificationTextsEditorPage`).
• `notification_texts` и `notification_text_presets` содержат `image_tag` (nullable). Если `image_tag = null`, изображение не прикрепляется. Нормализация приводит тексты к единому формату `NotificationItem` и очищает некорректные теги.
• Форматирование уведомлений учитывает `gender`: варианты вида `сделал(а)` заменяются на корректную форму, скобочные варианты не попадают в итоговый текст.
• **Изоляция данных**: тексты с `userId IS NULL` больше не используются для пользовательских данных. Каждый пользователь работает только со своими текстами (`userId = userId`, `source='default'` или `source='user'`). Источником истины для дефолтных текстов является таблица `notification_text_presets` (read-only, только для разработчиков/админов). При первом обращении к текстам автоматически копируются из presets в персональные копии пользователя через сервис `initialize-texts.service.ts`. **Freeze-модель пресетов**: После первой инициализации новые пресеты не попадут к существующим пользователям автоматически (только через reset или миграции).
• Планировщик (`scheduler.service.ts`) загружает тексты из таблицы `notification_texts` по фильтрам (`kind`, `entityKey`, `directness`, `addressing`, `intent`, `subtype`). При `textSource === 'templates'` используются тексты из БД; при `textSource === 'ai'` используются AI-генерированные тексты.
• Пользовательские темы терапии:
• Таблица `therapy_topics_custom` + DTO (`Create/UpdateTherapyTopicDto`) + CRUD ручки `/api/therapy/custom/*` позволяют хранить названия/описания/emoji кастомной терапии с привязкой к userId.
• Pinia-store `useTherapyTopicsStore` синхронизирует список тем между страницами, а компоненты `NotificationIndexPage` и `CreateTherapyModal` добавляют CTA-карточку, модалку создания и кнопку удаления (с `ConfirmModal`).
• NotificationSettingsPage для режима therapy загружает кастомные темы по id, позволяет inline-редактирование названия/описания. Управление текстами уведомлений доступно через отдельную страницу `/notifications/therapy/[entityKey]/texts` (та же архитектура, что и для привычек).
• Тексты уведомлений хранятся в таблице `notification_texts`; планировщик обрабатывает терапию так же, как привычки: при `textSource === 'templates'` используются тексты из БД; при `textSource === 'ai'` используются AI-генерированные тексты.
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
• Клиентский SSE‑парсер буферизует чанки и разбивает по пустой строке, чтобы не терять события при разрезании данных по сети.
• Relay‑клиентский SSE‑парсер использует TextDecoder для корректной UTF‑8‑декодировки через границы чанков (иначе возможны пропуски дельт на кириллице).
• Suggested replies: при разборе ответа нормализуем `null` в полях `action/params`, чтобы Zod‑валидация не отбрасывала валидные чипы.
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
