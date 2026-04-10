# Промокоды и Referral

## Статус

- Реализовано в billing-flow для `yookassa`.
- Для `apple_iap` внутренние promo/referral controls не показываются.
- Модель сделана по схеме `expand -> dual support`: старые клиенты не ломаются, новые поля в API только optional.

## Scope v1

Поддерживаются 3 механизма:

1. `free_access_days`
2. `next_payment_percent_discount`
3. `referral_program`

Обычные промокоды и referral разделены намеренно:

- promo code создаёт админ;
- promo code одноразовый глобально;
- referral code персональный, многоразовый и живёт на уровне пользователя.
- Автогенерация promo/referral-кодов использует префикс `MENTALA`; legacy-коды с префиксом `MENT` остаются валидными и продолжают приниматься.

## Продуктовые правила

### `free_access_days`

- Код задаёт `durationDays >= 1`.
- Поддерживаются режимы `planMode = auto | explicit`.
- `auto` берёт текущий активный paid-план пользователя. Если paid-плана нет, redeem запрещён.
- `explicit` может выдать только `pro` или `premium`.
- `explicit` не может понижать effective access пользователя.

Ключевой инвариант:

- уже оплаченные дни не сгорают;
- если у пользователя есть billing-boundary, она сдвигается на `N` дней;
- если billing-boundary нет, создаётся только временный `access grant`.

Примеры:

- `active pro + auto` -> пользователь остаётся на `PRO`, `nextChargeAt` сдвигается.
- `active pro + explicit premium` -> на `N` дней effective plan = `Premium`, затем возврат в `PRO`.
- `basic + explicit premium` -> выдаётся временный `Premium`, после окончания пользователь возвращается в исходное состояние.

### `next_payment_percent_discount`

- Скидка только процентная: `1..100`.
- Применяется к ближайшему qualifying payment:
  - `start-checkout`
  - direct charge по сохранённой карте
  - `retry-charge`
  - `trial-billing-worker`
  - `scheduled-plan-change`
- Скидка применяется после proration.
- Скидка не смешивается с `billingCredit`.
- В одном платеже используется только один percentage discount source.
- Если попытка оплаты неуспешна, grant не сгорает и возвращается в `active`.

Targeting:

- `targetPlanScope = any_paid | pro | premium`
- `targetPeriodScope = any | month | year`

Приоритет stacking policy:

1. bound admin promo
2. unbound admin promo
3. invitee referral reward
4. referrer referral reward

### Referral

- У каждого пользователя есть персональный referral code.
- Ленивая инициализация `user_referral_profiles` должна быть идемпотентной и concurrency-safe: параллельные запросы не должны приводить к `500`, смене уже выданного кода или дублированию профиля.
- Invitee может активировать referral только один раз за lifetime.
- Self-referral запрещён.
- Reward выдаётся не в момент ввода кода, а после первой успешной paid-конверсии invitee.
- Резервация `billing_discount_grants` в auto-renew/checkout flow должна сериализоваться через PostgreSQL advisory transaction lock с валидной сигнатурой `pg_advisory_xact_lock(bigint)`: ключ пакуется как `namespace << 32 | userId`, а не как несуществующая пара `bigint, bigint`.

Экономика v1:

- invitee: `20%` на первый paid payment
- referrer: `20%` на следующий paid payment
- invitee reward validity: `30` дней
- referrer reward validity: `90` дней
- yearly cap на referrer: `25` успешных reward-выдач

## Referral v2 (следующая итерация, пока не реализовано)

### Решение по scope

- В этой итерации меняем только consumer referral для обычных пользователей.
- Отдельный блок для блогеров / инфлюенсеров / affiliate-партнёров сейчас не делаем.
- Для блогеров нужен отдельный future-contour с партнёрскими ссылками, атрибуцией, payout и anti-fraud правилами. Это фиксируется как отдельная будущая задача, но не входит в текущую реализацию.

### Почему меняем модель

Текущая схема `referrer -> % на следующий платёж` слишком слабая и плохо масштабируется:

- reward не накапливается в понятный баланс;
- reward быстро сгорает;
- множество успешных referrals не превращаются в пропорциональную выгоду;
- лимит `25/год` искусственно обрезает сильных рефереров и не соответствует product fit даже для обычных power users.

### Новая продуктовая модель

- Invitee остаётся на модели `20% на следующий qualifying paid payment после активации кода`.
- Referrer больше не получает `next_payment_percent_discount`.
- Referrer получает накопительный `billingCredit`, который начисляется после qualifying paid conversion invitee.
- `referrerYearlyCap` из product-логики убирается.
- Anti-abuse строится не на cap, а на qualifying event, hold-периоде и ручной/moderated проверке аномалий.

### Что остаётся без изменений

- Invitee может активировать referral только один раз за lifetime.
- Self-referral запрещён.
- Reward для invitee создаётся только до первой платной подписки.
- Reward для referrer создаётся только после первой успешной paid-конверсии invitee.
- Для `apple_iap` внутренний referral-flow по-прежнему не используется.

Важно для текстов и UX:

- В пользовательских текстах и preview нужно писать `следующий платёж`, а не `первый платёж`.
- Причина: пользователь видит эффект как скидку на ближайший qualifying payment после активации кода.
- Ограничение `только до первой paid-подписки` остаётся отдельным eligibility-правилом и не должно смешиваться с текстом о reward.

### Новая экономика referrer reward

`referrerPercent` больше не означает “скидка на следующий платёж referrer”.

Теперь он означает:

- `referrerCreditPercent` — процент от первой успешно оплаченной суммы invitee, который конвертируется во внутренний `billingCredit` referrer.

Рекомендуемая формула для текущей итерации:

- `referrerCreditAmount = round(qualifyingCapturedAmount * referrerCreditPercent / 100, 2)`

Где:

- `qualifyingCapturedAmount` — реально успешно списанная сумма первого qualifying payment invitee;
- сумма считается после invitee-discount, proration и других price adjustments;
- refunded / canceled / chargeback-платежи не считаются финально подтверждённой базой награды.

Пример:

- invitee активировал referral;
- затем оплатил первый `PRO`-платёж;
- система дождалась успешного `payment.succeeded`;
- reward для invitee работает как и раньше;
- reward для referrer не создаётся как coupon, а начисляется в `billingCredit`.

### Hold и anti-fraud

Жёсткий yearly cap убирается, но добавляется более взрослая логика защиты:

- reward сначала создаётся в статусе `pending`;
- в `available` он переходит только после `creditHoldDays`;
- рекомендуемое значение для production: `14` дней;
- для development и QA допускается env-specific override `creditHoldDays = 1`, чтобы не блокировать ручную проверку сценариев;
- если qualifying payment invitee refunded / reversed / chargeback во время hold, credit не становится доступным;
- если reversal пришёл позже, credit должен уметь уходить в `reversed`, а баланс пользователя — пересчитываться.

### Expiry policy

- Короткое истечение в `90` дней для referrer reward убирается.
- Для текущей итерации рекомендуем не делать короткий hard-expiry вообще.
- Если понадобится финансовое ограничение liabilities, позже можно ввести отдельную inactivity-policy, но не в этой итерации.

Итог:

- reward не сгорает “по-тихому” через несколько недель;
- сильные рефереры получают пропорциональную накопительную выгоду;
- экономика контролируется hold / antifraud / reversal-правилами, а не искусственным лимитом.

### Как billingCredit должен применяться

Для новой referral-модели `billingCredit` должен стать полноценной частью billing engine.

Порядок расчёта рекомендован такой:

1. base price / proration
2. percent promo / invitee discount
3. `billingCredit`
4. external charge на остаток

Правила:

- `billingCredit` может использоваться частично;
- если кредита больше, чем сумма к оплате, остаток переносится дальше;
- если после применения `billingCredit` сумма стала `0`, subscription-flow должен завершаться internal-активацией без внешнего списания;
- `billingCredit` должен уметь покрывать `100%` суммы платежа;
- если для будущего auto-renew нужен payment method, это проверяется отдельно от самого факта нулевого первого charge.

### Почему это лучше

- reward становится накопительным и понятным в интерфейсе;
- reward можно использовать на нескольких будущих платежах, а не терять из-за short expiry;
- сильный реферер получает value пропорционально реальной конверсии;
- модель ближе к best practice крупных consumer-продуктов, где reward появляется после qualifying action и копится в account value, а не живёт как пачка одноразовых “следующих скидок”.

### Планируемые изменения в данных

Текущий `users.billingCredit` можно сохранить как materialized balance, но для referral v2 этого недостаточно.

Нужно добавить ledger-сущность:

- `billing_credit_entries`

Рекомендуемые поля:

- `id`
- `userId`
- `sourceType = referral_reward | manual_adjustment | refund_restore | support_compensation`
- `sourceReferralRedemptionId?`
- `amount`
- `currency`
- `status = pending | available | partially_applied | applied | reversed`
- `availableAt`
- `appliedAt?`
- `reversedAt?`
- `metadata`
- `createdAt`
- `updatedAt`

Правило:

- `users.billingCredit` остаётся агрегированным snapshot-балансом;
- truth source для аудита и разборов — `billing_credit_entries`.

### Планируемые изменения в referral settings

В `referral_program_settings` для новой итерации нужно перейти на такую модель:

- `inviteePercent`
- `inviteeRewardValidityDays`
- `referrerRewardType = billing_credit`
- `referrerCreditPercent`
- `creditHoldDays`

### Планируемые изменения в referral redemption lifecycle

`referral_redemptions` должен явно хранить путь от активации к credit reward:

- `status = pending_conversion | pending_credit | completed | revoked | reversed`
- `qualifyingPaymentId?`
- `qualifyingCapturedAmount?`
- `qualifyingCurrency?`
- `holdUntil?`
- `referrerCreditEntryId?`
- `creditAvailableAt?`
- `creditReversedAt?`

Рекомендуемый сценарий:

1. invitee активирует код -> `pending_conversion`
2. invitee делает первый успешный платёж -> `pending_credit`
3. проходит hold -> создаётся / раскрывается available credit
4. reward использован -> credit entry движется по своему lifecycle, а redemption остаётся completed

### Планируемые API и UI-изменения

Пользователь:

- `/settings` и `/subscription` должны показывать:
  - текущий доступный `billingCredit`
  - pending referral credits
  - последние успешные referrals
  - пояснение “наградa подтверждается через N дней после первой оплаты друга”
- `/auth/login` и `/auth/register` должны уметь принять referral/promocode как entry point, чтобы пользователь не был обязан отдельно идти в настройки или на paywall
- ввод кода на auth/register, на `/subscription` и в будущем на landing/paywall должен означать один и тот же backend-flow:
  - это не отдельный тип reward;
  - это не отдельная referral-сущность;
  - после авторизации должен использоваться тот же самый redeem/preview механизм
- до авторизации код нельзя считать окончательно активированным:
  - на pre-auth шаге код только сохраняется как pending input в local/session storage или ephemeral server session;
  - окончательная проверка eligibility и redeem происходят только после появления user session

Referral repeat-policy:

- после успешной активации любого referral code у invitee фиксируется один `referrer of record`;
- второй и последующие referral code от того же или другого пользователя больше не принимаются;
- дополнительных скидок за повторный ввод других referral code пользователь не получает;
- это правило должно одинаково работать для ввода в настройках, на `/subscription`, на auth/register и в будущих deeplink / landing entry points.

Админ:

- во вкладке `Referral` оставляем только параметры текущей consumer-модели:
  - `inviteePercent`
  - `referrerPercent`
  - `inviteeRewardValidityDays`
  - `creditHoldDays`
- preview должен показывать invitee-discount и referrer-credit как разные сущности.

Admin promo-code UX:

- у админа должна быть кнопка `Сгенерировать код`;
- при этом ручной ввод собственного кода должен остаться;
- UI должен делать live-check уникальности кода до сохранения;
- source of truth для уникальности остаётся сервер и БД, а не только клиентская проверка;
- при конфликте сервер должен вернуть понятную бизнес-ошибку `code_already_exists`.

### Текущее состояние реализации

- referrer reward уже переведён с discount grant на `billingCredit`;
- legacy-тип `referrer_referral` удалён из runtime и DTO;
- deprecated-поля `referrerYearlyCap`, `referrerRewardValidityDays`, `referrerTargetPlanScope`, `referrerTargetPeriodScope` убраны из текущей модели;
- backward-compatibility слой для этой части не сохранялся, потому что функциональность ещё не выезжала в production.

## База данных

Новые таблицы:

- `promo_campaigns`
- `promo_code_redemptions`
- `billing_access_grants`
- `billing_discount_grants`
- `billing_schedule_adjustments`
- `user_referral_profiles`
- `referral_program_settings`
- `referral_redemptions`

Роли таблиц:

- `promo_campaigns` хранит одноразовые admin-created коды и immutable payload кампании.
- `promo_code_redemptions` фиксирует факт успешного redeem и snapshot результата.
- `billing_access_grants` хранит временный доступ к `pro/premium`.
- `billing_discount_grants` хранит будущую скидку на следующий платёж.
- `billing_schedule_adjustments` хранит честный сдвиг billing-boundary.
- `user_referral_profiles` хранит личный referral code пользователя.
- `referral_program_settings` хранит глобальные настройки referral-программы.
- `referral_redemptions` хранит связь `referrer -> invitee` и выдачу наград.

## Серверная архитектура

Новые application services:

- `server/application/promo-codes/promo-code-preview.service.ts`
- `server/application/promo-codes/promo-code-redeem.service.ts`
- `server/application/promo-codes/promo-access-grants.service.ts`
- `server/application/promo-codes/promo-discount-grants.service.ts`
- `server/application/promo-codes/billing-schedule-adjustments.service.ts`
- `server/application/promo-codes/promo-provider-guard.service.ts`
- `server/application/referral/referral-redeem.service.ts`
- `server/application/referral/referral-rewards.service.ts`
- `server/application/referral/referral-event-subscribers.ts`

Ключевые resolver'ы:

- один resolver для effective access поверх paid subscription и access grants;
- один resolver для pending discount grant;
- один resolver для effective billing shift days.

Promo-логика не встраивается в `trial` поля и не меняет `has_used_trial`.

## API

Публичные endpoints:

- `POST /api/access-codes/preview`
- `POST /api/access-codes/redeem`
- `GET /api/promo-codes/active`
- `GET /api/referral/me`

`/api/access-codes/*` — единый транспорт для пользовательского ввода (admin promo и referral от друга). Бэкенд через `resolveAccessCodeKind()` детерминированно определяет тип кода (`promo` | `referral`) благодаря глобальной уникальности кодов в `assertAccessCodeAvailable()`. Внутри resolver вызывает существующие сервисы `previewPromoCode` / `redeemPromoCode` или `previewReferralCode` / `redeemReferralCode`. Ответ — discriminated union `{ kind: 'promo' | 'referral', ... }`.

Admin endpoints:

- `GET /api/admin/promo-codes`
- `POST /api/admin/promo-codes`
- `PATCH /api/admin/promo-codes/:id`
- `POST /api/admin/promo-codes/:id/pause`
- `POST /api/admin/promo-codes/:id/activate`
- `POST /api/admin/promo-codes/:id/revoke`
- `GET /api/admin/referral-program`
- `PATCH /api/admin/referral-program`
- `GET /api/admin/referrals`
- `POST /api/admin/referrals/:id/revoke-reward`
- `GET /api/admin/promo-codes/check-unique?code=...` или эквивалентный lightweight validation endpoint рекомендуется добавить в следующей итерации для live-проверки уникальности

Расширения существующих ответов:

- `GET /api/subscriptions/current` теперь может вернуть:
  - `promo.activeAccessGrant`
  - `promo.pendingDiscount`
  - `promo.effectiveBillingShiftDays`
  - `referral.myCode`
  - `referral.pendingRewardsCount`
  - `referral.successfulInvitesCount`
  - `billingProviderHint`

Ни одно старое поле не удалено и не переименовано.

## UI

### Пользовательский flow

Основная точка входа: `/subscription`.

На странице есть 2 блока:

- `Промокод` — единое поле для admin promo и referral от друга. Бэкенд через resolver однозначно определяет тип кода благодаря глобальной уникальности (`assertAccessCodeAvailable`), без try/catch и 404-fallback на клиенте.
- `Активные бонусы` — текущий access grant, pending discounts и суммарный billing shift.

Поведение единого поля: preview -> apply/activate. Текст кнопки и summary меняется по `kind` в ответе. В UI-текстах используется только «промокод» / «бонусный счёт» — слов `referral` и `billing credit` пользователю не показываем (в backend и DTO термин `billingCredit` остаётся).

В `FeaturePaywallModal` добавлен CTA `Есть промокод?`, который ведёт на `/subscription?promo=1`.

### Share UX

В `Настройки` пользователь видит компактный блок `Пригласи друга`:

- личный referral code;
- `Копировать`;
- `Поделиться`;
- chevron и переход на детальный экран `/settings/referral`.

На `/settings/referral` пользователь видит подробности:

- счётчики успешных приглашений и pending rewards;
- бонусный счёт (`billingCredit` в DTO) и pending referral credits;
- короткую инструкцию по шагам.

### Админский flow

Страница `/admin/promo-codes` доступна только `admin`.

Вкладка `Промокоды`:

- список кампаний;
- фильтры по статусу и типу;
- create/edit form;
- ручной ввод кода;
- кнопка `Сгенерировать код`;
- inline-индикатор уникальности / конфликта;
- live preview пользовательского текста;
- действия `Пауза`, `Активировать`, `Отозвать`.

Вкладка `Referral`:

- глобальный switch программы;
- проценты invitee/referrer;
- invitee validity и `creditHoldDays`;
- список `referral_redemptions`;
- ручной revoke наград.

## Платформенные ограничения

`apple_iap` остаётся отдельным контуром:

- внутренние promo/referral controls скрыты;
- внутренние promo/referral endpoints защищены `promo-provider-guard`;
- future-ветка для offer codes должна идти отдельной реализацией StoreKit.

## Проверки и поддержка

- `pnpm db:generate` обязателен после изменения `schema.ts`.
- `pnpm db:migrate` выполняется отдельно на нужном окружении.
- Базовые unit tests добавлены для shared promo-логики.
- Полный `pnpm test` и глобальный `pnpm lint` сейчас в проекте имеют внешние, не связанные с promo/referral, падения; перед релизом их надо чинить отдельно.
