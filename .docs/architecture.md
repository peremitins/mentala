# Архитектура Mentala — Обзор

## Стек

- **Frontend**: Nuxt 4 (Vue 3 + Composition API), Tailwind CSS 4, shadcn-vue (reka-ui)
- **Backend**: Nitro (Nuxt server engine), Drizzle ORM, PostgreSQL
- **Mobile**: Capacitor (iOS 13+, Android 8+) поверх Web-сборки
- **Очереди**: BullMQ 5.x (Redis), workers в `server/plugins/bullmq-workers.ts`
- **AI**: OpenAI Responses API (чат), Realtime API (голос), GPT (уведомления)
- **Платежи**: YooKassa (web/mobile), Apple StoreKit 2 (iOS IAP)

## Публичный landing

- Публичный сайт `mentala.app` живёт в `apps/landing` как отдельное Nuxt-приложение
- Ключевые публичные маршруты лендинга: `/`, `/support`, `/account-deletion`, `/go/android`
- Страница `/account-deletion` используется как публичный URL для store-review и объясняет:
  - как запросить удаление аккаунта;
  - какие данные удаляются в Mentala;
  - какие данные могут храниться ограниченный срок
- `/go/android` — стабильный first-party redirect для QR-кодов Android: сам QR кодируется в HTTPS-ссылку Mentala, а открытие `Google Play` происходит уже на устройстве; маршрут должен оставаться `noindex`
- Внутренние ссылки лендинга должны оставаться относительными (`/support`, `/account-deletion`), чтобы local dev и preview не уводили пользователя на production-домен
- Абсолютный origin для canonical/og на лендинге берётся из `NUXT_PUBLIC_LANDING_SITE_URL`, а при отсутствии переменной в local dev вычисляется из текущего request origin

## Mobile Build Pipeline

- `pnpm cap:sync` / `pnpm cap:sync:prod` — release/TestFlight путь: Nuxt bundle собирается из `.env.production`
- `pnpm cap:sync:device:wireless` — live reload для iPhone/Android без USB: app грузится с dev-сервера по LAN из `.env.development`
- Перед `cap sync` iOS Google OAuth URL scheme синхронизируется из `NUXT_PUBLIC_GOOGLE_IOS_CLIENT_ID`, чтобы Debug и Release не перетирали друг другу callback scheme
- iOS Firebase-конфиг унифицирован: Debug и Release используют один `ios/App/App/Firebase/GoogleService-Info.plist` из `mentala-prod`; отдельные dev/prod plist удалены, чтобы исключить конфликт project number / app id
- Mobile static/release сборки используют отдельный `buildDir`, чтобы активный `pnpm dev` не перетирал `.nuxt` и не ломал `client.manifest`
- Static generate для mobile помечается флагом `MENTALA_STATIC_GENERATE=true`; подмена `npm_lifecycle_event` запрещена, потому что она может превратить release bundle в dev-style HTML и дать белый экран в WebView
- После `nuxt generate` mobile release pipeline вычищает из bundle тяжёлые CDN-backed каталоги `meditations` и `notifications`: они не должны попадать в APK/IPA, потому что в рантайме резолвятся через `NUXT_PUBLIC_MEDIA_BASE_URL`
- Android release AAB собирается с `ndk.debugSymbolLevel = 'SYMBOL_TABLE'`, чтобы Play Console автоматически получал native symbols для диагностики crash/ANR
- R8/ресурсная оптимизация для Android release не завязаны на Play track автоматически: internal testing, closed testing и production используют один и тот же `release` build type. Поэтому финальная prod-оптимизация включается только явным флагом `MENTALA_ANDROID_ENABLE_MINIFY=true` или через `pnpm android:bundle:release:optimized` / `pnpm build:mobile:android:prod`
- Release-сборка валидирует обязательные mobile env (`NUXT_PUBLIC_API_SERVER_URL`, `NUXT_PRIVATE_API_BASE`, `NUXT_OAUTH_GOOGLE_CLIENT_ID`, `NUXT_PUBLIC_GOOGLE_IOS_CLIENT_ID`) и падает до публикации, если они не настроены
- Для server route нельзя полагаться на `cfg.public.googleWebClientId` как на источник истины для Google OAuth: этот ключ может быть зафиксирован на build-time. В backend-проверках сначала использовать server-only runtime/env (`cfg.OAUTH_GOOGLE_CLIENT_ID`, `process.env.*`), и только потом public fallback
- После `nuxt generate` release pipeline дополнительно сверяет фактический `window.__NUXT__.config.public` в iOS/Android bundle с `.env.production`, чтобы в Archive/TestFlight не ушёл IPA/APK со stale Google client id или неправильным `apiBase`
- В production backend CORS/origin allowlist обязан учитывать нативные origin-ы WebView: `capacitor://localhost`, а для Android release ещё и `http://localhost` / `http://127.0.0.1`, иначе preflight к API ломает login ещё до появления понятной ошибки в UI

## Version Compatibility и релизы

- В production у Mentala один backend и одна эволюционирующая schema БД; многоверсионный production runtime не является целевой архитектурой
- Mobile-клиент обязан передавать в API `X-App-Platform`, `X-App-Version`, `X-App-Build`
- Для v1 сервер управляет только `minimumSupportedBuild` отдельно для iOS и Android
- `X-App-Version` нужен для логов и диагностики, `X-App-Build` — для сравнения версии и enforcement
- В v1 используется только `required update`; `recommended update` не входит в базовую стратегию
- Повышение `minimumSupportedBuild` не делается автоматически на каждый релиз, а только для неподдерживаемых или аварийных build
- Release-ветки `release/*` допустимы для stabilization и hotfix, но не как модель нескольких production-версий сервера

## Структура сервера

```
server/
├─ config/          # env, keys
├─ domain/          # бизнес-сущности
├─ application/     # сервисы и use-cases (ВСЯ бизнес-логика здесь)
├─ infrastructure/  # Drizzle, Postgres, Redis, внешние провайдеры
├─ interface/       # порты для AI/TTS/STT/Storage
├─ api/             # тонкие Nitro-хендлеры: парсинг DTO → делегирование в application
└─ middleware/       # CSRF, Helmet, rate-limit, request-id
```

## БД (PostgreSQL)

- snake_case таблицы и поля, PK: BIGINT AUTO INCREMENT
- ORM: Drizzle — типобезопасность, SQL-миграции
- Схема: `server/infrastructure/db/schema.ts`
- Миграции: `pnpm db:generate` → `pnpm db:migrate` → `pnpm verify:schema`
- Seed: `pnpm seed:required` (роли, тарифы, каталог медитаций, шаблоны уведомлений)
- Пул: keepAlive + idle/connection timeouts; фоновые задачи пересоздают пул через `resetDbPool`

## Очереди BullMQ

- `notification-slots-generation` — генерация слотов (sharded, cursor/cycle, backpressure)
- `notification-delivery` — отправка через FCM
- `ai-text-pool-refill` — пополнение AI-текстов уведомлений
- `chat-session-summary` — summary сессий чата
- Production: обязателен process split (scheduler / slots worker / delivery worker)
- Production Docker Compose: web-контейнер ходит в Redis по `REDIS_HOST=redis`, `REDIS_PORT=6379`
- Production Redis требует аутентификацию через `REDIS_PASSWORD`; тот же секрет должен быть включён в `redis-server --requirepass ...`
- Local dev может использовать Redis без пароля только при bind на `127.0.0.1`
- `BULLMQ_ENABLE_WORKERS` для отключения на web-контейнерах
- Retry: 3 попытки, exponential backoff. Graceful shutdown по SIGTERM/SIGINT

## API контракты

- Валидация: Zod DTO (`shared/dto/`)
- Ошибки: `{ error: { code, message, details } }` — коды E_VALIDATION/E_AUTH/E_FORBIDDEN/E_RATE/E_NOT_FOUND/E_CONFLICT/E_UPSTREAM/E_UNKNOWN
- OpenAPI: zod-to-openapi, Swagger/Scalar UI

## Логирование

- Pino + Sentry, request_id/user_id/service/env всегда в логах
- Транзакционные SMTP-письма (auth verification / password reset) должны отправляться с явными SMTP timeout-ами и коротким retry только для transient socket-ошибок (`ESOCKET`, `ECONNRESET`, `ETIMEDOUT`, `ECONNECTION`, `EPIPE`), чтобы кратковременный обрыв сети не ломал auth-flow

## Связанные документы

- [arch_chat_memory.md](arch_chat_memory.md) — чат, AI память, промпты
- [arch_billing.md](arch_billing.md) — подписки, оплата, trial
- [arch_notifications.md](arch_notifications.md) — уведомления, push
- [arch_ui_features.md](arch_ui_features.md) — практики, медитации, UI
- [arch_audio_platforms.md](arch_audio_platforms.md) — нативное аудио, платформы
- [crysis_prompt.md](crysis_prompt.md) — кризисный протокол
