# Подписки, биллинг и лимиты

## Таблицы
- `subscription_plans` — тарифы (basic/pro/premium), лимиты, фичи
- `user_subscriptions` — периоды подписок + статус (active/pending/expired/canceled)
- `subscription_events` — аудит (trial_started, purchase_success/failed, canceled...)
- `payments` — идемпотентность webhook по `payment.id` YooKassa
- `therapy_sessions` — учёт минут (started_at, last_activity_at, ended_at, duration_seconds)
- `trial_usage_tracking` — защита от злоупотребления Trial по email hash

## Тарифная матрица
| План | Цена | AI-чат | Уведомления | Особенности |
|------|------|--------|-------------|-------------|
| Basic | 0₽ | отключён | только шаблонные | SOS + 2 дыхательные |
| PRO | 399₽ | 100 мин/нед | + AI-уведомления | + полная библиотека медитаций |
| Premium | 899₽ | безлимит* (fair-use 900 мин/нед) | + персональный стиль | + свои практики |

## Trial
- Состояние пользователя: `users.has_used_trial`, `trial_started_at`, `trial_ended_at`
- При регистрации: Basic подписка; Trial = полный AI-доступ уровня Premium на 7 дней
- Идентификатор: `email_hash` (HMAC-SHA256 + pepper), email обязателен
- Длительность: `TRIAL_DURATION_HOURS` (default 168)

## Checkout
- `POST /api/subscriptions/start-checkout` + `Idempotency-Key`
- Policy: upgrade now, downgrade later
- `checkoutAction`: payment | activated | scheduled_downgrade | noop | bind_payment_method_required | trial_scheduled
- Web non-compact: YooKassa Widget (embedded), iOS/Android: redirect во внешний браузер
- Direct charge для привязанной карты, fallback в обычный checkout
- `save_payment_method=true` для подписочного checkout

## Trial-scheduled billing
- Поля в `users`: `billing_plan_id`, `billing_period`, `next_charge_at`, `billing_collection_status`, `grace_ends_at`
- Worker `trial-billing-worker.ts`: списание при `next_charge_at`, early-window 5 мин до дедлайна
- Retry policy: 0h/+6h/+24h, перевод в `past_due` + grace 48h, откат в Basic после grace
- Reminder за 24h: push + email (если есть), антидублирование через `billing_reminder_sent_at`

## YooKassa webhook
- `POST /api/payments/yookassa/webhook`
- Верификация через `GET /v3/payments/{id}` (Basic Auth), IP allowlist — мягкая проверка
- Инварианты: pending→active только после `payment.succeeded`, дубли не дают повторной активации

## Cancel
- Hard-cancel: выключает autoRenew, очищает scheduled/trial-billing поля
- Пытается отменить pending платежи в YooKassa
- Карту не отвязывает (для повторного включения автопродления)

## Лимиты AI
- PRO: жёсткий 100 мин/нед, Premium: fair-use 900 мин/нед
- Проверка перед стартом генерации, активный ответ не обрывается
- `HTTP 402`, `code=premium_fair_use_limit_reached`, `nextResetAt`
- TTS временно выключена: `FEATURE_TTS_ENABLED=false`

## Entitlements и paywall
- `feature_access_policies` в БД, отдаются через entitlement API
- Bootstrap: `GET /api/user/me` → `billing` (plan/trial/aiChatMode/entitlements)
- Lock/paywall: иконка тарифа + `FeaturePaywallModal` при клике
- Авто-fallback: без entitlement на AI-уведомления → сервер переводит в templates

## iOS External Auth Bridge
- `POST /api/auth/external-session/create` → одноразовый transfer-token
- `GET /auth/external-session/consume?token=...` → cookie-сессия + redirect
- Return из YooKassa через `/payment-success`, TTL токена: 2 часа
- `.well-known/apple-app-site-association` и `assetlinks.json` для deeplink
