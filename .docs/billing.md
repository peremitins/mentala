# Техническое задание: Биллинг Mentala (финальная консолидация)

**Дата:** 19 февраля 2026 г.  
**Версия:** 5.0  
**Статус:** Финальное ТЗ для реализации YooKassa в текущем репозитории  
**Приоритет источников:** при конфликте решений первичен `.docs/billing_add.md`

---

## 0. Правило приоритета и как читать документ

Этот документ объединяет:

1. Текущее состояние кода (`as-is`) в этом репозитории.
2. Целевые решения из `.docs/billing_add.md` (`to-be`) как обязательный приоритет.

Если есть пересечение и противоречие, применяется решение из `.docs/billing_add.md`.

Ключевые приоритетные решения из `.docs/billing_add.md`, обязательные для финальной архитектуры:

1. **Web + Android:** оплата через **YooKassa Checkout Widget** внутри интерфейса.
2. **iOS:** оплата только через **внешний браузер** (out-of-app flow), без WebView внутри приложения.
3. **Переход iOS -> Web:** пользователь должен попадать на web-оплату **без повторного логина**.

---

## 1. Что реально есть в коде сейчас (`as-is`)

### 1.1 Подписочный контур

1. Используются тарифы `basic/pro/premium`, статусы `active/pending/expired/canceled`, trial и entitlement-слой.
2. Команда оформления: `POST /api/subscriptions/start-checkout`.
3. Старт checkout требует `Idempotency-Key`, ответ кэшируется в `idempotency_keys`.
4. Сейчас для `toPay > 0` возвращается **mock `paymentUrl`**, без реального `POST /v3/payments`.
5. Для `toPay === 0` подписка активируется сразу внутри транзакции.

### 1.2 YooKassa webhook

1. Используется endpoint `POST /api/payments/yookassa/webhook`.
2. Входящий webhook верифицируется через `GET /v3/payments/{payment_id}`.
3. Идемпотентность webhook обеспечивается таблицей `payments` (PK=`payment.id`) + `ON CONFLICT DO NOTHING`.
4. Выполняются проверки суммы/валюты и переход `pending -> active`.

### 1.3 UI и платформы

1. Экран `/subscription` общий для платформ, без платформенной маршрутизации оплаты.
2. В `settings` есть переход «Управлять подпиской» на внутренний `/subscription`.
3. Composable `usePlatform` уже существует (`web/ios/android`).
4. Специальный iOS external purchase flow сейчас **не реализован**.

---

## 2. Финальная целевая модель (обязательная, с приоритетом `billing_add`)

### 2.1 Платформенная матрица

| Платформа           | Где платим                           | Технический канал                               | Обязательное правило                                |
| ------------------- | ------------------------------------ | ----------------------------------------------- | --------------------------------------------------- |
| Web                 | Внутри приложения (страница/модалка) | YooKassa Checkout Widget (`checkout-widget.js`) | Использовать `confirmation_token`                   |
| Android (Capacitor) | Внутри приложения                    | YooKassa Checkout Widget                        | Допускается WebView-контур приложения               |
| iOS (Capacitor)     | **Внешний системный браузер**        | Redirect на web-страницу оплаты                 | **Запрещено** проводить оплату в WebView приложения |

### 2.2 Политика iOS (App Store-safe)

1. В iOS приложении кнопка должна вести на внешний браузер и называться нейтрально: `Управление подпиской`.
2. В iOS клиенте нельзя строить flow «Купить за N ₽» внутри приложения для цифрового контента без IAP.
3. На iOS-экранах приложения не показывать агрессивный pricing CTA для внешней покупки.
4. Оплата и изменение тарифа на iOS выполняются на web-странице Mentala во внешнем браузере.

---

## 3. Финальный E2E-флоу

### 3.1 Web/Android (Widget flow)

1. Клиент отправляет `POST /api/subscriptions/start-checkout` с `planId`, `billingPeriod`, `Idempotency-Key`, `X-Platform`.
2. Сервер считает `toPay` с учетом `billingCredit`, создает/обновляет `pending` подписку.
3. Если `toPay === 0`, сервер сразу активирует подписку (`status=active`).
4. Если `toPay > 0`, сервер создает платеж в YooKassa с `confirmation.type=embedded`.
5. Сервер возвращает `confirmation_token` + `paymentId`.
6. Клиент открывает YooKassa Widget в модалке (`#payment-form`).
7. Доступ активируется только после webhook verify на сервере.

### 3.2 iOS (External browser flow)

1. Пользователь в приложении нажимает `Управление подпиской`.
2. Приложение запрашивает у backend одноразовый токен web-авторизации.
3. Открывается внешний системный браузер по URL Mentala с этим токеном.
4. Web backend валидирует токен, создает web cookie-сессию (`mentala.sid`) и редиректит на страницу оплаты/подписки.
5. Дальше checkout идет на web-странице Mentala; для оплаты используется YooKassa (widget/redirect по реализации web-экрана).
6. Пользователь не должен логиниться повторно.

### 3.3 Возврат пользователя в приложение после web-оплаты (обязательно)

1. На web success-странице после оплаты должна быть явная кнопка `Вернуться в приложение`.
2. Кнопка должна использовать deep link (`mentala://payment-success?subscriptionId=...`) или universal link.
3. В мобильном приложении обрабатывается входящий URL через `App.addListener('appUrlOpen', ...)`.
4. После возврата в приложение запускается принудительное обновление подписки (`GET /api/subscriptions/current` + refresh entitlements).
5. Если статус еще `pending`, UI должен показать состояние `Оплата обрабатывается`, а не ошибку.

---

## 4. API-контракты (финальные)

### 4.1 `POST /api/subscriptions/start-checkout` (основная команда)

`start-checkout` остается главным endpoint текущего проекта.  
В терминах `.docs/billing_add.md` шаг `create payment` выполняется внутри этого endpoint (или вынесенным сервисом без изменения внешнего контракта).

**Request body**

```json
{
  "planId": "premium",
  "billingPeriod": "month"
}
```

**Headers**

1. `Idempotency-Key` (обязателен).
2. `X-Platform` (`web|ios|android`) для платформенного платежного сценария.

**Response (единый формат)**

```json
{
  "subscriptionId": 123,
  "amount": 899,
  "toPay": 899,
  "creditApplied": 0,
  "creditGranted": 0,
  "status": "pending",
  "paymentProvider": "yookassa",
  "paymentId": "2d4f...",
  "paymentMode": "widget",
  "confirmationToken": "ct_xxx",
  "paymentUrl": null
}
```

Правила ответа:

1. `toPay === 0` -> `status=active`, `paymentMode=none`, `paymentId/confirmationToken/paymentUrl = null`.
2. `web/android` + `toPay > 0` -> `paymentMode=widget`, обязателен `confirmationToken`.
3. `ios` + `toPay > 0` -> `paymentMode=redirect`, обязателен `paymentUrl` (URL на web checkout во внешнем браузере).
4. `paymentUrl` не является подтверждением оплаты.

### 4.2 `POST /api/payments/yookassa/webhook` (каноничный endpoint)

1. Принимает уведомления YooKassa.
2. Проверяет платеж через YooKassa API (`GET /v3/payments/{payment_id}`).
3. Для `payment.succeeded`:
   - валидирует сумму/валюту;
   - применяет идемпотентность;
   - активирует `pending` подписку;
   - начисляет/возвращает кредиты по правилам.
4. Для `payment.canceled`:
   - переводит подписку в `canceled`;
   - возвращает зарезервированный кредит.
5. На текущем этапе верификация webhook выполняется через `GET /v3/payments/{payment_id}` + IP allowlist (мягкая проверка).
6. `WEBHOOK_SIGNING_SECRET` в текущий scope **не входит** (не усложняем контур без необходимости).

Совместимость с `.docs/billing_add.md`:

1. Эндпоинт из add-документа `POST /api/payments/webhook` трактуется как логический синоним.
2. В кодовой базе каноничным остается `POST /api/payments/yookassa/webhook`.

### 4.3 Новый контур автоавторизации iOS -> web (обязательно)

#### 4.3.1 `POST /api/auth/external-session/create`

Назначение: выдать **одноразовый короткоживущий токен** перехода из мобильной сессии в web cookie-сессию.

Минимальные требования:

1. Авторизация обязательна (действующая мобильная сессия).
2. TTL токена: 60-120 секунд.
3. Токен одноразовый (`consumed_at`), повторное использование запрещено.
4. В URL передается только transfer-token, не `X-Session-Token`.

#### 4.3.2 `GET /auth/external-session/consume?token=...`

Назначение: на web-стороне поглотить токен, создать cookie-сессию и редиректить на `/subscription` или `/billing`.

Минимальные требования:

1. Токен валидируется, помечается как использованный в одной транзакции.
2. После успешного consume устанавливаются `mentala.sid` и CSRF-cookie.
3. Выполняется редирект на целевую страницу оплаты.
4. После успешного consume токен повторно использовать нельзя (hard fail `401/403`).

---

## 5. Модель данных и миграции

### 5.1 Уже используемые таблицы

1. `subscription_plans`
2. `user_subscriptions`
3. `subscription_events`
4. `payments`
5. `idempotency_keys`

### 5.2 Обязательные поля/инварианты checkout

1. `user_subscriptions.checkout_amount`
2. `user_subscriptions.checkout_currency`
3. `user_subscriptions.billing_credit_applied`
4. `user_subscriptions.billing_credit_granted`
5. `user_subscriptions.yookassa_payment_id`

### 5.3 Новое хранилище для iOS external auth (обязательно)

Добавить таблицу одноразовых токенов перехода (например `external_auth_tokens`):

1. `id`
2. `user_id`
3. `token_hash` (храним только hash)
4. `expires_at`
5. `consumed_at`
6. `created_at`
7. `ip/user_agent` для аудита

### 5.4 Hardening-поле (следующий этап)

Добавить `user_subscriptions.checkout_status`:

1. `in_progress`
2. `manual_review`
3. `closed`

С `NOT NULL DEFAULT 'in_progress'` и backfill существующих записей.

### 5.5 Правило миграций в проекте

При изменении схемы:

1. Правим `server/infrastructure/db/schema.ts`.
2. Выполняем `pnpm db:generate`.
3. Выполняем `pnpm db:migrate`.

---

## 6. Критичные инварианты безопасности и консистентности

1. Активация подписки только после серверного verify платежа.
2. `paymentUrl`/редирект никогда не считается фактом оплаты.
3. Один `payment.id` -> одна финализация.
4. Дубли webhook не дают повторной активации/начислений.
5. `amount/currency` mismatch не активирует подписку.
6. Для одного пользователя одновременно не более одной актуальной `active` подписки.
7. Для активного checkout-процесса не более одной `pending` подписки с `yookassa_payment_id`.
8. `Idempotency-Key` с другим payload (`planId/billingPeriod`) должен возвращать `409`.
9. Секреты и session-токены не попадают в URL, логи и клиентские хранилища web.
10. External auth токен одноразовый и короткоживущий.
11. External auth токен привязывается к fingerprint запроса: `User-Agent` + IP-risk-check.
12. Проверка fingerprint должна быть риск-ориентированной, а не агрессивной: изолированный `User-Agent mismatch` (например, iPad Safari в desktop-режиме) не должен блокировать легитимного пользователя автоматически.
13. Hard reject обязателен для явных high-risk кейсов (expired/consumed token, критический fingerprint mismatch, reuse), все такие случаи пишутся в security audit.

---

## 7. Требования к frontend

### 7.1 Общие

1. Использовать `usePlatform` для выбора сценария оплаты.
2. Все async операции через `async/await` + `try/catch`.
3. Перед доступом к браузерным API проверять доступность (`typeof window !== 'undefined'` и т.д.).

### 7.2 Web/Android

1. Ленивая загрузка `https://yookassa.ru/checkout-widget/v1/checkout-widget.js`.
2. Отрисовка виджета в контейнере (например `<div id="payment-form"></div>`).
3. После возврата/закрытия виджета обязательно обновлять статус через `GET /api/subscriptions/current`.
4. Если webhook еще не дошел, показывать статус `Оплата обрабатывается`.
5. После старта оплаты включать short polling статуса подписки с прогрессивным интервалом: первые 5 секунд — каждые 1 сек, затем каждые 3 сек до 30 секунд (или до `active`).
6. Если за окно polling статус не изменился, оставлять `pending`-экран с кнопкой ручного `Проверить оплату`.

### 7.3 iOS

1. В settings использовать CTA `Управление подпиской`.
2. CTA открывает внешний браузер (default browser app), не WebView.
3. Для Capacitor использовать открытие именно во внешнем браузере (`@capacitor/inappbrowser` -> `openInExternalBrowser`).
4. Не использовать `@capacitor/browser` для этого сценария на iOS, так как он использует `SFSafariViewController` (in-app system browser).
5. После возврата по deep link запускать short polling статуса подписки с тем же прогрессивным профилем (1 сек первые 5 секунд, затем 3 сек, общее окно до 30 секунд).
6. Не использовать внутри iOS приложения кнопку вида `Купить Premium за ...`.
7. На iOS в приложении показывать описание преимуществ тарифа без прямого ценового checkout CTA.

---

## 8. Требования к backend

### 8.0 Окружение (Environment Variables)

Обязательные переменные для текущего этапа:

1. `NUXT_YOOKASSA_SHOP_ID` — Shop ID YooKassa (test/prod в зависимости от окружения).
2. `NUXT_YOOKASSA_SECRET_KEY` — секретный API-ключ YooKassa для серверных запросов (`POST /v3/payments`, `GET /v3/payments/{id}`).
3. `NUXT_YOOKASSA_TEST_MODE` — флаг тестового режима (`true|false`).

Операционные переменные/параметры:

1. `YOOKASSA_WEBHOOK_URL` (ops-параметр, не runtime переменная приложения) — полный URL webhook в кабинете YooKassa: `https://my.mentala.app/api/payments/yookassa/webhook`.

Что **не вводим** в этой фазе:

1. `WEBHOOK_SIGNING_SECRET` / `YOOKASSA_WEBHOOK_SECRET` — не используется в текущей архитектуре.
2. Верификация webhook остается через серверный verify-запрос к YooKassa API и IP allowlist.

### 8.1 Обязательный минимум (этап запуска YooKassa)

1. В первую очередь отключить mock-ветку checkout в runtime (никаких заглушечных `paymentUrl` для боевого сценария).
2. В `start-checkout` включить реальный `POST /v3/payments`.
3. Для `web/android` использовать embedded-подтверждение и отдавать `confirmation_token`.
4. Для `ios` использовать redirect-flow для внешнего браузера.
5. Сохранять `payment.id` в `user_subscriptions.yookassa_payment_id`.
6. Реализовать iOS external auth bridge (create/consume transfer-token).
7. Сохранить существующие правила reserve/refund `billingCredit` и идемпотентности.
8. Добавить endpoint/логику подтверждения оплаты для UI (`check-payment-status` или эквивалент server-side verify), чтобы polling не опирался только на локальные эвристики.

### 8.2 Hardening (обязательный следующий этап)

1. `checkout_status` + `manual_review` как операционный контур.
2. Reconciliation `pending` платежей через verify API YooKassa.
3. `pending_ttl_hours` + авто-закрытие зависших checkout.
4. DB/transaction защита от гонок (`single-active`, `single-pending`).

### 8.3 Дальнейший roadmap

1. Provider-level cancel recurring в `POST /api/subscriptions/cancel`.
2. Затем server-side мультипровайдерная маршрутизация (YooKassa/Stripe/IAP verify).

---

## 9. Критерии приемки

### 9.1 Web/Android

1. `start-checkout` при `toPay > 0` возвращает `paymentId + confirmationToken`.
2. Widget открывается и приводит к оплате без перезагрузки приложения.
3. После `payment.succeeded` подписка становится `active` только через webhook.
4. Дубли webhook не меняют итог повторно.
5. При задержке webhook UI корректно удерживает `pending` и обновляет статус через прогрессивный short polling без ложной ошибки.
6. В боевом режиме `start-checkout` не возвращает mock URL-редиректы внутреннего приложения как способ оплаты.

### 9.2 iOS

1. В приложении нет внутреннего checkout в WebView.
2. Кнопка `Управление подпиской` открывает внешний браузер.
3. Пользователь попадает на web-страницу оплаты без повторного логина.
4. Успешная оплата на web активирует подписку в мобильном приложении после синхронизации.
5. На web success-странице есть рабочая кнопка `Вернуться в приложение` (deep link / universal link).

### 9.3 Безопасность и отказоустойчивость

1. `amount/currency mismatch` не активирует подписку.
2. Повтор `Idempotency-Key` с тем же payload возвращает тот же ответ.
3. Повтор `Idempotency-Key` с другим payload -> `409`.
4. `pending`-висяки закрываются по TTL с корректным возвратом резерва.
5. External auth token не проходит при истечении TTL, повторном использовании или high-risk fingerprint mismatch.
6. Изолированный `User-Agent mismatch` (например iPad desktop mode) не блокирует легитимный flow без дополнительных risk-сигналов.

### 9.4 Идемпотентность UI-команд

1. Один `Idempotency-Key` = одна бизнес-команда checkout.
2. Ретрай той же команды (тот же `planId` + `billingPeriod`) выполняется с тем же ключом.
3. При смене тарифа/периода frontend обязан генерировать новый `Idempotency-Key`.
4. При закрытии виджета и повторном запуске той же покупки клиент сначала проверяет существующий `pending` checkout, чтобы не плодить «мусорные» заказы.

---

## 10. App Store review notes (операционные)

1. В metadata и review notes не использовать формулировки вида `дешевле на сайте`.
2. Позиционирование: кроссплатформенный сервис, управление аккаунтом/подпиской доступно в web-версии.
3. Для iOS-сборки явно проверять, что используется внешний браузер, а не встроенный webview/system in-app browser.

---

## 11. Что вне текущего scope

1. Полноценный runtime-switch `apple_iap/google_play/yookassa` в production на этом этапе.
2. Merge entitlement из нескольких провайдеров как финальный production-механизм.
3. Полная IAP-валидация Apple/Google до отдельного этапа roadmap.

---

## 12. Связанные документы

1. `.docs/billing_add.md` — приоритетный источник решений по YooKassa и iOS external flow.
2. `.docs/subscription.md` — продуктовая матрица тарифов, лимиты, paywall и entitlement.
3. `.docs/architecture.md` — текущая архитектура и инварианты.
4. `.docs/arch_rules.md` — архитектурные правила команд/идемпотентности/безопасности.
5. `.docs/mentai_tz_frontend.md` — кроссплатформенность и frontend-ограничения.
6. `.docs/mentai_tz_backend.md` — backend-конвенции и API-подход.
7. `.docs/security_requirements.md` — базовые требования безопасности и приватности.
