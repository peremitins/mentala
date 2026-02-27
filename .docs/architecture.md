Архитектура проекта Mentala

📌 Общий обзор
• Фронтенд: Nuxt 4 + TypeScript + Pinia + TailwindCSS + shadcn-vue + vue-query.
• Бэкенд: Nitro (Node.js runtime) + Postgres + Drizzle ORM.
• Мобильность: Capacitor + Ionic (iOS/Android).
• Safe-area на mobile: для iOS в layout (`default/auth/blank`) применяется только верхний safe-area (`safe-area-inset-top`) через класс `ios-safe-layout`; нижняя часть интерфейса (BottomNav/контент) не получает дополнительных iOS-отступов, чтобы сохранять прежнюю высоту и визуальный ритм.
• iOS‑гайд и паритет с Android: см. `.docs/IOS_SETUP.md` (dev/prod, push, Apple Developer Program, FCM/APNs особенности).
• iOS bundle id: `com.mentala.app` (prod) и `com.mentala.app.dev` (dev), отдельные схемы в Xcode.
• Совместимость CocoaPods/Xcode: в `ios/App/App.xcodeproj/project.pbxproj` должен быть `objectVersion = 77` (не `70`), иначе `pod install` падает на CocoaPods 1.16.2 с ошибкой `[Xcodeproj] Unable to find compatibility version string for object version 70`; скрипт `scripts/setup-capacitor-dev.sh` автоматически нормализует `70 -> 77` перед `cap sync`.
• iOS Audio Session: в `ios/App/App/AppDelegate.swift` принудительно активируется `AVAudioSession` с категорией `.playback` (при launch и `applicationDidBecomeActive`) для стабильного звучания WebAudio loop-треков на реальных iPhone, включая сценарий с hardware silent switch.
• iOS background audio: в `ios/App/App/Info.plist` для `UIBackgroundModes` включён `audio` (вместе с `remote-notification`), чтобы медитация продолжала воспроизведение при блокировке экрана/сворачивании приложения.
• Визуальный стеклянный слой (`.glass-deep`, `.glass-deep-bottom`) использует progressive enhancement: базовый плотный fallback (без `color-mix`) для старых iOS/WebView, затем `-webkit-backdrop-filter`/`backdrop-filter`, и только при поддержке `color-mix(in oklab, ...)` применяются целевые стили.
• API-клиент в `app/plugins/api.ts` использует единую кроссплатформенную стратегию `baseURL`: на web берётся `NUXT_PUBLIC_API_SERVER_URL`; на native в dev сохраняется поведение с `window.location.origin`, но для iOS есть защита от custom scheme (`capacitor://...`) и fallback на `NUXT_PUBLIC_API_SERVER_URL` (иначе запросы уходят не на backend).
• Резолв медиа (`app/utils/media.ts`): в `dev` приоритет у `window.location.origin` (если это `http/https` и отличается от `apiBase`) — это выравнивает поведение с native `server.url` в Capacitor на iOS/Android; далее fallback на `apiBase` и `mediaBaseUrl`. В `production` приоритет остаётся у `NUXT_PUBLIC_MEDIA_BASE_URL`.
• Ошибки API на native логируются в `app/plugins/api.ts` с контекстом (`url`, `status`, `statusText`, `message`, `responseData`) для диагностики проблем сети/доступности backend.
• Глобальный auth middleware (`app/middleware/auth.global.ts`) держит fail-fast стратегию в компактном виде: helper для public routes, gate по native session token (`mentai.session.token`) и единый `auth.me()` с timeout (`AUTH_ME_TIMEOUT_MS`) для избежания зависаний на мобильных сетевых сбоях.
• Глобальный feature-access middleware (`app/middleware/feature-access.global.ts`) выполняет тарифный gate на уровне роутера: закрывает прямой доступ к `meditations`, lock-маршрутам `breath-practices/:slug` (кроме free slugs), а также к custom-маршрутам `habits/:id` и `therapy/:key` (если ключ не из каталога и нет premium entitlement). При отсутствии доступа делает `navigateTo('/', { replace: true })`.
• Google OAuth на native: `@capgo/capacitor-social-login` использует `google.webClientId` (env `NUXT_OAUTH_GOOGLE_CLIENT_ID`) на Android/Web и `google.iOSClientId` (env `NUXT_PUBLIC_GOOGLE_IOS_CLIENT_ID`) на iOS. Без iOS client id initialize на iOS возвращает `No provider was initialized`. В `AppDelegate` обязательно обрабатываем callback через `GIDSignIn.sharedInstance.handle(url)`. Backend `/api/auth/google/native` валидирует `idToken` по аудиториям `web + iOS`.
• Для `nuxt generate` фоновые notification/BullMQ воркеры не запускаются (guards в `server/plugins/notifications-worker.ts` и `server/plugins/bullmq-workers.ts`), чтобы static-сборка не зависала на Redis и `cap sync` всегда получал свежие web assets.
• Дополнительно для static-сборки отключены фоновые cleanup-плагины (`server/plugins/auth-cleanup.ts`, `server/plugins/trial-usage-cleanup.ts`), а Redis-клиент BullMQ работает в `lazyConnect` режиме, чтобы `generate` не блокировался фоновыми коннектами.
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
• Если `play()` вызывается раньше, чем guard перевёл `playbackAllowed` в `true` (типичный холодный старт после push), запуск не теряется: `useMeditationPlayer` и `useSceneAudio` сохраняют pending-start и автоматически повторяют его после `setPlaybackAllowed(true)`.
• UI‑настройки: `useUiSettingsStore` хранит локальные параметры интерфейса (яркость фона) в `persistentStorage` (web: localStorage, mobile: Capacitor Preferences) с ключом, привязанным к `userId` (чтобы разные аккаунты не наследовали яркость). Яркость применяется к aurora‑слою и к затемнению фоновых изображений сцен (overlay). Дефолтная яркость — 85%.
• Тема интерфейса: приложение использует только тёмную тему (dark theme) по умолчанию. Переключение между светлой и тёмной темой не поддерживается. Все CSS-переменные настроены на тёмную палитру в `:root`, класс `.dark` не используется. PWA manifest (`site.webmanifest`) и favicon настроены на тёмные цвета.
• Страницы:
index, onboarding, chat (layout blank), therapy, habits, practices, breath-practices, sos, profile/\*, settings, privacy, subscription, billing.
• Настройки (IA v2):
• `/settings` — главный список (профиль, подписка, ассистент, уведомления, конфиденциальность, приложение, служебное).
• `/settings/profile` — редактирование профиля и безопасности (имя, пол, email, пароль, подтверждение).
• `/settings/assistant` — тон/обращение.
• `/settings/language` — выбор языка/локали (RU/EN).
• `/privacy` — память и данные, ссылка на политику.
• Блок «Уведомления» (после «Настройки ассистента», перед «Конфиденциальность»): Push-уведомления (переключатель, только native) и «Маркетинговые сообщения» (переключатель); логика Push — `usePushSettings`, открытие системных настроек — `capacitor-native-settings`.
• Блок «Конфиденциальность»: только «Память и данные»; «Маркетинговые сообщения» перенесён в «Уведомления».
• Юридические документы: статические HTML в `public/legal/` (`terms-of-service.html`, `privacy-policy.html`), ссылки используются в auth/settings/privacy.
• Согласия с документами: в `users` храним `termsAcceptedAt`, `privacyAcceptedAt`, версии и источник принятия; маркетинговое согласие хранится отдельно (`marketingConsentAt`).
• В блоке «Уведомления»: переключатель «Маркетинговые сообщения» пишет согласие через `PATCH /api/user/me`; Push-переключатель отражает системный статус разрешений, при выключении — unregister токена через `/api/notifications/unregister-token`, при системном запрете — модалка с «Открыть настройки» (`capacitor-native-settings`).
• **Push: три уровня синхронизации** — (1) системное разрешение Android/iOS, (2) серверный флаг `pushNotificationsEnabled`, (3) локальный UI (переключатель). Формула: `effectivePushEnabled = (permission === 'granted') && (serverFlag === true) && (токен зарегистрирован)`. Переключатель = `effectivePushEnabled` (учёт токена обязателен).
• **Запрос при первом запуске**: `prompt` + флаг `mentai.push.permissionRequestedOnce` не установлен → `requestPermissions()`. Если `denied` → PATCH false (не перехватываем клик, узнаём через результат). Если `granted` → PATCH true, register.
• **При открытии настроек**: `refreshPermissionStatus()`, переключатель = эффективное состояние.
• **После denied → пользователь включил в системных настройках вручную**: при возврате перечитать permission, если granted → PATCH true, register.
• **Модалки**: `prompt` → сразу системная (без кастомной). `denied` → кастомная «Уведомления отключены в системных настройках» + «Открыть настройки». При выключении — лёгкое подтверждение.
• Аналитика настроек: `useSettingsAnalytics` (Sentry breadcrumbs) — события `settings_notifications_push_toggle`, `settings_notifications_marketing_toggle`, `settings_notifications_open_system_settings`.
• ID пользователя показывается внизу `/settings` с копированием (useClipboard/Capacitor Clipboard с fallback).
• Чат: welcome‑ответ стартует при пустом `messages`, параметр `mode` удалён; `entryContext` приходит из разделов `/habits` и `/therapy` и учитывается в prompt.
• Чат: приветствие используется только в welcome‑старте и не чаще 1 раза в день (локальная дата пользователя). Приветствие по имени — отдельный лимит; имя очищается до «только имя» без фамилии/никнеймов. Отметки хранятся в `chat_settings.last_greeting_at` и `chat_settings.last_name_greeting_at`. Инструкция про имя и выбор стартовой фразы добавляются только в первое сообщение дня, чтобы не раздувать токены.
• Чат: альтернативная стартовая фраза в welcome‑режиме учитывает `entryContext` (`therapy_topic` / `habit` / `sos`) и `user_gender` (если есть) для естественных формулировок. Выбор фразы выполняется случайно, при этом для одного `userId + context` исключается повтор предыдущей фразы подряд (in-memory anti-repeat). Общий нейтральный шаблон используется только при входе с главной (`entryContext = null`), а при переходе из темы/привычки/SOS старт сразу формулируется по выбранному контексту.
• Чат: suggested‑chips не сбрасываются при наборе текста, очищаются только при отправке/выборе.
• Чат: микрофон в инпуте имеет индикацию записи через ::before/::after (пульсирующая точка), отправка на мобильных срабатывает на первый тап через pointerdown‑хэндлер даже во время записи.
• Голосовой ввод: Whisper‑fallback временно отключён, используются только native/webspeech движки.
• Чат: кнопки действий (микрофон/отправка) оформлены как отдельные «приподнятые» элементы с градиентом и мягкой тенью для лучшей читаемости.
• Практики:
• Хаб `/practices` объединяет дыхательные практики и медитации.
• Дыхательные практики: страницы `/breath-practices` и `/breath-practices/:slug`, каталог в `app/lib/breathPracticesCatalog.ts`. Плеер вынесен в переиспользуемые компоненты: `BreathPracticePlayer.vue` (полный плеер с управлением, настройками, overlays) и `BreathOrb.vue` (визуализация сферы дыхания). Компоненты можно использовать в модалке SOS и других местах.
• В `BreathPracticePlayer` добавлена отдельная настройка `Голос` (независимо от `Звуковые сигналы`): голосовые подсказки фаз (`inhale/hold/exhale/pause`) загружаются из `public/breath/voice/{informal|formal}/*.mp3`, с preloading и fallback при ошибках.
• SOS: страница `/sos` (`app/pages/sos.vue`) с компонентом `app/components/sos/SosPageContent.vue`. Открывается по навигации из `PageHeader` (кнопка SOS) или из чата через suggested chips (action `open_sos` с query `?entry=panic|tension|technique_picker`). Сценарии: выбор состояния, короткие практики (5-4-3-2-1, квадратное дыхание через `BreathPracticePlayer`, PMR), финиш с переходом в чат. При входе в любой тренажёр (panic-grounding, panic-breathing, tension-practice) фоновые звуки сцены приглушаются; при выходе — возобновляются (как в дыхательных практиках и медитации). Хедер страницы фиксирован при скролле (стандартный `PageHeader`).
• SOS PMR Voice: для шага `tension-practice` добавлена локальная озвучка фаз (`clench`/`release`/`finish`) через файлы из `public/sos/tension/*`, с предзагрузкой, graceful fallback при ошибке аудио и отдельной локальной настройкой `voiceEnabled` (`app/utils/sosVoiceSettings.ts`).
• SOS PMR UI стандартизирован под `BreathPracticePlayer`: такой же prep-overlay `3..2..1`, фиксированная нижняя панель (settings/stop/play-pause + прогресс). В хедере SOS при техниках отображается кнопка «Назад» (аналогично PageHeader). Модалка настроек в том же стиле + отдельные пункты `Голос` (voice prompts) и `Звуковые сигналы` (cue inhale/exhale), локальные настройки в `app/utils/sosTensionPracticeSettings.ts`.
• Переход из SOS в чат: выполняется переход на `/` с `screen=chat`, контекст передается через `chat.entryContext` типа `sos` (`sos_entry`, `after_practice`).
• Suggested chips: action `open_sos` (params: `sosEntry`) осуществляет навигацию на `/sos?entry=...` для открытия страницы с нужным начальным шагом.
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
• rate-limit (DDOS) только для `/api/*`, с конфигом через ENV `RATE_LIMIT_MAX` и `RATE_LIMIT_WINDOW_MS` (дефолт: `180` запросов за `60000` мс),
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
• Capacitor API baseURL: в native используется правило из `app/plugins/api.ts` — в dev приоритет у `window.location.origin` (для сохранения рабочего Android-потока), но на iOS non-http(s) origin (`capacitor://localhost`) запрещён и заменяется на `NUXT_PUBLIC_API_SERVER_URL` (apiBase).
• Сборка для mobile: используем `pnpm generate` (script `build:mobile`) с `.env.development`, чтобы `NUXT_PUBLIC_API_SERVER_URL` попал в runtimeConfig.
• Медитации v1:
• Таблицы: `meditation_tracks` (каталог), `meditation_favorites` (избранное).
• Настройки пользователя: `user_preferences.meditation_timer_minutes`.
• Статус на 25 февраля 2026: в `useMeditationPlayer` native-путь (`@capgo/native-audio`) включён по умолчанию на mobile при доступности `NativeAudio` плагина; отключение только явным `NUXT_FEATURE_NATIVE_MEDITATION_AUDIO_ENABLED=false`. Это нужно для стабильного фонового воспроизведения медитаций на Android/iOS.
• Реализованный native-слой: `app/services/audio/nativeAudio.service.ts` (адаптер `@capgo/native-audio`, нормализованные события, loop/replay/fade, lifecycle) + `app/services/audio/androidForegroundBridge.ts` (JS bridge) + Android app-level foreground service (`MentalaAudioForegroundService` / `MentalaAudioForegroundPlugin`) с регистрацией в `MainActivity` и manifest permissions (`FOREGROUND_SERVICE`, `FOREGROUND_SERVICE_MEDIA_PLAYBACK`, `WAKE_LOCK`).
• Обновление от 24 февраля 2026: для native non-loop треков длительность в UI берётся из `durationSeconds` как fallback (если metadata плагина запаздывает), seek-кнопки работают даже до прихода полной metadata; fade-in в native выполняется неблокирующе, поэтому индикатор буферизации скрывается синхронно со стартом звука.
• Обновление от 24 февраля 2026 (iOS стабильность seek/progress): в `NativeAudioService` добавлен fallback-поллинг `currentTime` + локальные «часы позиции» для **non-loop** треков (если плагин на iOS отдаёт `0`/запаздывает); для seek на iOS используется усиленный путь через `play(time)` только для **remote** источников.
• Обновление от 24 февраля 2026 (iOS loop seam fix): для loop-треков с HTTP(S) URL на iOS добавлен локальный кэш через `@capacitor/filesystem` (Directory.Cache) и preload из `file://` URI. Это переводит loop в `AudioAsset/AVAudioPlayer` внутри `@capgo/native-audio` и убирает разрыв, характерный для remote-loop (`AVPlayer seek(0)+play`). При ошибке кэша используется безопасный fallback на исходный remote URL.
• Обновление от 24 февраля 2026 (iOS прогресс `1 -> 0`): в `NativeAudioService` добавлена нормализация входящего `currentTime` (игнор ложных сбросов к нулю вне реального loop-wrap/seek), а при дозагрузке native metadata позиция перед `playing` событием перечитывается из движка. На Android fallback-поллинг отключён, источник прогресса — нативные `currentTime` events плагина.
• Обновление от 25 февраля 2026 (Android stop hard-reset): в `NativeAudioService.stop()` после `stop` добавлен `unload` + полный сброс `activeAssetId/activeTrack`, чтобы исключить самопроизвольный рестарт медитации по audio-focus при закрытии mini-player.
• Обновление от 25 февраля 2026 (Android background + routing fix): в Android‑плагине `@capgo/native-audio` отключена смена `AudioManager` на `MODE_IN_COMMUNICATION` и добавлен флаг `allowBackgroundPlayback` — при `background=true` плагин больше не ставит паузу на `handleOnPause`, поэтому медитации продолжаются в фоне без ухода звука в разговорный динамик. `NativeAudioService.configureEngine()` снова передаёт `background: true`, а фон держит `MentalaAudioForeground` сервис.
• Обновление от 24 февраля 2026 (UI каталога медитаций на iPhone): карточка `MeditationCard` переведена с невалидной схемы `button > button` на семантически корректный контейнер `article[role=button]` с клавиатурной доступностью; кнопка избранного остаётся отдельной и фиксируется справа сверху (`right-2 top-2`), заголовок карточки имеет fallback `Без названия`. Это устраняет iOS/Safari-артефакты позиционирования сердечек и пропажу заголовков в блоке «Все».
• Плеер мини/детальной страницы: кнопки «Назад/Вперёд» для треков, при переключении активного трека во время воспроизведения автоплей не прерывается (следующий/предыдущий трек стартует сразу); для `isLoop` треков приоритетно используется Web Audio API (AudioBufferSourceNode + loopStart/loopEnd) на всех платформах, включая iOS, чтобы сохранить бесшовный цикл; HTMLAudio остаётся fallback для non-loop и аварийных кейсов. Для iOS в web-слое дополнительно выставляется `navigator.audioSession.type = 'playback'` (если API доступен), а при возврате из background/foreground выполняется мягкое восстановление WebAudio через `visibilitychange` + `Capacitor AppState`. Фон детальной медитации подтягивается из `backgroundPath` на уровне layout `default.vue`, тянется на весь экран, выше aurora-слоя и без затемнения. Для одной медитации поддерживается несколько тем через массив `topicKeys`, поэтому трек может появляться в нескольких секциях, но в «Все» остаётся один раз. Контекст очереди (список треков текущей секции) сохраняется при открытии трека, поэтому перемотка вперёд/назад идёт по выбранной секции (например «Все» или конкретная тема).
• Контроль конкурентных запусков: `useMeditationPlayer` использует глобальный `playbackActionId`, чтобы отменять устаревшие `play/pause/stop` и гарантировать единственный активный трек.
• При смене трека применяется короткий fade (~80 мс) даже без основного fade, чтобы избежать щелчков на мобильных динамиках.
• Автоплей при быстром переключении треков учитывает `isBuffering`, чтобы серия нажатий «вперёд/назад» не оставляла плеер на паузе.
• Детальная страница трека автозапускает воспроизведение при входе; повтор трека включён по умолчанию; для `isLoop` треков прогрессбар скрыт.
• Автоплей на мобильных: если браузер блокирует `audio.play()` без жеста, плеер снимает лоадер и ставит запуск в очередь до первого пользовательского взаимодействия (gestures).
• Для `isLoop` треков блокировка WebAudio по autoplay не переводит плеер в HTML сразу: воспроизведение откладывается до пользовательского жеста (`scheduleGestureUnlock`), чтобы не терять бесшовность loop.
• Старт HTMLAudio выполняется по минимальной готовности (`loadedmetadata/canplay`), без обязательного ожидания `canplaythrough`; это сокращает задержку начала воспроизведения на iOS.
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
• Дефолтная громкость фонового трека — 25%.
• Настройки возвращаются в `/api/user/me` как `sceneSettings` и сохраняются через `/api/user/me` (PATCH).
• Дополнительный флаг `sceneSettings.animateBackground` управляет анимацией обоев.
• Pinia-store `useSceneSettingsStore` отвечает за локальное состояние и дебаунс‑сохранение.
• Сохранение настроек сцены отменяет предыдущий `PATCH /api/user/me` через `AbortController`, чтобы не было откатов при быстром переключении.
• Дополнительно фиксируется версия локальных изменений (changeVersion), чтобы устаревшие ответы не могли откатить выбранную сцену даже до старта следующего запроса.
• `useSceneAudio` управляет воспроизведением и fade‑in/out: loop-сцены идут через WebAudio (бесшовный цикл), non-loop — через HTMLAudio fallback. Для native mobile добавлен bootstrap fallback для loop: если после cold-start первый запуск loop в WebAudio даёт тишину, сцена одноразово стартует через HTMLAudio (прайм аудио-выхода), после чего сервис автоматически делает повторный запуск и переключает её в WebAudio для бесшовного loop.
• Для надёжности при быстрых переключениях сцен применяется защита от гонок: устаревшие play‑операции игнорируются по actionId, а ответы сохранения настроек не перезаписывают последние изменения.
• В `useSceneAudio.stop/pause` добавлена жёсткая остановка обоих движков (`HTMLAudio` и `WebAudio`) независимо от текущего `playbackMode`. Это устраняет ghost-наложение звука при гонках (смена сцены, параллельный старт/стоп медитации, фон/foreground).
• Обновление от 25 февраля 2026 (fix наложений): при переключении движка для одной и той же сцены (`HTML -> WebAudio` и `WebAudio -> HTML`) `useSceneAudio` теперь принудительно гасит предыдущий движок перед запуском нового и переносит текущую позицию. Это убирает двойное воспроизведение, «просадку» громкости и неснимаемые наложения.
• Обновление от 25 февраля 2026 (приоритет практик): `useSceneAudio.suspend()` теперь останавливает сцену и в состоянии `isBuffering` (а не только `isPlaying`), а `play()` блокируется при `isSuspended=true`. Это исключает запуск сцены поверх медитации/практик в гонках старта.
• В layout `default.vue` фон сцены отображается на всех страницах, кроме `/meditations?trackId=...`; при входе в медитацию фоновые звуки приложения приглушаются и возобновляются после выхода. Панорама фона упрощена до одного слоя с диагональным движением, увеличенной длительностью и меньшим масштабом для снижения нагрузки.
• Глушение сцены в `default.vue` привязано к факту активного медитационного аудио (`isPlaying || isBuffering`), а не к самому открытому экрану медитации. Поэтому после `stop()` медитации фон сцены корректно возвращается.
• Обновление от 25 февраля 2026 (layout race guard): `syncSceneAudioState` в `default.vue` использует `runId`, чтобы отменять устаревшие async-циклы `setScene/suspend/resume/play`; это убирает обратные автозапуски сцены при быстрых сменах состояния.
• Обновление от 25 февраля 2026 (Android audio mixing fix): на Android исправлены баги смешивания треков: (1) при переходе с медитации на сцену добавлена задержка 280 мс перед resume/play сцены, чтобы ExoPlayer освободил audio focus; (2) при suspend сцены на Android используется полный `stop()` вместо `pause()`, чтобы полностью освободить WebAudio/HTML5 и избежать duck-ования; (3) в `useMeditationPlayer.play()` при native playback выставляется `isBuffering=true` до любого await, страхуя от гонки watcher при смене треков.
• Во время выхода из аккаунта выставляется `auth.isLoggingOut`: layout `default.vue` не запускает `useSceneAudio`, а logout‑запрос отправляется в фоне, чтобы UI не зависал и фон не стартовал заново.
• Автозапуск фоновой сцены учитывает autoplay‑политику браузеров: `useSceneAudio` заранее слушает пользовательский жест и делает `AudioContext.resume()` только после него; дополнительно на странице `/scene-selection` пользовательские действия (слайдер громкости, выбор сцены) вызывают `kickstart`, а в `default.vue` добавлен единый first-gesture kickstart (pointer/touch/click) для сценария холодного старта. Это убирает кейс «звук не поднялся после открытия приложения». При `volume = 0` сцена не запускается и принудительно останавливается; при уходе приложения в background поведение зависит от `backgroundPlayMinutes`: `0` — стоп сразу, `N > 0` — остановка через `N` минут.

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
• `PUT /api/notifications/prefs/:kind` больше не ждёт завершения тяжёлой slot-оркестрации в HTTP-цикле: для `textSource !== 'ai'` и для update-кейсов без AI-регенерации слоты запускаются в фоне (асинхронный fire-and-forget), поэтому UI не висит на долгом лоадере при изменении `customSlotTimes` и шаблонных настройках.
• Фронт использует `WeekdaySelector`, `TimeRangeSelector`, а также кликабельные чипы под слайдером частоты для точного времени.
• Планировщик (`scheduler.service.ts`) при генерации слотов даёт приоритет кастомным временам, остальное распределяет равномерно внутри выбранного окна.
• Логика распределения времени слотов (чередование, fixed times, интервалы внутри дня) описана в `.docs/NOTIFICATION_SCHEDULING_ORCHESTRATION.md`.
• Источник истины по масштабированию и надёжности слотов: `.docs/notification_slots_scaling_tz.md` (queued не удаляются при регене, критерий горизонта — `planned+queued`, sharding/cursor/cycle, backpressure, lock-стратегия).
• `forceTodaySlots` на текущем этапе считается техдолгом и находится вне scope scaling-этапа.
• Logout отключает уведомления **только на текущем устройстве**: токен удаляется через `/api/notifications/unregister-token` (таблица `user_devices`).
• При логине токен устройства повторно регистрируется (если есть) и в фоне проверяется наличие активных слотов: если нужно регенерировать или активные настройки есть, но слотов нет — запускается `generateAllSlotsForUser`.
• AI-генерация теперь reason-aware: воркер `aiTextGeneration.worker.ts` запускает `generateAllSlotsForUser(...)` только для пользовательских причин (`prefs_create/prefs_update/settings_* / onboarding_complete / user_gender_update / login / timezone_changed / manual`). Для фоновых причин (`missing_ai_texts`, `retry_after_provider_error` и др.) автоматический полный пересчёт слотов отключён, чтобы расписание/тексты не менялись самопроизвольно.
• В `global-orchestration.service.ts` добавлен жёсткий инвариант: слот с `scheduledAt <= now` не вставляется в `notification_slots` (даже если попал в расчёт), чтобы delivery не отправлял его как overdue «сразу». Для диагностики логируются события `notification_slots_orchestration_start` (кто/почему запустил пересборку) и `notification_slots_past_guard` (сколько прошлых слотов отфильтровано + sample).
• Delivery stale-policy: в `processDueSlots` массовый перевод в `skipped` больше не зависит от окна `lookAhead`; в `skipped` уходят только действительно протухшие `planned`-слоты старше `NOTIFICATION_MAX_SLOT_AGE_HOURS_BEFORE_SKIP`. Overdue-слоты в пределах этого возраста попадают в обработку и могут быть доставлены.
• AI‑генерация текстов уведомлений выполняется через очередь BullMQ `ai-text-generation` с debounce‑dedup (`id = ai-gen-{preferenceId}`, TTL≈20с) и лимитом на пользователя (не больше 3 активных задач одновременно). При ошибках AI слоты **не** создаются, задача ретраится с backoff; после успешной генерации пересчёт слотов выполняется только для пользовательских причин (а не для фоновых refill/missing-кейсов). При повторных сбоях объём генерации снижается (50 → 25 → 12), чтобы не срывать процесс.
• Префикс AI‑текстов: для шаблонных тем используется `✨`, для кастомных — `✏️` (префикс учитывается в лимите длины).
• AI‑промпты запрещают ложные утверждения о достижениях пользователя: формулировки только нейтральные/поддерживающие без фиксации «успеха».
• При изменении глобальных настроек (`tone`, `addressing`) через `/api/settings/preferences` ставится регенерация AI‑пулов для всех `ai` preferences пользователя (через ту же очередь).
• Шаблонные тексты из `notificationTemplates` по умолчанию без изображений (`imageTag = null`), но могут иметь явный `imageTag`.
• Контент каталога `notificationTemplates` поддерживается через регулярную чистку: спорные/неестественные шаблоны удаляются целыми блоками, а в оставшихся текстах нормализуется типографика (например `5 Минут` → `5 минут`). После правок выполняется синхронизация в БД через `scripts/migrate-templates-to-db.ts`.
• Обновление от 25 февраля 2026 (cleanup удалённых therapy-тем): из шаблонного каталога окончательно убраны `mood`, `grief`, `loneliness`; удалены соответствующие notification image assets и записи в image hash maps. Для физической зачистки legacy-данных в БД добавлена data-миграция `0053_remove_deprecated_therapy_topics.sql` (чистит `notification_preferences`, `notification_slots`, `notification_image_rotation`, `notification_texts`, `notification_text_presets`, `ai_generated_notification_texts` и связанный `ai_notification_text_usage` для `kind='therapy'`).
• В native (Capacitor) регистрация push‑токена всегда идёт через `$api` и использует ту же стратегию выбора `baseURL`, что и остальные API-запросы (`app/plugins/api.ts`), чтобы не было расхождений между auth и push.
• Delivery scheduler для push работает по симметричному окну `now-lookahead .. now+lookahead` и ставит `notification-delivery` jobs с `delay = scheduledAt - now` (BullMQ delayed jobs). Это сохраняет точный тайминг внутри окна и исключает поздние «догоняющие» отправки спустя часы.
• Перед выборкой due-слотов delivery-процесс массово помечает `planned -> skipped` только для действительно протухших записей старше `NOTIFICATION_MAX_SLOT_AGE_HOURS_BEFORE_SKIP`; записи моложе этого порога попадают в due-выборку как overdue и могут быть доставлены.
• При ручном изменении notification preferences (`forceTodaySlots=true`) диапазон пересоздания слотов начинается с `now` (без safe-window), поэтому будущие слоты текущего дня пересчитываются сразу, а не откладываются на завтра.
• Жёсткий инвариант по частоте источника: `timesPerDay` ограничен диапазоном `1..5` на backend. `customSlotTimes` тоже ограничен максимумом 5 и считается внутри этого лимита (ручные времена не добавляют «дополнительные» слоты сверх 5).
• Глобальный post-shift anti-overlap отключён: оркестратор больше не двигает `planned`-слоты после вставки. Равномерность достигается на этапе распределения времени внутри источника (краевые слоты фиксируются на границах диапазона, джиттер применяется только к внутренним слотам).
• Статус `sent` фиксируется только при реальной успешной отправке в FCM/APNs (`send result = sent`). Mock-отправка не переводит слот в `sent`; при отсутствии реальной доставки слот переводится в `failed`, чтобы статус не был ложноположительным.
• Collapse key для push формируется на уровне конкретного `slotId`, а не `kind/entity`. Это сохраняет дедупликацию ретраев одного слота, но исключает схлопывание разных слотов в одно уведомление.
• Для custom-источников уведомлений (`habits/therapy`) доставка и генерация учитывают entitlement: при отсутствии доступа custom-слоты не генерируются и переводятся в `skipped` на этапах `planned` и `queued`, чтобы после окончания Trial/понижения плана уведомления по закрытым сущностям не отправлялись.
• `POST /api/notifications/mark-delivered` поддерживает батч-пометку: принимает `slotId` или `slotIds[]`, и помимо явных ID помечает `sent -> skipped` для слотов того же пользователя с тем же `scheduledAt` (чтобы в группе уведомлений не оставались “хвосты” со статусом `sent`).
• UI (habits и therapy) отражает вручную заданные слоты: под слайдером частоты отображается интерактивный список слотов с тайм-пикерами; компонент TimePicker использует Radix ScrollArea без `overflow-hidden`, поэтому свайпы/прокрутка работают нативно, а кнопки синхронно центрируют выбранное значение.
• В карточке `NotificationsSummaryCard` на страницах темы терапии и привычки под статусом `Включены/Выключены` добавлена ссылка `Как напоминания усиливают прогресс`, открывающая модалку с кратким evidence-блоком; ссылка на PubMed (`https://pubmed.ncbi.nlm.nih.gov/29191800/`) открывается во внешнем браузере (native: `@capacitor/inappbrowser`, web fallback: `window.open`).
• NotificationSettingsPage визуально сгруппирован в `glass-deep` карточки с внутренними подложками, чтобы текст читался на фоне обоев и сохранялась иерархия блоков.
• NotificationTextsEditorPage использует общий `glass-deep` контейнер для списка текстов с внутренними карточками-подложками; кнопка сохранения закреплена липкой панелью над BottomNav.
• NotificationSettingsPage показывает блок «Мои пожелания» для **шаблонных** тем (не для кастомных). Пожелания сохраняются в `custom_prompt_notification` и влияют на AI-генерацию.
• Изображения уведомлений (обновление от 26 февраля 2026): runtime-подбор в `notification-images.service.ts` переведён на модель `rules + score` с порогом `MATCH_SCORE_THRESHOLD` (default `0.65`), без глобального fallback-списка `nature -> ...`.
• Семантика берётся гибридно: базовый `imageTag` от LLM + rule-based сигналы из текста (`text`), `actionHint`, `subtype`, `directness`, `habitIntent`; неизвестные/конфликтные теги отсекаются на этапе rule-gate/score.
• Источники и приоритеты: `habits` — сначала `habits/{entity}/{tag}`, затем разрешённый `common/{tag}`; `therapy` — сначала `therapy/{entity}/{tag}`, затем `common/{tag}`; при нескольких валидных common-тегах в терапии включено round-robin чередование по смысловым группам.
• Для `water` реализован отдельный микс-режим: при semantic match чередуются `habits/water/neutral_abstract` и `common/activity` в общей ротации (`water_mix`).
• Для `habits` с `habitIntent='quit'` действует защитный инвариант: если в тексте нет harm-сигналов и текст имеет позитивный/benefit тон, сущностные (`habits/{entity}/*`) ассеты блокируются; при наличии semantic match допускается подбор из `common/*`.
• Для `habits:sugar` введён частотный gate на сервере: изображение прикрепляется максимум в 50% релевантных уведомлений (чередование по персистентному rotation-индексу `sugar_frequency_gate`), при сохранении semantic-match требований.
• Для custom/entityless источников разрешены только safe common-теги (`activity/nature/meditation/daily_life/neutral_abstract`), `harm_*` блокируются.
• Для `textSource=templates` в `global-orchestration.service.ts` добавлен server-side тарифный gate: изображение прикрепляется только при активной платной подписке (`pro/premium`); на `basic` или без активной подписки push уходит без `payload.image`.
• `notification-image-map.json` и `notification-image-size-map.json` остаются артефактами пайплайна ассетов (`scripts/hash-notification-images.mjs`), URL строится от `NUXT_PUBLIC_MEDIA_BASE_URL` (fallback: `PUBLIC_APP_ORIGIN`/`NUXT_PUBLIC_APP_URL`).
• Для отдельных тем AI-генерации можно задавать ограничения `imageTag` через `IMAGE_TAG_POLICY_OVERRIDES` в `ai-generation.service.ts`; override влияет на генерацию тега, а итоговый runtime-выбор изображения проходит через серверный semantic gate.
• Отдельное ТЗ по оптимизации релевантности картинок и fallback-логики: `.docs/notification_images_optimization_tz.md`.
• Android push: канал `mentai_high` создаётся нативно в `MainApplication` и задан как `default_notification_channel_id` в манифесте; fallback канал `fcm_fallback_notification_channel` удаляется, чтобы все уведомления были в одном разделе. Для FCM используется `tag = slotId`, чтобы Android не перезаписывал уведомления внутри группы.
• Android push (важно): для Android отправляются **data-only** сообщения. Нативный сервис `MentalaMessagingService` сам строит уведомление (title/body/image из `data`) и привязывает `contentIntent`, чтобы тап работал и в раскрытом виде. В фореграунде системное уведомление не показываем (только JS-обработка). В интент обязательно кладём `google.message_id`, чтобы `PushNotificationsPlugin` эмитил `pushNotificationActionPerformed` на холодном старте.
• iOS push: сервер принимает **FCM registration token**. На iOS токен берём через `@capacitor-community/fcm`; APNs token хранится только для диагностики и не используется для отправки.
• Для iOS обязательно пробрасываются нативные callbacks регистрации remote notifications из `AppDelegate.swift` в Capacitor (`.capacitorDidRegisterForRemoteNotifications` / `.capacitorDidFailToRegisterForRemoteNotifications`), иначе JS-событие `registration` и привязка FCM токена не происходят.
• iOS Firebase конфигурация унифицирована: используется только `ios/App/App/GoogleService-Info.plist` с bundle id `com.mentala.app`; отдельный dev bundle (`com.mentala.app.dev`) и `GoogleService-Info-Dev.plist` не используются.
• В `sendFCMNotification` добавлена расширенная диагностика ошибок FCM (code/errorInfo/message). Токены с `invalid-registration-token`, `registration-token-not-registered` и `SenderId mismatch` автоматически удаляются из `user_devices`, чтобы не плодить постоянные ретраи на невалидных устройствах.
• iOS rich‑image: добавлен отдельный iOS target `MentalaNotificationService` (`UNNotificationServiceExtension`). Сначала используется `Messaging.serviceExtension().populateNotificationContent(...)` (Firebase helper), затем fallback на ручную загрузку attachment из `data.imageUrl` (и legacy `data.image`) при отсутствии вложения.
• Валидация rich-image на backend централизована в `notification-image-validation.ts`: разрешены только `https` + `jpg/png` + путь из `/notifications/*` с известным размером из `notification-image-size-map.json`. При размере `>1MB` (или любой невалидности) push отправляется как текстовый: без `notification.imageUrl`, без `apns.fcmOptions.imageUrl`, без `data.image/data.imageUrl`.
• Разделение окружений push: в `user_devices.app_env` пишется серверное окружение (`MENTALA_DB_ENV`/`NODE_ENV`), а не клиентский `X-App-Env/appEnv`; это защищает от dev/prod рассинхрона между iOS/Android. Отправка по‑прежнему фильтруется по текущему окружению сервера.
• Push‑навигация: payload слота содержит `deepLink`, `navigation`, а также `data.action` + параметры (`trackId`/`practiceId`) для fallback‑маршрута. Клиент выполняет переход только при системном тапе; snooze/yes/no не должны запускать навигацию. При отсутствии данных fallback на `/`.
• Приоритет навигации: `deepLink` → `data.action` → `navigation/navType` → `/`.
• Надёжность push‑переходов (client): целевая навигация кладётся в очередь (Preferences/localStorage) с TTL, дедуплицируется по `messageId` и «специфичности» пути (например `/meditations?trackId=...` сильнее `/meditations`). Переход выполняется после `router.isReady()` и попытки `auth.me()`; если маршрут свернулся до базового пути, выполняется одноразовый retry через `router.replace`.
• При системном тапе по push клиент дополнительно вызывает `useMeditationPlayer.registerUserGesture()` до роутинга: это заранее пытается разблокировать WebAudio (`AudioContext.resume`) и повышает надёжность автозапуска звука на открытом по уведомлению треке.
• Очередь pending push-навигации очищается только после подтверждённого перехода на целевой `fullPath`; при срыве из-за middleware/инициализации запись не теряется и ретраится до истечения TTL (через `app:mounted`, `router.afterEach`, `auth.isLoggedIn` и отложенный retry-таймер в клиенте).
• Android/iOS cold+warm push fallback: `MainActivity` и `AppDelegate` сохраняют launch extras push-интента в storage-ключ `mentai.push.launchPayload`, совместимый с `@capacitor/preferences` (на iOS фактический ключ `CapacitorStorage.mentai.push.launchPayload`). JS-плагин потребляет payload не только на `app:mounted`, но и при `appStateChange(isActive=true)`, что закрывает кейсы пропуска `pushNotificationActionPerformed`.
• `actionHint` хранится в `notification_texts` и `notification_text_presets` (а для AI — в `ai_generated_notification_texts.texts[]`) и используется на сервере для вычисления `navigation`.
• Для `actionHint=breathing` сервер сначала пытается определить конкретную технику по тексту: `4-7-8` → slug `4-7-8`, `4-4-4-4`/«квадратное»/«коробочное» дыхание → slug `box-breathing`; если явной техники нет, используется fallback `DEFAULT_BREATH_PRACTICE_SLUG` (по умолчанию `box-breathing`).
• Если `actionHint` отсутствует или равен `none`, сервер применяет эвристику по тексту и `imageTag` (медитация/дыхание) как fallback, чтобы не терять навигацию.
• Android clickAction: сейчас **не задаётся** (используем дефолтное поведение Android — открытие приложения по тапу). Если когда‑нибудь понадобится кастомный `clickAction`, он должен строго совпадать с `intent-filter` `MainActivity`, иначе тап по уведомлению не откроет приложение.
• Дефолтные цели перехода (медитация/дыхание) задаются на сервере конфигом и могут меняться без релиза клиента.

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
• To-be: для операционных аномалий используется отдельное поле `checkoutStatus` (`in_progress`/`manual_review`/`closed`), а `paymentStatus` остается доменным статусом доступа.
• To-be: default для нового pending-checkout — `checkoutStatus=in_progress` (без `NULL`).
• `subscription_events` — аудит/аналитика (trial_started, checkout_started, purchase_success/failed, subscription_canceled и т.д.).
• `payments` — идемпотентность webhook по `payment.id` YooKassa (PK = text).
• `idempotency_keys` — идемпотентность команд (ключ = userId+route+Idempotency-Key), хранит `response_json` для повторов.
• `therapy_sessions` — учёт минут: `started_at`, `last_activity_at`, `ended_at`, `duration_seconds`.
• `trial_usage_tracking` — защита от злоупотребления Trial по идентификатору пользователя (email, в будущем phone).

• Trial:
• Trial — это **состояние пользователя**, а не отдельный план: `users.has_used_trial`, `users.trial_started_at`, `users.trial_ended_at`.
• При регистрации создаётся `Basic` подписка; если Trial активен — для Basic включается полный AI-доступ уровня Premium на 7 дней (с Premium fair-use guard).
• Идентификатор Trial: сейчас **email обязателен**, без email регистрация не поддерживается.
• Нормализация email: `normalizeEmail` (lowercase + Gmail aliases + Unicode NFKC) — единая для auth и trial tracking.
• Идентификатор: `email_hash` (HMAC‑SHA256 + `EMAIL_HASH_PEPPER`) как ключ; `email_normalized` хранится для поддержки.
• Консистентность: операции Trial выполняются в одной транзакции; `trial_usage_tracking` обновляется через UPSERT.
• Ретеншн PII для `trial_usage_tracking`: 1 год после последнего использования Trial или удаления аккаунта (см. `.docs/trial_abuse_prevention_tz.md`).
• Очистка ретеншна: ежедневная фоновая очистка `trial_usage_tracking` (можно отключить `TRIAL_USAGE_CLEANUP_ENABLED=false`).

• Тарифная матрица (зафиксированная целевая v1, до этапа внедрения):
• `Basic` (0₽): AI-чат отключён, AI-уведомления отключены, доступны шаблонные уведомления + SOS-техники + 2 популярные дыхательные практики.
• `PRO` (349₽): всё из Basic + текстовый AI-чат с лимитом `100 мин/нед` + полная библиотека медитаций + все дыхательные практики + AI-уведомления.
• `Premium` (649₽): всё из PRO + текстовый AI-чат «безлимит*» + персональный стиль AI-напоминаний + создание/управление своими практиками, где `*`= обязательная серверная fair-use защита.
• Premium fair-use guard: единый stop-порог`900 мин/нед`(временная блокировка до reset окна).
• Формулировка «безлимитный AI-чат» допустима только с пометкой`\*fair-use`.
• Чатовая TTS-озвучка временно выключена глобально для всех планов через kill-switch `FEATURE_TTS_ENABLED=false` (до отдельного voice-этапа и привязки к Premium).
• Для закрытых функций применяется единый lock/paywall контракт: иконка premium-доступа в UI + модалка с CTA на нужный тариф.
• Правила lock/paywall хранятся в БД (`feature_access_policies`) и отдаются через entitlement API, фронт не хардкодит тексты/тариф.
• Обязательный bootstrap реализован: `GET /api/user/me`возвращает объект`billing`(plan/trial/aiChatMode/entitlements snapshot), чтобы при старте приложения UI сразу знал, показывать lock-иконки и paywall-модалки или нет.
• Для общего входа в чат используется entitlement`chat.assistant`: блоки «Начать/Поговорить в чате» показывают lock-иконку (`⭐`/`💎`) и открывают paywall-модалку вместо попытки запуска чата на недоступном тарифе.
• Кастомные привычки и кастомная терапия закрыты entitlement-ключами `habits.custom.create` и `therapy.custom.create`: create/open/update API отдают `feature_plan_required`, а индексные карточки показывают lock-бейдж и открывают стандартную paywall-модалку вместо модалки создания.
• Исключение по UX: удаление уже созданных кастомных привычек/тем терапии разрешено всегда (для владельца), даже если entitlement на создание/открытие больше недоступен; блокируются только вход в карточку/настройки и взаимодействия, требующие доступа к фиче.
• Для уведомлений введён авто-fallback: если у пользователя нет entitlement на `notifications.text_source_ai`(например, Trial истёк на Basic), сервер принудительно переводит`textSource=ai`в`templates`в API prefs и в фоновых AI-воркерах, чтобы не останавливать уже настроенные уведомления и не запускать новые AI-генерации без доступа.
• В`NotificationSettingsPage` блоки «Способ создания / ИИ» и «Мои пожелания» используют entitlement-gate с lock-иконкой (`⭐`/`💎`) и paywall-модалкой; поле пожеланий остаётся read-only без доступа и не участвует в AI-генерации до открытия тарифа.

• Checkout (as-is):
• `POST /api/subscriptions/start-checkout` требует `Idempotency-Key` и сохраняет `request_hash` команды в `idempotency_keys`.
• Повтор с тем же `Idempotency-Key`, но другим payload (`planId`/`billingPeriod`/`paymentMode`/`externalFlow`) возвращает `409`.
• Введена единая policy смены: `upgrade now, downgrade later`.
• Классификация команды:
• `upgrade_now` и `month->year` применяются сразу;
• `downgrade_later` и `year->month` не создают checkout, а планируются на конец текущего периода.
• Контракт `start-checkout` расширен:
• `checkoutAction = payment | activated | scheduled_downgrade | noop`;
• `scheduledChange = { planId, billingPeriod, effectiveAt } | null`.
• `billingCredit` больше не участвует в расчёте checkout (`creditApplied=0`, `creditGranted=0` в новых командах).
• Формула `month->year`: `toPay = yearPrice - unusedCurrentValue`; при этом новый период начинается сейчас (`endDate = now + 365 дней`).
• Для `downgrade_later`:
• сохраняется schedule в `users.scheduled_*`;
• у текущей активной подписки выставляется `autoRenew=false`;
• ответ возвращается без платежа (`paymentMode=none`, `toPay=0`).
• Для `upgrade_now`:
• schedule очищается;
• создаётся `pending` (если `toPay > 0`) или сразу `active` (если `toPay = 0`) подписка;
• предыдущая активная подписка переводится в `expired` после активации новой.
• Перед расчетом checkout сервер синхронно очищает просроченные `active` (`endDate <= now -> expired`).
• Выбор "текущей" подписки унифицирован: `order by endDate desc, createdAt desc, id desc`.
• Если `toPay > 0` — выполняется реальный `POST https://api.yookassa.ru/v3/payments`:
• `web/android` -> `confirmation.type=embedded`, `confirmation.locale=ru_RU`, ответ содержит `confirmationToken`, `paymentMode=widget`;
• `ios` -> `confirmation.type=redirect`, `confirmation.locale=ru_RU`, ответ содержит `paymentUrl`, `paymentMode=redirect`;
• `mobile web` может явно запрашивать `paymentMode=redirect` (fallback для стабильного 3DS UX на узких экранах).
• Для подписочного checkout включено безусловное сохранение метода оплаты: `save_payment_method=true` + `merchant_customer_id=<userId>`.
• `paymentUrl` и `confirmationToken` не считаются подтверждением оплаты; факт оплаты подтверждается только серверной верификацией.

• Trial-scheduled billing (оплата в конце trial):
• В `users` добавлены поля планового биллинга trial: `billing_plan_id`, `billing_period`, `next_charge_at`, `billing_collection_status`, `grace_ends_at`, `billing_reminder_sent_at`, `payment_method_*`, `billing_locked_*`.
• Для хранения истории карт добавлена таблица `user_payment_methods` (`active/archived`, `is_default`), а в `users` расширены поля карточных реквизитов (`payment_method_card_*`).
• Для идемпотентности попыток создана таблица `billing_charge_attempts` (`charge_attempt_key` unique, `attempt_count`, `auto_attempt_count`, retry/lock поля).
• `POST /api/subscriptions/start-checkout` получил новые action:
• `bind_payment_method_required` — нужен шаг привязки метода оплаты;
• `trial_scheduled` — выбранный платный план зафиксирован, списание пойдёт в `trialEndsAt`, немедленного платежа нет.
• Пока `trialActive=true`, effective-access всегда `Premium` (даже если будущий план для списания выбран `PRO`); выбор `billingPlan` влияет только на пост-trial списание.
• В Trial (при `trialActive=true`) выбор `Pro/Premium` больше не возвращает `scheduled_downgrade` и не создаёт `pending` checkout.
• Добавлен endpoint `POST /api/subscriptions/bind-payment-method` для отдельного bind-flow через YooKassa `payment_methods` (без немедленного списания).
• `POST /api/subscriptions/bind-payment-method` поддерживает `force=true` для замены текущей карты (новая становится default).
• Добавлен endpoint `POST /api/subscriptions/payment-method/unbind` для отвязки карты (текущая карта уходит в `archived`) с обязательной очисткой trial-scheduled полей (`billing_plan_id`, `billing_period`, `next_charge_at`, `billing_collection_status`, `grace_ends_at`) — это отменяет будущее списание.
• `GET /api/subscriptions/current` при `payment_method_binding_status='pending'` выполняет серверную sync-проверку binding в YooKassa и подтягивает карту в локальный профиль без повторного checkout.
• Webhook `/api/payments/yookassa/webhook` расширен:
• обработка `payment_method.*` (финализация привязки карты);
• обработка `chargeType=trial_scheduled` для финализации рекуррентных списаний (success/fail) по `chargeAttemptKey`.
• Добавлен `POST /api/subscriptions/retry-charge` для ручного повтора списания при `past_due` (идемпотентный flow по `chargeAttemptKey`).
• Добавлен фоновый плагин `server/plugins/trial-billing-worker.ts`:
• запуск плановых списаний в `next_charge_at`;
• policy retry `0h/+6h/+24h` через `auto_attempt_count`;
• перевод в `past_due` + `grace_ends_at=+48h` при неуспехе;
• авто-откат trial-billing состояния в Basic после истечения grace.
• Reminder за 24 часа реализован в том же worker:
• push обязателен (`sendToUser`);
• email опционален (`sendBillingReminderEmail`) только при `email_verified_at` + `marketing_consent_at`;
• антидублирование через `users.billing_reminder_sent_at`.

• `/api/subscriptions/current`:
• возвращает `scheduledChange`;
• возвращает `trialEndsAt`, `currentEntitlementsPlan`, `billingPlan`, `billingPeriod`, `nextChargeAt`, `paymentMethodBound`, `billingCollectionStatus`, `graceEndsAt`;
• при отсутствии активной подписки всегда отдает effective Basic-entitlements и `noActiveSubscription=true`;
• не поднимает paid-entitlements из `pending/expired/canceled` записей.

• `POST /api/subscriptions/scheduled-change/cancel` очищает `users.scheduled_*` и отменяет запланированную смену тарифа.

• YooKassa webhook:
• Каноничный endpoint: `POST /api/payments/yookassa/webhook`.
• Подлинность уведомления подтверждается через `GET /v3/payments/{payment_id}` (Basic Auth `shopId:secretKey`).
• IP allowlist используется как мягкая проверка; источник истины — verify ответ API YooKassa.
• `WEBHOOK_SIGNING_SECRET` в текущем контуре не используется.
• Верифицируются сумма/валюта против `user_subscriptions.checkout_*`.
• Идемпотентность webhook: PK `payments.id` + `ON CONFLICT DO NOTHING`.
• Инварианты:
• переход `pending -> active` только после валидного `payment.succeeded`;
• дубль webhook не приводит к повторной активации;
• повторно не начисляется `billingCreditGranted`;
• после активации новая подписка становится `active`, предыдущая `active` переводится в `expired`.

• UX/платформы (as-is):
• `app/pages/subscription.vue`:
• Trial countdown в UI показывается как `X дней Y часов осталось` (с fallback `меньше часа`), вычисляется от точного `trialEndsAt` и пересчитывается на клиенте каждую минуту (`@vueuse/core/useNow`).
• Web/Android: интегрирован YooKassa Widget (`checkout-widget.js`) во встраиваемом режиме (`customization.modal=false`) с рендером в наш `Dialog`-контейнер (controlled modal на стороне приложения).
• Checkout-диалог открыт в non-modal режиме (`Dialog modal=false`), чтобы 3DS-челлендж (который может монтироваться вне контейнера виджета) оставался интерактивным и не блокировался focus/pointer lock.
• Загрузка скрипта виджета вынесена в клиентский Nuxt plugin `app/plugins/yookassa-widget.client.ts` (single-flight загрузка + DI через `$yooKassaWidget`), а страница подписки использует только API плагина.
• Глобальные CSS-override внутренних классов `checkout-modal*` не используются; layout/overlay контролируются нашим `Dialog`, а виджет монтируется в выделенный DOM-контейнер.
• Контейнер виджета обёрнут в `rounded + overflow-hidden`, чтобы скругления верхних/нижних углов сохранялись в embed-режиме на всех viewport.
• Кнопка закрытия диалога использует стандартный визуальный стиль без явной рамки у кнопки (с принудительно тёмным цветом иконки для читаемости на белом фоне виджета); контейнер виджета имеет дополнительный верхний внутренний отступ для корректной визуальной дистанции от верхней границы.
• Для обычного web/android flow `return_url` у widget не используется; после оплаты статус синхронизируется через widget events (`success/fail`) + short polling.
• `return_url` используется только в redirect flow; флаг `externalFlow=1` добавляется только для iOS external flow.
• iOS native: внутренний checkout отключён; показывается только переход в web flow.
• Mobile web: используется redirect checkout (без in-page widget popup), чтобы избежать нестабильности 3DS-кнопок в iframe на узких экранах.
• После старта оплаты включён short polling с прогрессивным профилем: 1 сек первые 5 секунд, затем 3 сек, окно до 30 секунд.
• Ручная кнопка проверки статуса не используется; синхронизация статуса выполняется автоматически через widget/deeplink события и short polling.
• Добавлен серверный verify endpoint для polling: `GET /api/subscriptions/check-payment-status`.
• `check-payment-status` выполняет self-heal reconcile: при `providerStatus=succeeded`/`canceled` и локальном `pending` endpoint идемпотентно синхронизирует локальную подписку с фактическим состоянием платежа.
• Критичный инвариант polling: фронт подтверждает оплату только по целевой checkout-подписке (`subscriptionId` из `start-checkout`/`return_url`), а не по `currentSubscription`, чтобы старая `active` подписка не давала ложный success.
• `GET /api/subscriptions/check-payment-status` поддерживает точечную проверку по `subscriptionId` вне зависимости от текущего `payment_status` записи; для non-pending статусов endpoint возвращает фактический локальный статус без выбора «последней pending» записи.
• `app/plugins/subscription-sync.client.ts`:
• синхронизация подписки работает только по оплатным событиям (event-driven), без авто-refresh при `visibilitychange/appStateChange`;
• обработка deep link возврата через `App.addListener('appUrlOpen', ...)`;
• при `payment-success` всегда диспатчится событие `mentala:payment-return`;
• если открыт `/subscription`, глобальный sync не запускается (страница сама выполняет polling);
• для остальных маршрутов deep-link sync выполняется в single-flight режиме: refresh current -> pending polling (если нужен) -> refresh entitlements + `/api/user/me`.
• `app/pages/payment/success.vue`:
• web success-страница с кнопкой `Вернуться в приложение` (`mentala://payment-success?...`);
• CTA deep-link показывается только для mobile external flow (`externalFlow=1`), в обычной web-версии показывается возврат на `/subscription`.
• отображает состояние оплаты и запускает polling.
• `GET /api/subscriptions/current` отключил HTTP-кэш (`Cache-Control: private, no-store`) для исключения stale-статуса после успешной оплаты.

• iOS external auth bridge (as-is):
• `POST /api/auth/external-session/create` выдаёт одноразовый transfer-token.
• Для dev на реальных устройствах добавлен клиентский override `appUrl` (вычисляется через `useExternalFlowAppUrl`): приоритет `NUXT_PUBLIC_DEVICE_APP_URL` на native/dev, затем `window.location.origin`.
• Серверные endpoint’ы redirect-flow (`external-session/create`, `start-checkout`, `bind-payment-method`) используют `resolveExternalFlowAppUrl`: в dev принимают `appUrl` override, в production игнорируют несовпадающий override и остаются на серверном `appUrl`.
• Для iOS speech-to-text в `ios/App/App/Info.plist` обязательны privacy-ключи `NSSpeechRecognitionUsageDescription` и `NSMicrophoneUsageDescription`; без них приложение падает при `SpeechRecognition.requestPermissions()`.
• `GET /auth/external-session/consume?token=...`:
• валидирует токен;
• атомарно помечает его consumed;
• создаёт web cookie-сессию (`mentala.sid` + CSRF);
• редиректит на целевую страницу (`/subscription` по умолчанию).
• Для bridge добавлена таблица `external_auth_tokens` (хранится только `token_hash`, TTL, consumed-аудит).
• Fingerprint-check риск-ориентированный:
• одиночный UA mismatch не блокирует flow;
• hard reject только на high-risk комбинациях (например, критичный UA+IP mismatch) + security audit.

• Hardening roadmap (дальше без ломки контрактов):
• `checkoutStatus` (`in_progress/manual_review/closed`) и операционные админ-операции approve/reject.
• Reconciliation pending-подписок по verify API YooKassa (cron/job).
• `pending_ttl_hours` и авто-закрытие зависших pending с возвратом резерва.
• Усиление гарантии "не более одной active подписки на пользователя" (индекс/блокировки в критических транзакциях).
• До интеграции recurring provider-cancel `POST /api/subscriptions/cancel` остаётся soft cancel (`autoRenew=false` в нашей модели).

• Вне текущего scope (не считать реализованным):
• runtime-маршрутизация `apple_iap / google_play / ios_external`;
• iOS External Link entitlement как рабочий production flow;
• server-side merge entitlement между несколькими провайдерами (`max(expire_at)` по источникам).

• Доступ к AI и лимиты:
• Сервер жёстко проверяет доступ к AI и недельный лимит минут (с overdraft `WEEKLY_OVERDRAFT_MINUTES`).
• `/api/therapy/session/start` откажет, если нет доступа к AI или лимит исчерпан.
• `/api/chat/stream` требует `therapySessionId`, обновляет `last_activity_at` на сервере и проверяет лимиты перед запросом к LLM.
• Поведение stream-лимитов (as-is): проверка выполняется перед стартом генерации; активный ответ не обрывается посреди потока; блок ставится только на новые ответы после завершения/закрытия текущей сессии.
• Для `PRO` действует жёсткий лимит минут (`100 мин/нед`); для `Premium` действует единый fair-use guardrail (`900 мин/нед`).
• `textSource=ai` для уведомлений допускается на `PRO/Premium`; для `Basic` — только `templates` с жёсткой server-side проверкой на запись prefs.
• Технический anti-abuse считается только по успешно отданным AI-ответам; провайдерные ошибки/таймауты не должны списывать лимиты.
• Контракт ответа `/api/subscriptions/current`: `features.aiChatMode = disabled|limited|unlimited_fair_use`; `features.weeklyMinutesLimit = number|null` (`null` для unlimited); `features.fairUseGuardMinutesPerWeek` задан только для `unlimited_fair_use`.
• Контракт ошибки лимита унифицирован: `HTTP 402`, `code=premium_fair_use_limit_reached`, `message`, `nextResetAt` (включая SSE-ветку `/api/chat/stream`).
• Suggested replies (чипы): возвращаются отдельным финальным SSE‑чанком в `/api/chat/stream` перед `[DONE]`, формат и поля описываются в Zod‑DTO.
• Клиентский SSE‑парсер буферизует чанки и разбивает по пустой строке, чтобы не терять события при разрезании данных по сети.
• Relay‑клиентский SSE‑парсер использует TextDecoder для корректной UTF‑8‑декодировки через границы чанков (иначе возможны пропуски дельт на кириллице).
• Suggested replies: при разборе ответа нормализуем `null` в полях `action/params`, чтобы Zod‑валидация не отбрасывала валидные чипы.
• Генерация чипов: сервис `suggested-chips.service.ts` с анти‑повторами (in‑memory store последних N=30 на сессию), без fallback‑чипов, с одним ретраем.
• Summary сессий сохраняется только при наличии достаточных ответов пользователя; без фактов из сообщений пользователя summary не генерируется.
• Welcome‑приветствия в повторных сессиях формулируются нейтрально и не утверждают факт обсуждения конкретной темы.

• Миграции (Drizzle):
• Меняем `server/infrastructure/db/schema.ts` → запускаем `pnpm db:generate` → `pnpm db:migrate`.
• Миграции для подписок/биллинга: `0005_*` (база), `0006_*` (payments/idempotency/billing*period/last_activity_at), `0007_*` (checkout-поля + response_json), `0049_*` (external auth tokens + `idempotency_keys.request_hash`), `0050_*` (`users.scheduled_*` для downgrade scheduling), `0051_*` (trial-scheduled billing: `users.billing_*` + `billing_charge_attempts`).

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
• `notification-slots-generation` — генерация слотов уведомлений. Для production применяется масштабируемая модель из `.docs/notification_slots_scaling_tz.md`: sharded enqueue с cursor/cycle state в Postgres, критерий регенерации по `planned+queued` + `min_horizon_hours`, `queued` при регенерации не удаляются, backpressure по queue lag (SLO/soft/hard пороги).
• Scheduler enqueue фильтрует только существующих пользователей (`INNER JOIN users`), чтобы не создавать циклические `slotsgen`-джобы по осиротевшим `notification_preferences`.
• `notification-delivery` — отправка уведомлений через FCM
• `ai-text-pool-refill` — пополнение пула AI-генерированных текстов
• Воркеры запускаются автоматически через плагин `server/plugins/bullmq-workers.ts`.
• Для production process split обязателен: `scheduler (enqueue)` / `slots worker` / `delivery worker`.
• Конфигурация: `BULLMQ_ENABLE_WORKERS` (по умолчанию `true`, для масштабирования можно отключить на web-контейнерах).
• Реализован scheduler-state слой в БД:
• `slots_scheduler_cursor(shard PK, last_user_id, cycle_id, updated_at)` — курсор инкрементального обхода по shard.
• `slots_scheduler_state(id='global', global_cycle_id, next_shard, completed_shards, updated_at)` — глобальное состояние цикла и round-robin.
• Реализован dedup контракт jobs:
• `jobId = slotsgen:{userId}:{cycle_id}`.
• Перед постановкой проверяется наличие job с тем же `jobId` в любом состоянии (чтобы исключить `already exists` и повторный enqueue одного цикла).
• При lock/timeout текущая active job переводится в delayed через `moveToDelayed(..., token)` + `DelayedError` (без смены `jobId` и `cycle_id`).
• Реализованы DB-инварианты для идемпотентности и производительности:
• partial index `idx_notification_preferences_enabled_user` на `notification_preferences(user_id) where enabled=true`.
• partial unique index `uk_notification_slots_active` на `(user_id, kind, entity_key, scheduled_at) where status in ('planned','queued')`.
• Безопасная регенерация slots:
• диапазон пересоздания вычисляется как `regen_range_start = now + max(SLOTS_REGEN_SAFE_WINDOW_MINUTES, SLOTS_SAFE_QUEUED_WINDOW_MINUTES)` и `regen_range_end = now + SLOTS_TARGET_HORIZON_HOURS`.
• автопереген в фоне запускается только при почти пустом горизонте: `activeSlots=0` или `actualSlotsByHours < SLOTS_MIN_HORIZON_HOURS` (по умолчанию 2 часа).
• `thresholdPercent` (`expectedSlots` vs `actualSlots`) сохраняется как диагностическая метрика, но не используется как самостоятельный триггер фоновой регенерации.
• в регенерации удаляются только `planned` слоты в диапазоне; `queued` никогда не удаляются.
• вставка новых `planned` выполняется через upsert `ON CONFLICT DO NOTHING` по active-уникальности.
• межпроцессная координация регенерации — через PostgreSQL transaction-level lock: `pg_try_advisory_xact_lock(user_id, LOCK_NAMESPACE_SLOTS_GENERATION)` с таймаутом `SLOTS_LOCK_TIMEOUT_MS`; при contention задача уходит в delayed backoff.
• В delivery state-machine запрещён переход `queued -> planned`:
• `planned -> queued` выполняется через конкурентно-безопасный `UPDATE ... WHERE status='planned' RETURNING`.
• при ошибке постановки в очередь статус переводится в `failed`, а не откатывается в `planned`.
• Реализован runtime backpressure для scheduler:
• soft mode (`queue_lag >= 5m` или queue depth > X): уменьшается batch, увеличивается интервал, включается `only_users_below_horizon`.
• hard mode (`queue_lag >= 15m`): агрессивное снижение нагрузки, восстановление к baseline через `SLOTS_BACKPRESSURE_RECOVERY_CYCLES`.
• Централизованный конфиг scaling находится в `server/application/notifications/slots-scaling.config.ts` (feature flags + `SLOTS_*` env + lock namespace).
• Алгоритм построения дневной последовательности слотов вынесен в `server/application/notifications/daily-sequence.utils.ts` и обязан сохранять точные квоты `remainingSlots` по каждому `kind:entityKey`.
• В anti-repeat логике запрещены внутригрупповые подмены источников (только межгрупповые), чтобы не допускать дрейфа квот и появления 6+ слотов на одну тему при AI-регенерации.
• Назначение времени для auto-слотов использует глобальные фазы источников в рамках дня (`buildSourcePhaseMap`), чтобы равномерно размазывать темы по окну и избегать пиков в одинаковых минутах (например, массовых `09:00` / `22:30`).
• Fixed/manual слоты остаются неизменяемыми: фазовое распределение и джиттер применяются только к гибким (auto) слотам.
• Payload: JSON-структуры, совместимые между системами.
• Retry механизм: 3 попытки с exponential backoff (10 секунд между ретраями).
• Graceful shutdown: все воркеры корректно завершаются при получении SIGTERM/SIGINT.

⸻

🚀 Рекомендации для миграции в будущем 1. Использовать pg вместо postgres (шире поддержка). 2. Стандартизировать БД (snake_case, auto-increment PK). 3. Пароли сразу хранить в Argon2id. 4. Контракты API поддерживать в OpenAPI. 5. Все миграции хранить в SQL (чтобы Laravel мог накатывать). 6. Сохранять единый подход к логам.

⸻

📋 Связанные документы
• `.docs/notifications.md` - Полная документация по системе уведомлений (архитектура, API, настройка, тестирование)
• `.docs/notification_slots_preprod_stress_tz.md` - ВАЖНО! Предрелизный чеклист стресс-тестов и chaos-сценариев для нового slots scheduler/worker split
• `.docs/landing.md` - ТЗ лендинга (архитектура `apps/landing`, API и контентные ограничения)
• `.docs/mentai_tz_product.md` - Общие требования к продукту
• `.docs/mentai_tz_frontend.md` - Требования к фронтенду
• `.docs/mentai_tz_backend.md` - Требования к бэкенду
• `.docs/security_requirements.md` - Требования к безопасности

⸻

🌐 Лендинг (зафиксировано, 16 февраля 2026)
• Архитектура: отдельная сборка `apps/landing` (не внутри CSR-приложения `app/`), чтобы обеспечить корректный SEO-контур.
• Реализация лендинга находится в `apps/landing` (Nuxt), запуск: `pnpm landing:dev`, сборка сервера: `pnpm landing:build`, статический экспорт для деплоя: `pnpm landing:generate` (результат в `apps/landing/.output/public`).
• Для стабильного dev-резолва в multi-app режиме Nuxt CSS подключается абсолютным путём из `nuxt.config.ts` (через `fileURLToPath`), а не через alias `@` в массиве `css`.
• Рендеринг лендинга: `SSR + SWR (гибрид)` — серверный HTML для индексации + короткий SWR-кэш для производительности.
• Для домашней страницы лендинга включён route rule `swr` (короткий TTL), анимации и тяжелые эффекты работают как progressive enhancement с fallback для `prefers-reduced-motion`.
• Домены: `mentala.app` (лендинг) и `my.mentala.app` (продукт + API).
• Публичные API лендинга размещаются в текущем Nitro backend: `/api/landing/config`, `/api/landing/lead`.
• CORS в production конфигурируется через `ALLOWED_ORIGINS` (comma-separated) и должен явно включать `https://mentala.app` для вызовов `my.mentala.app/api/landing/*`.
• В development CORS и origin-check используют объединение `DEV_ALLOWED_ORIGINS` + локальных defaults (`http://localhost:3000/3001`, `127.0.0.1:3000/3001`) и нормализуют origins (без хвостового `/`), чтобы лендинг на `3001` стабильно работал с API на `3000`.
• `GET /api/landing/config` — источник истины release-режима; кэш-политика: `Cache-Control: public, max-age=60, stale-while-revalidate=120`.
• `POST /api/landing/lead` публичный: Zod-валидация DTO, honeypot, rate-limit (ip/email/ip+email), идемпотентность через `landing_leads.email_hash`, уведомления по email и в Telegram только для новых лидов.
• UI лендинга использует Tailwind + shadcn-паттерн компонентов; для выразительных эффектов применяются `gsap` (scroll reveal/scroll-driven motion) и `swiper` (сценарные карточки), с обязательным fallback без анимаций при reduced motion.
• Визуальная система лендинга смещена в более «мягкий» wellness-тон: чуть светлее фон, ослабленная контрастность фоновой сетки, акценты на базе продуктовой палитры (`cyan/emerald`) + деликатный warm glow.
• Блок `features-story` синхронизирует активный текст и экран телефона через `ScrollTrigger` (desktop): телефон пинится при достижении верхней зоны под хедером, переключение `1→2→3→4→5` происходит в момент, когда текущая карточка начинает уходить под хедер, а распин выполняется на 5-й карточке (по `endTrigger` последнего шага). Пин-враппер не используется как `flex`-контейнер, чтобы `pinSpacing` корректно увеличивал высоту секции и не давал следующему блоку наезжать.
• В `features-story` на mobile вместо статичного экрана используется свайп-карусель по всем 5 скринам телефона (`Swiper`), на desktop сохраняется scroll-driven синхронизация.
• В `features-story` используется единый набор из 5 карточек, синхронизированных со сменой экранов телефона; дублирующий нижний блок «возможностей» удалён, чтобы не размывать смысл.
• Для лендинга `landingApiBase` берётся из `NUXT_PUBLIC_API_SERVER_URL` (приоритетно), затем из `NUXT_PUBLIC_LANDING_API_BASE` (legacy fallback), и в крайнем случае из `http://localhost:3000`.
• `useLandingConfig` работает в fail-safe режиме: при недоступности `landingApiBase` (например, локально без backend) возвращается дефолтная конфигурация без падения SSR; в dev логируется только строковое сообщение (без non-POJO объекта ошибки).
• Юридический дисклеймер лендинга размещается отдельным центрированным блоком сразу под заголовком секции `Возможности Mentala` с ограничением ширины (`max-width`), чтобы не перегружать hero и сторителлинг-секцию.
• FAQ реализован как кастомный аккордеон с анимированным раскрытием/схлопыванием (transition по высоте и opacity) вместо нативного `details`.
• Для `apps/landing` добавлен локальный `tsconfig.json` (extends `./.nuxt/tsconfig.json`) с alias-путями, чтобы IDE корректно резолвила типы и импорты в подприложении.
• Антиспам v1 обязателен: rate-limit + honeypot для `POST /api/landing/lead`.
• Аналитика v1: Яндекс Метрика.
• Юридические ссылки на лендинге ведут на действующие документы в `my.mentala.app/legal/*`.
• Перед блоком тарифов добавлена секция `#why-mentala` («Почему Mentala удобно»): слева 4 карточки преимуществ (доступность в моменте, экономия времени/денег, без осуждения, всё в одном месте), справа блок «Границы и честность» (не заменяет специалиста + когда обращаться к врачу), внизу CTA-кнопка `Посмотреть тарифы` и ссылка `Как работает приватность` со скроллом к соответствующим секциям.
• Блок `#privacy` реализован как компактная секция: вводный заголовок, 3 короткие карточки понятным языком (личные диалоги, защита данных, ненавязчивая поддержка ИИ) и нижняя плашка с кратким правилом про email + ссылками на `Privacy Policy` и `Terms of Service` прямо в секции (дополнительно к футеру). Адаптив: mobile — 1 колонка, tablet — 2 колонки, desktop — 3 колонки.
• Контент тарифов на лендинге синхронизирован с продуктовой матрицей (`Basic 0 ₽`, `PRO 349 ₽`, `Premium 649 ₽`).
• Для `PRO` и `Premium` в UI карточек поддерживается переключение периода `месяц/год` со скидкой `-20%` в годовом варианте.
• В header лендинга обязательна ссылка `Тарифы`, которая ведёт к блоку `#landing-pricing`.
• Переход к `#landing-pricing` выполняется плавной прокруткой; для `prefers-reduced-motion: reduce` используется мгновенный переход без анимации.
• Источник истины по тарифным описаниям: `app/components/subscription/PlanCard.vue` + серверные сиды тарифов/доступов (`seed-subscription-plans.ts`, `seed-feature-access-policies.ts`).
• Адаптивность лендинга обязательна с ширины `320px`; кроссбраузерная поддержка — популярные desktop/mobile браузеры по матрице из `.docs/landing.md`.
• **CI/CD и деплой лендинга**: при пуше в `main`/`dev` workflow (`deploy-prod.yml`, `deploy-dev.yml`) выполняют **статический экспорт** лендинга (`pnpm landing:generate`) и деплой статики на сервер: rsync в `/var/www/landing/releases/<id>/`, атомарное переключение symlink `current`, хранение последних 5 релизов. Лендинг отдаётся Nginx (на хосте или в контейнере), Traefik маршрутизирует `mentala.app` на статику. Подробности — `.docs/landing_static_deploy_tz.md`.

⸻

Весь код должен работать на всех устройствах и браузерах, включая web, iOS и Android.

Для ассинхронных операций использовать async/await.

✅ Теперь этот architecture.md содержит и UI-правила, и описание фронтенда, и бэкенда, и секцию по безопасности, и дорожку на Laravel.

⸻

🎧 Аудио-платформы (обновлено, 24 февраля 2026)
• Для `NativeAudioService` зафиксировано платформенное разделение через профиль `app/services/audio/nativeAudio.platform.ts`.
• iOS стратегия loop: `play -> short prime -> loop`, чтобы сохранить отображение и управление в `MPNowPlaying`/Control Center при loop-треках.
• Android стратегия loop: прямой `loop()` без промежуточного `play()`, чтобы не ломать `seek` и прогресс из-за двойного старта.
• После `seek` используется окно стабилизации позиции (`pending seek settle window`): UI получает целевую позицию сразу, а запаздывающие регрессивные значения (`0`/старое время) временно игнорируются до подтверждения новой позиции.
• iOS fallback `seekWithPlayFallback` оставлен только для remote-источников iOS; на Android позиция после seek подтверждается событиями плагина, а не мгновенным `getCurrentTime()`.
• Для iOS loop-кеша приоритетно используется нативная загрузка `Filesystem.downloadFile` в `Directory.Cache` (без web CORS-ограничений); `fetch` оставлен только как резервный fallback. Задержка prime между `play` и `loop` на iOS обнулена, чтобы убрать слышимый стык на старте loop.
