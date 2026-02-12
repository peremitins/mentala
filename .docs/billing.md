# Техническое задание: Биллинг (актуализировано под текущую кодовую базу)

**Дата:** 11 февраля 2026 г.  
**Версия:** 4.2 (Aligned with current implementation)  
**Статус:** Актуально для разработки и ревью  
**Охват (факт):** Web checkout через YooKassa для всех платформ (Web/iOS/Android)  
**Охват (план):** Добавление real checkout в YooKassa, затем Stripe + IAP verify

---

## 1. Зачем нужна актуализация

Предыдущая версия документа описывала гибридный сценарий (YooKassa SDK + Apple IAP + Google Play Billing + iOS External Link), но в текущем репозитории это **не реализовано как рабочий прод-флоу**.

Этот документ фиксирует:

1. Что уже работает в коде.
2. Какие инварианты и контракты нельзя ломать.
3. Какие шаги нужны для перехода к целевой гибридной модели без рассинхронизации архитектуры.

---

## 2. Текущее состояние (as-is)

### 2.1 Канал оплаты

- Оплата и смена тарифа выполняются через `YooKassa` (серверный checkout flow).
- На iOS/Android сейчас нет отдельного нативного платежного провайдера в runtime-логике.
- Мобильные клиенты работают с теми же API подписок, что и web.

### 2.2 Источник истины для доступа

- Доступ определяется **только сервером** по таблицам подписок и событий.
- Клиент не вычисляет entitlement локально.
- Статус подписки: `active | pending | expired | canceled`.
- Семантика статусов в текущей модели:
  - `pending` — ожидание оплаты (checkout создан, финализации еще нет);
  - `active` — доступ активен до `endDate`;
  - `canceled` — отменен именно pending-checkout (а не "доступ немедленно отключен");
  - `expired` — период закончился или подписка вытеснена новой активной.
- Сценарий "активна до конца периода, но автопродление выключено" в `as-is` выражается как `paymentStatus=active` + `autoRenew=false`.
- `to-be` (обязательное расширение): оставить `paymentStatus` как доменный статус доступа (`active | pending | expired | canceled`) и добавить отдельное операционное поле `checkoutStatus`.
- `manual_review` фиксируется именно в `checkoutStatus`, чтобы не смешивать доступ (`paymentStatus`) и инциденты обработки оплаты.

### 2.3 Идемпотентность и конкурентность

- `POST /api/subscriptions/start-checkout` требует заголовок `Idempotency-Key` (8..128).
- Идемпотентность хранится в `idempotency_keys` (ключ: `user_id + route + key`).
- TTL ключа по умолчанию: 24 часа (`DEFAULT_IDEMPOTENCY_TTL_MS`).
- Для повторов с тем же ключом:
  - если команда еще выполняется — возвращается `in_progress` (409),
  - если уже завершена — возвращается тот же сохраненный `response_json`.
- Просроченные записи очищаются при повторном обращении с тем же ключом (lazy cleanup).
- Webhook-защита от дублей: таблица `payments` (PK = `payment.id` YooKassa) + `ON CONFLICT DO NOTHING`.
- Hardening to-be (обязательный): если тот же `Idempotency-Key` приходит с другим payload (`planId`/`billingPeriod`), сервер должен вернуть `409` и не переиспользовать сохраненный результат.

---

## 3. Актуальный API-контракт

### 3.1 Клиентские endpoints подписок

- `GET /api/subscriptions/plans` — список тарифов.
- `GET /api/subscriptions/current` — текущая подписка пользователя.
- `GET /api/subscriptions/usage` — использование минут и лимитов.
- `POST /api/subscriptions/start-checkout` — запуск checkout.
- `POST /api/subscriptions/cancel` — **soft cancel**: отключение `autoRenew` для активной подписки на нашей стороне.

`to-be` для `GET /api/subscriptions/current`:

- добавить явный флаг `cancelAtPeriodEnd` (или эквивалент), чтобы фронт не вычислял это через комбинацию `paymentStatus + autoRenew`.
- вернуть `checkoutStatus`, чтобы UI и саппорт явно видели кейсы `manual_review`/`in_progress` без эвристик.

`to-be` для backoffice операций:

- `POST /api/admin/subscriptions/:subscriptionId/manual-review/approve`
- `POST /api/admin/subscriptions/:subscriptionId/manual-review/reject`

### 3.2 Webhook endpoint YooKassa

- `POST /api/payments/yookassa/webhook`

### 3.3 Контракт `start-checkout`

**Request body**

```json
{
  "planId": "premium",
  "billingPeriod": "month"
}
```

**Headers**

- `Idempotency-Key` — обязателен.
- `X-Platform` — опционально (`web | ios | android`), для аналитики `sourcePlatform`.

**Response (текущее поведение)**

```json
{
  "paymentUrl": "https://... или null",
  "subscriptionId": 123,
  "amount": 649,
  "toPay": 649,
  "creditApplied": 0,
  "creditGranted": 0,
  "status": "pending"
}
```

Примечание: сейчас `paymentUrl` формируется как внутренний URL приложения (mock-flow), интеграция реального `POST /v3/payments` в YooKassa отмечена как TODO в коде.

### 3.4 Критично про `paymentUrl` в `as-is`

- Пока реальный `POST /v3/payments` не внедрен, `paymentUrl` — технический заглушечный артефакт.
- `paymentUrl` нельзя использовать как подтверждение факта оплаты и нельзя использовать для расчета доступа.
- Источник истины по оплате — только серверная обработка webhook после verify через `GET /v3/payments/{payment_id}` и фиксация в `payments`.
- После внедрения real checkout дополнительная связь с подпиской должна идти через `yookassa_payment_id`.

---

## 4. Модель данных и инварианты

### 4.1 Основные таблицы

- `subscription_plans` — тарифы (`basic`, `pro`, `premium`), лимиты и фичи.
- `user_subscriptions` — период, статус, billing period, checkout-поля, `sourcePlatform`.
- `subscription_events` — аудит действий (`checkout_started`, `purchase_success`, `subscription_canceled` и т.д.).
- `payments` — idempotency webhook и факт обработки платежа.
- `idempotency_keys` — идемпотентность команд.

### 4.2 Checkout-поля в `user_subscriptions`

Для безопасной финализации webhook используются:

- `checkout_amount`
- `checkout_currency`
- `billing_credit_applied`
- `billing_credit_granted`
- `yookassa_payment_id`
- `to-be`: `checkout_status` (`in_progress | manual_review | closed`)

### 4.3 Критичные инварианты

1. Активация `pending -> active` только после серверной валидации платежа.
2. Валюта и сумма webhook обязаны совпасть с ожидаемыми `checkout_*`.
3. Дубли webhook не должны менять состояние повторно.
4. Один платеж (`payment.id`) может активировать подписку только один раз.
5. Повторный `succeeded` webhook не должен повторно начислять `billingCreditGranted`.
6. Одновременно активной остается только одна подписка пользователя (остальные переводятся в `expired`).
7. В `as-is` гарантия "одна активная подписка" обеспечивается транзакционной логикой сервиса; в `to-be` рекомендуется дополнительно усилить это ограничением БД (частичный unique index) или явной блокировкой строки пользователя/подписки.
8. `toPay === 0` (zero-pay activation) выполняется строго в одной транзакции и оставляет проверяемый audit trail.
9. Повторный `start-checkout` с новым `Idempotency-Key` не должен позволять повторно активировать платный план без достаточного доступного кредита.
10. `to-be` (Phase 1): если у pending-подписки уже зафиксирован `yookassa_payment_id`, webhook с другим `payment.id` не имеет права её финализировать.
11. `to-be` (Phase 1): `webhook succeeded` финализирует только pending-подписку со **совпадающим** `yookassa_payment_id`.
12. `to-be` (Phase 1): у пользователя может быть только одна актуальная pending-подписка, связанная с активным процессом оплаты.
13. `to-be` (Phase 1): `yookassa_payment_id` для одной pending-подписки является неизменяемым (immutable).
14. `to-be` (Phase 1): при повторном `start-checkout` и существующей pending-подписке с `yookassa_payment_id` сервер не создает новый платеж, а возвращает существующий `confirmation_url` (или требует явной отмены pending перед новым checkout).
15. `to-be`: аномальные кейсы verify/webhook (например, `amount/currency/payment_id` mismatch) переводятся в формальный `checkoutStatus=manual_review` и не оставляются только в логах.
16. Reconciliation запускается только для `pending`, у которых уже есть `yookassa_payment_id`; без `payment_id` verify-восстановление невозможно.
17. Для `pending` фиксируется верхний срок жизни (`pending_ttl_hours`, default: 24 часа); записи старше TTL автоматически закрываются с возвратом зарезервированного кредита и audit event.

---

## 5. Checkout flow (as-is)

1. Клиент вызывает `POST /api/subscriptions/start-checkout` с `Idempotency-Key`.
2. Сервер проверяет пользователя, план, период и текущую подписку.
3. Сервер рассчитывает `toPay`, `creditApplied`, `creditGranted`.
4. Сервер создает/обновляет `pending` подписку в транзакции.
5. При `creditApplied > 0` кредит резервируется сразу.
6. Логируется `subscription_events.checkout_started`.
7. Если `toPay === 0`, подписка финализируется сразу (`status=active`) без webhook.
8. Если `toPay > 0`, возвращается `pending` с `paymentUrl` (пока mock).

### 5.1 Zero-pay activation (критичный путь)

Обязательные правила:

- Резерв/перерасчет кредита, активация подписки и запись события выполняются в одной транзакции.
- Для аудита используется `subscription_events.purchase_success` с `method=internal_credit`.
- `to-be` (после ввода `checkoutStatus`): при zero-pay финализации `checkoutStatus` переводится в `closed`.
- `to-be`: в metadata события добавить явную ссылку на источник кредита/основание начисления, чтобы упростить антифрод-разбор.

---

## 6. Webhook flow YooKassa (as-is)

1. Входящее уведомление приходит в `POST /api/payments/yookassa/webhook`.
2. IP allowlist используется как мягкая проверка (не блокирующая).
3. Подлинность подтверждается через `GET https://api.yookassa.ru/v3/payments/{payment_id}` (Basic Auth `shopId:secretKey`).
4. Проверяется, что webhook можно связать с `user_subscriptions`.
5. Для `succeeded`:
   - валидация суммы/валюты;
   - запись в `payments` (идемпотентность);
   - перевод подписки `pending -> active`;
   - начисление `billingCreditGranted` (если есть);
   - завершение trial для платных планов.
6. Для `canceled`:
   - запись в `payments`;
   - перевод подписки `pending -> canceled`;
   - возврат зарезервированного `billingCreditApplied`.

### 6.1 Строгое сопоставление платежа и подписки (to-be, Phase 1)

- При создании платежа в YooKassa обязательно передавать `subscriptionId` (или `orderId`) в `metadata`.
- Webhook должен однозначно маппить платеж на pending-подписку того же пользователя.
- Если metadata отсутствует/неконсистентна, финализация запрещена.
- Если у pending-подписки уже установлен `yookassa_payment_id`, допускается финализация **только** при точном совпадении с `payment.id` из webhook.
- Если `payment.id` не совпал с уже сохраненным `yookassa_payment_id`, подписка не финализируется; кейс логируется как security/audit incident.
- Дополнительно к `amount/currency` обязательно проверяются:
  - финальный статус платежа (`succeeded`/`paid=true`),
  - принадлежность платежа нашему мерчанту (через verify-запрос с нашим `shopId`/`secretKey`).

### 6.2 Reconciliation для потерянного/задержанного webhook (to-be)

Обязательный механизм восстановления состояния:

1. Если подписка находится в `pending` дольше порога `N` минут, сервер инициирует reconciliation:
   - фоновая job (предпочтительно),
   - и/или защищенный endpoint "Я оплатил", который запускает **только серверную** verify-проверку.
   - порог `N` — конфигурируемый, рекомендуемый диапазон 15-30 минут, значение по умолчанию: 15 минут.
   - reconciliation применяется только к `pending` с заполненным `yookassa_payment_id`.
2. Источник истины reconciliation — `GET /v3/payments/{payment_id}`.
3. Если у `pending` отсутствует `yookassa_payment_id`, verify/reconciliation не выполняется:
   - в dev/mocked сценариях такая запись считается неоплачиваемым mock-checkout,
   - в production запись закрывается по `pending_ttl_hours` политике (см. 6.5), чтобы не висеть бесконечно.
4. По результату verify:
   - `succeeded` -> финализация подписки,
   - `canceled` -> перевод в `canceled` + возврат зарезервированного кредита,
   - неопределенный/промежуточный статус -> остаемся в `pending`, повторяем позже по политике ретраев.
5. Клиенту в это время отдается состояние "Оплата обрабатывается", а не фатальная ошибка.

### 6.3 Обязательная операционная модель `checkoutStatus` / `manual_review` (to-be)

- Выбранная модель: `paymentStatus` не расширяется; операционные кейсы живут в отдельном поле `checkoutStatus`.
- Минимальный `checkoutStatus`:
  - `in_progress` — checkout создан, ждем webhook/reconciliation;
  - `manual_review` — обнаружен спорный кейс, требуется ручное решение;
  - `closed` — операционный кейс закрыт (успехом или отказом).
- Значение по умолчанию при создании pending-подписки: `checkoutStatus=in_progress` (не `NULL`).
- Нормальные переходы:
  - `webhook succeeded` -> `paymentStatus=active`, `checkoutStatus=closed`;
  - `webhook canceled` -> `paymentStatus=canceled`, `checkoutStatus=closed`;
  - `zero-pay` финализация -> `paymentStatus=active`, `checkoutStatus=closed`.
- Минимальные триггеры перевода в `checkoutStatus=manual_review`:
  - mismatch `amount/currency`,
  - несовпадение `payment.id` и уже зафиксированного `yookassa_payment_id`,
  - неконсистентная привязка metadata/подписки.
- Кейс в `manual_review`:
  - не активирует доступ автоматически,
  - виден в API/админке для саппорта,
  - требует явного операционного решения через админ-операции:
    - `approve_manual_review(subscriptionId)` -> переводит в терминальный доступный статус (`paymentStatus=active`), `checkoutStatus=closed`;
    - `reject_manual_review(subscriptionId)` -> переводит в терминальный недоступный статус (`paymentStatus=canceled` или `expired` по правилам продукта), `checkoutStatus=closed`.
- Оба действия:
  - обязаны быть идемпотентными,
  - обязаны писать audit event.

### 6.4 Антигонки и replay-защита

- Обязательное правило: "один `payment.id` -> одна финализация".
- Конкурентные или повторные webhook не должны:
  - повторно активировать подписку,
  - повторно начислять кредит,
  - менять `expire_at`/состояние уже активированной подписки.
- Текущее ядро защиты: `payments` (PK), `ON CONFLICT DO NOTHING`, conditional update `pending -> active`.
- Hardening to-be: добавить явную блокировку сущности подписки/пользователя в транзакции webhook (например, `SELECT ... FOR UPDATE`) для более прозрачной защиты от race-condition при высоком параллелизме.

### 6.5 TTL pending и автоматическое закрытие "висяков" (to-be)

- Вводится параметр `pending_ttl_hours` (значение по умолчанию: 24 часа).
- Плановый cron/job обрабатывает `pending` старше TTL и переводит их в терминальный статус `canceled`.
- При автозакрытии обязательно:
  - вернуть зарезервированный кредит (`billing_credit_applied`), если резерв был выставлен;
  - записать audit event (например, `subscription_pending_expired` с причиной `pending_ttl_exceeded`).
- Правило действует как safety-net для потерянных webhook, mock/dev-checkout без `payment_id` и иных "зависших" случаев.

---

## 7. Что удалено из текущего scope

Следующие элементы **не считаются реализованными в текущей кодовой базе** и не должны описываться как "готово":

- `POST /api/v1/config/billing` с multi-signal region confidence.
- `POST /api/v1/billing/yookassa/init` (нативная токенизация SDK).
- Runtime-маршрутизация провайдеров `apple_iap / google_play / ios_external`.
- iOS External Link entitlement как активный рабочий флоу.
- Серверный merge entitlement из нескольких провайдеров (`max(expire_at)` между стором и YooKassa).

---

## 8. Целевой roadmap (to-be, без конфликта с текущим кодом)

### Phase 1 — Завершить YooKassa checkout

1. В `start-checkout` заменить mock `paymentUrl` на реальный вызов `POST /v3/payments`.
2. Сохранять `payment.id` в `user_subscriptions.yookassa_payment_id` в момент создания платежа.
3. Возвращать `confirmation.confirmation_url` клиенту.
4. Явно запретить бизнес-логику, основанную на `paymentUrl` (все решения только по webhook/verify).
5. При создании платежа передавать `subscriptionId/orderId` в metadata для однозначного webhook-binding.
6. Жестко валидировать связку `pending subscription <-> yookassa_payment_id <-> webhook payment.id`.
7. Гарантировать single-pending правило: без явной отмены нельзя создать второй активный checkout-процесс.
8. Граница этапов: `checkoutStatus` не входит в scope Phase 1 и внедряется в Phase 1.5.

**Acceptance criteria (обязательно для закрытия Phase 1):**

- `start-checkout` создает платеж в YooKassa и сохраняет `payment.id`.
- Клиент получает `confirmation.confirmation_url`.
- `webhook succeeded` активирует подписку.
- `webhook canceled` переводит подписку в `canceled` и возвращает зарезервированный кредит.
- Повторный webhook не меняет состояние повторно.
- mismatch `amount/currency` не активирует подписку.
- если у pending-подписки есть `yookassa_payment_id`, webhook с другим `payment.id` не финализирует подписку.
- `confirmation_url` используется только как переход к оплате; доступ выдается только после webhook.
- после возврата с оплаты клиент проверяет результат через `GET /api/subscriptions/current`.
- если webhook еще не пришел, UI показывает состояние "Оплата обрабатывается" (а не ложную ошибку).
- повторный `start-checkout` при существующем pending + `yookassa_payment_id` не создает новый платеж.
- `yookassa_payment_id` не меняется в пределах одной pending-подписки.
- `checkoutStatus` не проверяется в acceptance Phase 1 (он вводится отдельным этапом Phase 1.5).

### Phase 1.5 — Конкурентность и инварианты на уровне хранилища (обязательный hardening)

1. Внедрить дополнительную защиту "не более одной active подписки на пользователя":
   - частичный unique index в БД **или**
   - строгая row-level блокировка (`SELECT ... FOR UPDATE`) в `start-checkout` и `webhook succeeded`.
2. Зафиксировать инвариант "один платеж -> одна финализация" на уровне транзакций и блокировок.
3. Внедрить reconciliation-механизм для pending-подписок с потерянным/задержанным webhook (job и/или защищенный endpoint verify).
4. Узаконить `checkoutStatus` (включая `manual_review`) в модели хранения и API-контрактах (не как комментарий в логах).
5. Зафиксировать переходы `checkoutStatus`:
   - default `in_progress` при создании pending,
   - `closed` при `succeeded`/`canceled`/zero-pay финализации.
6. Обязательная миграция БД для `checkout_status`:
   - добавить колонку `user_subscriptions.checkout_status`,
   - установить `NOT NULL` и `DEFAULT 'in_progress'` для новых pending-записей,
   - выполнить backfill для существующих записей по правилам доменной миграции статусов.
7. Ввести `pending_ttl_hours` + автоматическое закрытие pending старше TTL (`canceled` + возврат резерва кредита + audit event).

### Phase 2 — Рекурренты и отмена

1. Интегрировать отмену автопродления у провайдера в `POST /api/subscriptions/cancel`.
2. Добавить фоновые ретраи и observability по failed renewal.
3. До внедрения провайдерного cancel endpoint `/api/subscriptions/cancel` трактуется как soft cancel (локальный флаг); UI/UX обязан явно коммуницировать это пользователю.
4. Добавить в контракт `/api/subscriptions/current` поле `cancelAtPeriodEnd` для однозначного UI-поведения.

### Phase 3 — Мультирегион и мультипровайдер

1. Ввести server-side paywall config (регион/канал оплаты) как отдельный endpoint.
2. Добавить Stripe (global web) и IAP verify (iOS/Android).
3. Перейти к унифицированному entitlement-сервису с merge-логикой по источникам.

### Phase 4 — Полная гибридная модель

1. Включить feature flags для rollout по платформам и странам.
2. Добавить миграционный сценарий между провайдерами без потери доступа.
3. Расширить QA матрицу (refund/revoke, race conditions, retries, downgrade/upgrade).

---

## 9. Чеклист QA для текущей реализации

1. Повтор `start-checkout` с тем же `Idempotency-Key` возвращает тот же ответ.
2. Webhook duplicate по тому же `payment.id` не приводит к двойной активации.
3. Mismatch суммы/валюты не активирует подписку.
4. `payment.canceled` возвращает ранее зарезервированный `billingCreditApplied`.
5. При покупке платного плана trial завершается.
6. При успешной активации старые активные подписки пользователя переводятся в `expired`.
7. Путь `toPay === 0` финализируется в одной транзакции и логируется отдельным событием (`purchase_success` с `method=internal_credit`).
8. `POST /api/subscriptions/cancel` не должен трактоваться как подтверждение провайдерной отмены, пока provider cancel не реализован.

### 9.1 Hardening checks (to-be)

1. Повтор с тем же `Idempotency-Key`, но другим payload, возвращает `409`.
2. `amount/currency` mismatch не активирует подписку и переводит кейс в `checkoutStatus=manual_review` с записью security/audit события.
3. Параллельные checkout/webhook на одного пользователя не приводят к двум активным подпискам.

---

## 10. Связанные документы

- `.docs/subscription.md` — краткая спецификация подписок.
- `.docs/architecture.md` — архитектурные принципы и текущее состояние.
- `.docs/mentai_tz_product.md` — продуктовые требования (в т.ч. Stripe + IAP verify как целевое направление).
- `.docs/security_requirements.md` — требования по безопасности.
