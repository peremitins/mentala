# Архитектурные правила Mentala

## Общие принципы
- Безопасность по умолчанию: opt-in хранение истории, минимизация PII, шифрование, логи без sensitive данных
- Типобезопасность end-to-end: Zod-DTO в `shared/dto/*`, валидация на фронте и бэке
- Fail-soft UX: деградация AI/медиа → дружелюбные подсказки, интерфейс не ломается
- Обратимая эволюция: Clean/Hex Architecture, любую подсистему можно вынести

## API правила
- Команды (POST/PATCH/DELETE) — идемпотентны, Запросы (GET) — кэшируемы
- Тонкие хендлеры: только парсинг DTO → делегирование в `application/*`
- Идемпотентность: `Idempotency-Key` + таблица `idempotency_keys`
- Пагинация: `?page=1&limit=20&sort=-createdAt` → `{ items, page, limit, total }`
- Ошибки: `{ error: { code, message, details } }` — E_VALIDATION/E_AUTH/E_FORBIDDEN/E_RATE/E_NOT_FOUND/E_CONFLICT/E_UPSTREAM/E_UNKNOWN
- Rate-limit: по IP и пользователю, агрессивнее на AI/TTS/оплатах (429 + Retry-After)
- Наблюдаемость: `X-Request-Id`, Sentry + pino (без sensitive payload)

## Аутентификация
- Web: httpOnly cookie `mentala.sid` + CSRF (Double Submit Cookie)
- Mobile (Capacitor): `X-Session-Token` (CSRF не требуется)
- Сессия 7 дней с продлением, ротация ID при логине
- Guards: проверка ролей, принадлежности ресурсов (`owner_id`)

## Валидация и контракты
- Все ручки: Zod-схемы из `shared/dto/*` на вход и выход
- Строковые поля: сервер отдаёт ключи i18n, фронт — строки
- Изменение контрактов: обновляем DTO, сначала обратносовместимый сервер, затем фронт

## UI/UX
- Glassmorphism: backdrop-blur, полупрозрачные панели, AA не нарушается
- Headless: Radix Vue (поведение/a11y), стили — Tailwind/shadcn
- Все запросы через `useAPI()` / `$api`, состояния loading/error/empty обязательны

## Производительность
- LCP < 2.5s, TTI < 3s (mid-девайсы)
- Lazy-загрузка тяжёлых модулей, code-split страниц, brotli/gzip

## Очереди и медиа
- BullMQ для тяжёлых задач, идемпотентность через job-keys
- Production Redis не запускается без аутентификации: `REDIS_PASSWORD` обязателен, а сам Redis должен требовать пароль через `requirepass`/ACL
- Redis без пароля допустим только в local dev при bind на `127.0.0.1`
- Медиа: S3-совместимое хранилище, приватные по умолчанию, signed URL

## Логирование
- Аудит: who/what/when/where (без содержимого при saveHistory=false)
- Структурированные логи с request_id, Sentry для ошибок и перформанса
