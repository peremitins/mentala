# Подписки, биллинг и лимиты

## Таблицы

- `subscription_plans` — тарифы (basic/pro/premium), лимиты, фичи
- `user_subscriptions` — периоды подписок + статус (active/pending/expired/canceled)
- `subscription_events` — аудит (trial_started, purchase_success/failed, canceled...)
- `payments` — идемпотентность webhook по `payment.id` YooKassa
- `therapy_sessions` — учёт минут (started_at, last_activity_at, ended_at, duration_seconds)
- `trial_usage_tracking` — защита от злоупотребления Trial по email hash

## Тарифная матрица

| План    | Цена | AI-чат                            | Уведомления          | Особенности                   |
| ------- | ---- | --------------------------------- | -------------------- | ----------------------------- |
| Basic   | 0₽   | отключён                          | только шаблонные     | SOS + 2 дыхательные           |
| PRO     | 399₽ | 100 мин/нед                       | + AI-уведомления     | + полная библиотека медитаций |
| Premium | 899₽ | безлимит\* (fair-use 900 мин/нед) | + персональный стиль | + свои практики               |

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
- Предварительные напоминания о будущем списании не отправляются

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
- `roleId=support` трактуется как premium-equivalent доступ для review/QA: полный доступ к premium-фичам без покупки, но без административного доступа к чужим данным
- Premium-equivalent для `support` применяется независимо от текущей записи подписки (`basic/pro/premium`) при расчёте AI gate и feature access
- Для `native iOS` frontend во всех сборках отключает purchase-management surface: скрываются promo/referral, `/subscription`, `/settings/referral` и billing-подсказки в `Поддержке`. В `Настройки` блок `Подписка` остаётся видимым и показывает текст о переходе в веб-версию для изменения тарифа.
- Effective entitlements теперь считаются не только по paid subscription и trial, но и по `billing_access_grants`

## Промокоды

- Реализован internal promo/referral flow для `yookassa`: `.docs/arch_promo_codes.md`
- Новые billing-сущности:
  - `billing_access_grants`
  - `billing_discount_grants`
  - `billing_schedule_adjustments`
- `GET /api/subscriptions/current` может вернуть optional-блоки `promo` и `referral`
- `start-checkout`, `retry-charge`, `trial-billing-worker` и `scheduled-plan-change` используют единый discount-grant resolver
- `free_access_days` не трогает `trial`, а честно сдвигает billing-boundary через `billing_schedule_adjustments`
- Для `apple_iap` внутренние promo/referral controls и endpoints не используются
- Referrer reward уже переведён на `billing_credit_entries` + агрегированный `users.billingCredit`
- `billingCredit` участвует в расчёте платежа после proration/discount и до внешнего charge
- Invitee reward остаётся percentage discount на следующий qualifying payment
- Reward referrer выпускается после qualifying payment invitee и hold-периода, а не мгновенно при вводе кода
- Отдельный influencer / blogger / affiliate contour в эту итерацию не входит и будет проектироваться отдельно

## Apple IAP client confirm

- Клиент дедуплицирует `POST /api/subscriptions/apple/confirm` по `transactionId`, чтобы `purchase()` и `transactionUpdated` не создавали параллельные confirm-запросы.
- `HTTP 409` с текстом `This App Store subscription is already linked to another account` считается терминальной бизнес-ошибкой: запись не попадает в retry-очередь, pending confirm удаляется, локальная транзакция finish() вызывается без повторных backend retry.
- Retry-очередь остаётся только для временных ошибок сети/сервера.
- `Idempotency-Key` для Apple confirm строится из `transactionId` и отпечатка `signedTransactionInfo`, поэтому разные local/sandbox payload не делят один ключ по голому `transactionId`.
- Серверный `requestHash` для `/api/subscriptions/apple/confirm` учитывает только канонические поля транзакции (`transactionId` и `signedTransactionInfo`), а hint-поля вроде `storefrontCountryCode` и `appAccountToken` не создают ложный `409 conflict`.
- `appAccountToken` для Apple IAP выдаётся сервером и стабилен на уровне аккаунта Mentala, поэтому один и тот же пользователь может использовать подписку на iPhone и iPad без расхождения токенов между устройствами.
- Для `environment = Xcode` ownership-check не опирается на глобальный `originalTransactionId`, а скопивается `appAccountToken`, чтобы локальные StoreKit-тесты не конфликтовали из-за тестовых идентификаторов вроде `0`.
- Клиент не генерирует `appAccountToken` локально и подавляет глобальный API toast для `/api/subscriptions/apple/confirm`, чтобы ownership-conflict показывался один раз в понятном виде.

## iOS External Auth Bridge

- `POST /api/auth/external-session/create` → одноразовый transfer-token
- `GET /auth/external-session/consume?token=...` → cookie-сессия + redirect
- Return из YooKassa через `/payment-success`, TTL токена: 2 часа
- `.well-known/apple-app-site-association` и `assetlinks.json` для deeplink
- `my.mentala.app` отдаёт `.well-known/*` через runtime Nitro routes, а `mentala.app` — через prerender landing-сборки. Для landing env `IOS_APP_LINK_*` и `ANDROID_APP_LINK_*` должны попадать в CI на этапе `pnpm landing:generate`, иначе статические association-файлы будут пустыми или устаревшими.
