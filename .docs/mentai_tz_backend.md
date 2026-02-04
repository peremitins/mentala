# Mentala — Техническое задание (Backend, Nitro BFF)

## 1. Роль

BFF на **Nitro (Nuxt 4 server)** — единая точка для фронтенда (Web/PWA/Capacitor). Позже возможно вынесение подсистем (например, биллинг на Laravel).

## 2. Архитектурный подход

Clean Architecture / Hexagonal внутри `mentai/frontend/server`:

- `domain/` (сущности), `application/` (use‑cases), `ports/` (контракты),
- `infrastructure/` (ORM/SDK/внешние адаптеры),
- `interface/http` (Nitro‑роуты) и `webhooks/`,
- `config/` (env, DI, security, observability).

## 3. Технологии

- Node 20+, TypeScript, Nitro.
- Drizzle ORM + Postgres (Neon), Redis (Upstash), BullMQ (очереди).
- R2 (S3‑совм.) для медиа.
- OpenAI, TTS/STT провайдер (Azure/ElevenLabs/Google), Stripe + IAP verify.
- JWT (access/refresh), Zod DTO (общие схемы), Sentry, pino.

## 4. Структура директорий

```
mentai/frontend/server/
├─ config/
├─ domain/
├─ ports/
├─ application/
├─ infrastructure/
└─ interface/
   ├─ http/...
   └─ webhooks/...
```

## 5. Конвенции API

- Base: `/api/*`, JSON. Версионирование через заголовок `X-API-Version: 1` (по мере роста `/api/v1/*`).
- Auth:
  - **Web:** httpOnly cookie `mentala.sid` + CSRF токен в cookie `mentala.csrf` (Double Submit Cookie паттерн)
  - **Mobile (Capacitor):** заголовок `X-Session-Token` (CSRF не требуется)
  - См. подробнее: [auth_tz.md](./auth_tz.md)
- Ошибки: `{ "error": { "code": "E_xxx", "message": "..." } }`.
- Пагинация: `?page=1&limit=20` → `{ items, page, limit, total }`.
- Идемпотентность: `Idempotency-Key` на чувствительных POST.
- DTO (Zod): общие в `mentai/frontend/shared/dto/*`.

## 6. Эндпоинты (MVP, кратко)

**Auth**

- `POST /api/auth/email/register` → `{ user, sessionToken? }` (sessionToken только для Capacitor)
- `POST /api/auth/email/login` → `{ user, sessionToken? }` (sessionToken только для Capacitor)
- `POST /api/auth/logout` → `{ success: true }`
- `POST /api/auth/logout-everywhere` → ревокация всех сессий
- OAuth: `GET /api/auth/google/start`, `GET /api/auth/google/callback` (аналогично для VK)

**User**

- `GET /api/user/me` → профиль/настройки
- `PATCH /api/user/update` → обновление профиля
- `GET /api/user/export` → создание job экспорта
- `POST /api/user/delete` → удаление аккаунта (запрос)

**Habits / Therapy**

- `POST /api/habits/create`, `GET /api/habits/list`, `PATCH/DELETE /api/habits/:id`
- `POST /api/therapy/log`, `GET /api/therapy/stats`

**AI / Voice / SOS**

- `POST /api/ai/chat` → `{ reply, sessionId, safety }`
- `POST /api/ai/tts` → `{ audioUrl, jobId }`
- `POST /api/ai/stt` → `{ text }`
- `GET/POST /api/sos/plan`

**Billing / Referrals**

- `GET /api/billing/products`, `POST /api/billing/subscribe`
- `POST /api/billing/iap/verify`, `POST /api/billing/stripe/webhook`
- `POST /api/referrals/create`, `GET /api/referrals/stats`, `POST /api/referrals/payouts/request`

## 7. Безопасность/Приватность

- Ротация refresh‑токенов; CORS только для доверенных origin; rate‑limit per IP/user.
- История чатов по умолчанию **off** (opt‑in), гибкие retention‑периоды.
- Аудит действий без содержания сообщений при `saveHistory=false`.
- Шифрование в транзите/на диске; хранение данных в регионе.

## 8. Миграции/Тесты

- Drizzle schema + миграции; Vitest + Supertest (интеграционные) для http‑роутов.
- Контрактные тесты на Zod‑DTO (FE/BE).

## 9. Масштабирование

- Вынос биллинга/сообществ в отдельные сервисы при росте.
- Коммуникация: REST/Webhooks, кэш Redis, трассировка Sentry/OTel.

## 10. SLA

- P95 < 200ms для базовых вызовов, 99.9% uptime, ежедневные бэкапы.
