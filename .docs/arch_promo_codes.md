# Промокоды, offer codes и скидки на подписку

## Статус

- Документ проектный.
- Реализация в этом таске не выполняется.
- Цель: зафиксировать целевую модель промокодов для web / Android / iOS без поломки текущего billing-flow.

## Зачем это нужно

Нужно поддержать минимум два бизнес-сценария:

1. Промокод на бесплатный доступ на произвольное число дней, которое можно менять в БД для будущих активаций.
2. Промокод на скидку на следующий платеж или следующее списание.

Дополнительно важно не сломать:

- текущий trial-flow;
- scheduled billing в конце trial;
- upgrade/downgrade policy;
- различие между YooKassa и Apple IAP;
- обратную совместимость мобильных клиентов.

## Ключевые решения

### 1. Не переиспользовать `trial` как механизм промокодов

Промокод на бесплатные дни не должен изменять `users.has_used_trial`, `trial_started_at`, `trial_ended_at` и anti-abuse логику trial.

Почему:

- trial у продукта уже имеет отдельный смысл и отдельные ограничения;
- промокод может выдаваться саппортом, маркетингом, партнёрами и не должен считаться "первым пробным периодом";
- смешивание trial и promo сильно усложнит аналитику и поддержку.

Решение:

- trial остаётся отдельной сущностью;
- промокод даёт отдельный `access grant`;
- entitlements рассчитываются по общей модели "активные источники доступа".

### 2. Не смешивать промокодную скидку с `billingCredit`

`billingCredit` уже существует как отдельная денежная сущность. Промокодная скидка должна жить отдельно.

Почему:

- `billingCredit` похож на баланс/компенсацию и может иметь другой lifecycle;
- промокодная скидка обычно одноразовая и не должна внезапно превращаться в вечный остаток;
- возвраты, отмены, повторные попытки списания и аудит будут запутанными.

Решение:

- для промокодов завести отдельные `discount grants`;
- в финансовых артефактах хранить отдельный snapshot скидки по промокоду.

### 3. Изменение параметров промокода в БД должно влиять только на будущие активации

Это принципиально.

Нельзя делать так, чтобы изменение `durationDays = 30 -> 7` в кампании внезапно урезало уже выданный пользователям доступ.

Решение:

- у кампании параметры можно менять в любой момент;
- при redeem создаётся immutable snapshot условий;
- если нужно продлить или отменить уже активированный доступ, это делается на уровне конкретного redemption/access grant, а не редактированием кампании.

### 4. В v1 не поддерживать stacking

Один пользовательский checkout / one-shot charge использует не более одного promo discount.

Почему:

- stacking быстро ломает понятность цены;
- усложняет proration и retry-логику;
- даёт много edge-cases для саппорта.

Решение:

- `stackingMode = exclusive` по умолчанию;
- при необходимости later можно добавить controlled stacking для отдельных кампаний.

### 5. Для iOS Apple IAP использовать Apple offer codes / promotional offers, а не наш server-side текстовый купон

Для iOS non-RU flow, где billing provider = `apple_iap`, нельзя проектировать купон так же, как для YooKassa.

Решение:

- web / Android / iOS RU storefront (`yookassa`) используют internal promo codes;
- iOS Apple IAP использует native StoreKit redemption flow;
- в UI это разные entry points.

## Рекомендуемый scope v1

### Обязательные типы

1. `grant_access_days`
2. `discount_next_checkout`
3. `discount_next_charge`

### Что значит каждый тип

#### `grant_access_days`

Даёт доступ к плану `pro` или `premium` на `N` дней без немедленного платежа.

Рекомендуемые ограничения v1:

- применять только для пользователей без активной платной подписки;
- разрешить для `basic`, `trial`, `expired`, `canceled`;
- после окончания действия вернуть пользователя в обычное состояние по текущим billing-правилам.

Причина ограничения:

- для активной paid-подписки бесплатные дни превращаются в "pause/extend billing", а это отдельная сложная бизнес-логика.

#### `discount_next_checkout`

Даёт скидку на следующий checkout, который пользователь запускает сам.

Подходит для:

- first purchase;
- winback;
- апгрейда на год;
- партнёрских кампаний.

#### `discount_next_charge`

Даёт скидку на следующее автоматическое списание или scheduled charge.

Подходит для:

- компенсации после инцидента;
- удержания пользователя перед renew;
- trial conversion со скидкой на первое списание в конце trial.

## Популярные варианты промокодов, которые стоит предусмотреть в модели

Ниже не всё нужно делать в первой итерации, но модель должна это выдерживать.

| Тип | Что даёт | Нужен в v1 |
| --- | --- | --- |
| `grant_access_days` | Бесплатный доступ к `pro`/`premium` на N дней | Да |
| `discount_next_checkout_fixed` | Фиксированная скидка на следующий checkout | Да |
| `discount_next_checkout_percent` | Процентная скидка на следующий checkout | Да |
| `discount_next_charge_fixed` | Фиксированная скидка на следующее автосписание | Да |
| `discount_next_charge_percent` | Процентная скидка на следующее автосписание | Да |
| `free_next_charge` | 100% скидка на следующее списание | Да, как частный случай fixed/percent |
| `gift_subscription_period` | Подарить 1 месяц / 1 год плана | Phase 2 |
| `discount_n_cycles` | Скидка на первые 2-3 платежа | Phase 2 |
| `upgrade_promo` | Скидка только при переходе на `premium` или `year` | Phase 2 |
| `winback_only` | Только для churned пользователей | Через eligibility уже в v1 |
| `referral_reward` | Награда за приглашение, двусторонняя логика | Phase 2 |
| `support_recovery` | Компенсационный код саппорта после сбоя | Через `discount_next_charge` уже в v1 |
| `partner_campaign` | Партнёрский / influencer код с лимитами | Через campaign rules уже в v1 |

## Где давать ввод промокода

### Основная точка входа

`/subscription`

Почему это лучшее место:

- пользователь уже находится в billing-контексте;
- можно показать точный effect preview рядом с тарифами;
- не надо дублировать сложную pricing-логику по десятку paywall-экранов.

### Дополнительная точка входа

`/settings` -> блок подписки -> переход на `/subscription`

Причина:

- у вас уже есть единый поток "Управление подпиской";
- не нужно плодить отдельные места с независимой бизнес-логикой.

### Что делать с paywall-модалками

Не встраивать полноценный ввод кода в каждый `FeaturePaywallModal`.

Вместо этого:

- добавить вторичный CTA `Есть промокод?`;
- CTA открывает `/subscription` и фокусирует поле промокода.

Почему:

- paywall-модалки сейчас лёгкие и универсальные;
- если тащить внутрь полноценный promo-flow, модалка станет второй billing-страницей;
- возрастёт связность между paywall и checkout.

### Что делать с `app/pages/billing.vue`

Сейчас страница пустая. В будущем её логично использовать как "Billing center":

- активные скидки;
- история применённых промокодов;
- управление следующим списанием.

Но для первой версии ввод промокода лучше не уносить туда как в primary entry point. Иначе пользователь просто не найдёт эту функцию.

## UX-поведение по платформам

### Web / Android / iOS RU storefront (`yookassa`)

Показываем обычный текстовый ввод промокода на `/subscription`.

Сценарий:

1. Пользователь вводит код.
2. Клиент вызывает preview.
3. Сервер отвечает, что именно получит пользователь.
4. Пользователь нажимает `Применить`.
5. Сервер фиксирует redemption.
6. Если это access grant, доступ меняется сразу.
7. Если это discount grant, на экране появляется плашка "Скидка активирована и будет применена к следующему платежу".

### iOS non-RU storefront (`apple_iap`)

Не показывать наш кастомный текстовый input для Apple offer codes.

Показывать:

- кнопку `Активировать offer code`;
- она открывает native StoreKit redemption sheet.

Если маркетинг хочет один и тот же публичный код для всех платформ, это должны быть две разные реализации одной кампании:

- internal promo campaign для YooKassa;
- Apple offer code / promotional offer в App Store Connect.

Но UI всё равно разный.

## Целевая доменная модель

### 1. `promo_campaigns`

Описывает сам промокод и его правила.

Рекомендуемые поля:

- `id`
- `code` — уникальный нормализованный код, например `SPRING2026`
- `status` — `draft | active | paused | archived`
- `channel` — `internal | apple_offer_code`
- `benefit_type` — `grant_access_days | discount_next_checkout | discount_next_charge`
- `benefit_payload` — `jsonb`, валидируется Zod discriminated union
- `eligibility_payload` — `jsonb`, валидируется Zod
- `stacking_mode` — `exclusive`
- `starts_at`
- `ends_at`
- `total_redemption_limit`
- `per_user_redemption_limit`
- `internal_name`
- `public_label`
- `comment`
- `created_by`
- `updated_by`
- `created_at`
- `updated_at`

Пример `benefit_payload` для бесплатных дней:

```json
{
  "type": "grant_access_days",
  "planId": "premium",
  "durationDays": 30
}
```

Пример `benefit_payload` для скидки:

```json
{
  "type": "discount_next_charge",
  "mode": "percent",
  "value": 50,
  "maxAmount": 500,
  "currency": "RUB"
}
```

Пример `eligibility_payload`:

```json
{
  "platforms": ["web", "android", "ios"],
  "billingProviders": ["yookassa"],
  "planIds": ["pro", "premium"],
  "userStates": ["basic", "trial", "expired"],
  "firstPurchaseOnly": false
}
```

### 2. `promo_redemptions`

Фиксирует факт активации кода пользователем и snapshot условий на момент redeem.

Рекомендуемые поля:

- `id`
- `campaign_id`
- `user_id`
- `code_snapshot`
- `benefit_type_snapshot`
- `benefit_payload_snapshot`
- `eligibility_payload_snapshot`
- `status` — `active | consumed | expired | revoked`
- `source_platform`
- `source_context` — `subscription_page | settings | paywall | support`
- `redeemed_at`
- `expires_at`
- `consumed_at`
- `revoked_at`
- `metadata`

### 3. `billing_access_grants`

Отдельная таблица временного доступа.

Рекомендуемые поля:

- `id`
- `user_id`
- `source_type` — `promo_code | support | manual`
- `source_redemption_id`
- `plan_id`
- `starts_at`
- `ends_at`
- `status` — `active | expired | revoked`
- `created_at`
- `updated_at`

Эта таблица нужна, чтобы не перегружать `users.trial_*`.

### 4. `billing_discount_grants`

Отдельная таблица отложенных скидок.

Рекомендуемые поля:

- `id`
- `user_id`
- `source_redemption_id`
- `apply_on` — `next_checkout | next_charge`
- `mode` — `fixed | percent`
- `amount`
- `percent`
- `max_discount_amount`
- `currency`
- `target_plan_id`
- `target_billing_period`
- `billing_provider` — в v1 фактически `yookassa`
- `status` — `active | reserved | applied | expired | revoked`
- `expires_at`
- `reserved_subscription_id`
- `applied_subscription_id`
- `applied_payment_id`
- `applied_charge_attempt_id`
- `applied_amount`
- `created_at`
- `updated_at`

## Почему нужна отдельная `billing_access_grants`, а не только `promo_redemptions`

Потому что redemption — это факт активации кода, а grant — это фактический доступ.

Это позволит:

- продлевать / отзывать доступ вручную на уровне grant;
- в будущем использовать ту же таблицу для support-компенсаций без промокода;
- держать entitlements engine простым: он смотрит на access grants, а не на все виды кампаний.

## Правила расчёта доступа

Текущий effective access план нужно считать как максимум по активным источникам:

1. `support`-equivalent доступ
2. `billing_access_grants`
3. `trial`
4. `active paid subscription`
5. `basic`

Если активно несколько источников:

- выбираем план с наибольшим рангом;
- при равном плане для UI можно показывать самый дальний `endsAt`;
- billing engine при этом остаётся отдельным от entitlements.

## Правила применения скидки

### Базовый порядок расчёта

1. Рассчитать обычную сумму чарджа по текущей логике `plan-change`.
2. Найти один подходящий `billing_discount_grant`.
3. Применить discount.
4. Ограничить снизу `0`.
5. Зафиксировать snapshot применённой скидки.

### Что важно

- скидка применяется после proration;
- скидка не должна переписывать историю кампании задним числом;
- если платёж не создался или был отменён до финализации, grant остаётся `active`, если политика не говорит обратное;
- если скидка была зарезервирована на конкретный checkout, нужна защита от двойного применения.

## В какие серверные потоки интегрировать discount grant

Не только в `POST /api/subscriptions/start-checkout`.

Нужно покрыть все точки, где появляется charge:

1. `POST /api/subscriptions/start-checkout`
2. `POST /api/subscriptions/retry-charge`
3. `trial-billing-worker`
4. `scheduled-plan-change.service` если он создаёт charge
5. любые future renew / recovery flows

Если интегрировать только `start-checkout`, то промокод "на следующее списание" будет работать непредсказуемо.

## Изменения в текущих API

### Не ломаем старые контракты

Только добавляем новые поля как optional.

### Публичные endpoints

#### `POST /api/promo-codes/preview`

Назначение:

- проверить код;
- показать пользователю точный effect preview;
- не создавать redemption.

Request:

```json
{
  "code": "SPRING2026",
  "context": "subscription_page",
  "planId": "premium",
  "billingPeriod": "year"
}
```

Response:

```json
{
  "valid": true,
  "channel": "internal",
  "benefitType": "discount_next_checkout",
  "summary": "Скидка 30% на следующий checkout Premium (год)",
  "requiresRedeem": true,
  "platformAction": "redeem"
}
```

#### `POST /api/promo-codes/redeem`

Назначение:

- зафиксировать redeem;
- создать access grant или discount grant.

#### `GET /api/promo-codes/active`

Назначение:

- отдать активные grants пользователя для `/subscription` и будущего billing center.

### Изменения в `GET /api/subscriptions/current`

Можно добавить optional-блок:

```json
{
  "promo": {
    "activeAccessGrant": {
      "planId": "premium",
      "endsAt": "2026-05-01T00:00:00.000Z"
    },
    "pendingDiscount": {
      "applyOn": "next_charge",
      "summary": "Скидка 50% на следующее списание"
    }
  }
}
```

Важно:

- блок только добавляется;
- старые поля не меняются и не удаляются.

### Изменения в `POST /api/subscriptions/start-checkout`

В ответ безопасно добавить optional-поля:

- `promoDiscountApplied`
- `promoCode`
- `priceBreakdown`

Пример:

```json
{
  "amount": 3830,
  "toPay": 2830,
  "promoDiscountApplied": 1000,
  "promoCode": "SPRING2026",
  "priceBreakdown": {
    "baseAmount": 3830,
    "prorationCredit": 0,
    "promoDiscount": 1000,
    "finalToPay": 2830
  }
}
```

## Админка и управление через БД

### Минимум для v1

Даже если UI админки сразу не будет, система должна поддерживать:

- создание кампании;
- изменение параметров кампании;
- паузу/архивацию;
- просмотр редемпшенов;
- ручное продление / отзыв конкретного grant.

### Рекомендуемые admin endpoints

- `GET /api/admin/promo-codes`
- `POST /api/admin/promo-codes`
- `PATCH /api/admin/promo-codes/:id`
- `POST /api/admin/promo-codes/:id/pause`
- `POST /api/admin/promo-codes/:id/activate`
- `GET /api/admin/promo-codes/:id/redemptions`
- `POST /api/admin/promo-redemptions/:id/revoke`
- `POST /api/admin/access-grants/:id/extend`

### Что значит "поменять количество дней в БД"

Корректная трактовка:

- редактируем `promo_campaigns.benefit_payload.durationDays`;
- новое значение действует только на будущие redeem;
- уже выданные access grants не меняются.

Если нужен retroactive change:

- меняем запись в `billing_access_grants`;
- логируем, кто и зачем это сделал.

## Популярные eligibility-ограничения, которые лучше заложить сразу

- по платформе: `web`, `ios`, `android`
- по billing provider: `yookassa`, `apple_iap`
- по plan target: `pro`, `premium`
- по user state: `new`, `trial`, `active_paid`, `expired`, `past_due`, `churned`
- only first purchase
- only without active paid subscription
- only for annual billing
- country / storefront aware
- per-user usage limit
- global redemption cap

## Поведение в спорных кейсах

### Пользователь ввёл код на бесплатные дни, но у него уже активен paid-plan

В v1 отклоняем.

Причина:

- иначе придётся смещать `endDate`, `nextChargeAt`, renew-логику и Apple/YooKassa сценарии;
- это уже не "промокод на free days", а "gift extension".

### Пользователь активировал скидку на следующее списание, но сменил тариф

Рекомендуемое правило v1:

- если grant ограничен `target_plan_id` / `target_billing_period`, проверяем их жёстко;
- если не ограничен, применяем к первой подходящей charge-операции.

### Платёж не прошёл

Рекомендуемое правило v1:

- grant не сгорает при `failed` / `canceled`, пока не истёк `expires_at`;
- при успешном применении помечаем `applied`.

### Пользователь вводит один и тот же код второй раз

Возвращаем понятный ответ:

- либо код уже был использован этим аккаунтом;
- либо лимит по аккаунту исчерпан;
- либо уже есть активный grant того же типа.

## Аналитика и аудит

Использовать и доменные таблицы, и `subscription_events`.

Новые события:

- `promo_code_previewed`
- `promo_code_redeemed`
- `promo_access_granted`
- `promo_discount_granted`
- `promo_discount_applied`
- `promo_grant_expired`
- `promo_redemption_revoked`

Важные метаданные:

- `campaignId`
- `codeSnapshot`
- `benefitType`
- `sourcePlatform`
- `sourceContext`
- `subscriptionId`
- `paymentId`
- `chargeAttemptId`

## Обратная совместимость

### API

- не удалять и не менять существующие поля;
- только добавлять optional-поля;
- новый promo-flow должен работать рядом со старым checkout-flow.

### БД

Порядок только такой:

1. `expand` — добавить новые таблицы и nullable-поля;
2. `dual support` — сервер умеет работать и без promo данных, и с ними;
3. rollout клиента;
4. cleanup, если вообще потребуется.

### Мобильные клиенты

Старые mobile build, которые ничего не знают про промокоды:

- не должны падать;
- должны видеть обычные тарифы и обычный billing-flow;
- промо-поля в API для них остаются необязательными.

## Что рекомендую делать в реализации по этапам

### Этап 1

- `promo_campaigns`
- `promo_redemptions`
- `billing_access_grants`
- `billing_discount_grants`
- server validation + preview
- redeem на `/subscription`
- `grant_access_days`
- `discount_next_checkout`
- `discount_next_charge` для YooKassa flows

### Этап 2

- Billing center в `app/pages/billing.vue`
- история активных/использованных промокодов
- admin UI
- расширенные eligibility rules

### Этап 3

- `gift_subscription_period`
- `discount_n_cycles`
- referral campaigns
- Apple marketing sync / internal tooling around App Store offer codes

## Итоговая рекомендация

Лучшая модель для Mentala сейчас:

- один unified promo domain на сервере;
- отдельные сущности для `campaign`, `redemption`, `access grant`, `discount grant`;
- primary UI-entry в `/subscription`;
- paywall-модалки только перенаправляют;
- Apple IAP живёт отдельным native offer-code сценарием;
- free days не смешиваются с trial;
- скидки не смешиваются с `billingCredit`.

Это даст систему, которая:

- понятна продукту;
- поддерживаема саппортом;
- не ломает текущий billing;
- выдержит будущие маркетинговые кейсы без переделки всего checkout.
