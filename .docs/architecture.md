# Архитектура Mentala — Обзор

## Стек
- **Frontend**: Nuxt 4 (Vue 3 + Composition API), Tailwind CSS 4, shadcn-vue (reka-ui)
- **Backend**: Nitro (Nuxt server engine), Drizzle ORM, PostgreSQL
- **Mobile**: Capacitor (iOS 13+, Android 8+) поверх Web-сборки
- **Очереди**: BullMQ 5.x (Redis), workers в `server/plugins/bullmq-workers.ts`
- **AI**: OpenAI Responses API (чат), Realtime API (голос), GPT (уведомления)
- **Платежи**: YooKassa (web/mobile), Apple StoreKit 2 (iOS IAP)

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
- `BULLMQ_ENABLE_WORKERS` для отключения на web-контейнерах
- Retry: 3 попытки, exponential backoff. Graceful shutdown по SIGTERM/SIGINT

## API контракты
- Валидация: Zod DTO (`shared/dto/`)
- Ошибки: `{ error: { code, message, details } }` — коды E_VALIDATION/E_AUTH/E_FORBIDDEN/E_RATE/E_NOT_FOUND/E_CONFLICT/E_UPSTREAM/E_UNKNOWN
- OpenAPI: zod-to-openapi, Swagger/Scalar UI

## Логирование
- Pino + Sentry, request_id/user_id/service/env всегда в логах

## Связанные документы
- [arch_chat_memory.md](arch_chat_memory.md) — чат, AI память, промпты
- [arch_billing.md](arch_billing.md) — подписки, оплата, trial
- [arch_notifications.md](arch_notifications.md) — уведомления, push
- [arch_ui_features.md](arch_ui_features.md) — практики, медитации, UI
- [arch_audio_platforms.md](arch_audio_platforms.md) — нативное аудио, платформы
- [crysis_prompt.md](crysis_prompt.md) — кризисный протокол
