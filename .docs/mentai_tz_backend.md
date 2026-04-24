# Mentala — Backend ТЗ (Nitro BFF)

## Роль
BFF на Nitro (Nuxt 4 server) — единая точка для фронтенда (Web/PWA/Capacitor).

## Архитектура
Clean Architecture / Hexagonal:
```
server/
├─ config/          # env, DI, security
├─ domain/          # сущности
├─ application/     # use-cases (вся бизнес-логика)
├─ ports/           # контракты интерфейсов
├─ infrastructure/  # ORM, SDK, внешние адаптеры
├─ api/             # Nitro-роуты (тонкие хендлеры)
└─ middleware/       # CORS, Helmet, rate-limit
```

## Стек
Node 20+, TypeScript, Nitro, Drizzle ORM + PostgreSQL, Redis, BullMQ, OpenAI, YooKassa, Sentry, Pino

## API конвенции
- Base: `/api/*`, JSON
- Auth: Web — httpOnly cookie + CSRF, Mobile — X-Session-Token
- Ошибки: `{ error: { code, message } }`
- Пагинация: `?page=1&limit=20` → `{ items, page, limit, total }`
- Идемпотентность: `Idempotency-Key` на POST
- DTO: Zod, `shared/dto/*`
- AI chat consent хранится в профиле пользователя (`aiConsentAccepted`, `aiConsentAcceptedAt`, `aiConsentVersion`, `aiConsentLocale`) и должен проверяться перед вызовами OpenAI chat/realtime
- Email registration создаёт unverified user заранее (`email_verified_at = null`, `password_hash = null`), а финализация аккаунта происходит только на `/api/auth/email/verify`; если письмо не отправилось, API регистрации должно явно вернуть флаг сбоя доставки, чтобы клиент не открывал экран ввода кода

## Безопасность
- CORS whitelist из env, rate-limit per IP/user
- История чатов off по умолчанию (opt-in)
- Шифрование в транзите/на диске, данные в регионе

## SLA
- P95 < 200ms, 99.9% uptime, ежедневные бэкапы
