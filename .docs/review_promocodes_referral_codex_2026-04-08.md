# Ревью незакомиченного состояния: промокоды, access codes и referral

Дата: 2026-04-08
Формат: code review по текущему незакомиченному worktree, без правок продуктового кода
Исходные требования: `.docs/arch_promo_codes.md`, `.docs/arch_billing.md`, `.docs/mentai_tz_frontend.md`

## Что именно я проверил

- Серверный flow промокодов, referral и access codes.
- Интеграцию с checkout, webhook, retry-charge, trial billing и scheduled plan change.
- DTO, API-слой, схему БД, фронтовые entry points (`/subscription`, `/settings`, `/auth`, paywall).
- Наличие тестового покрытия на новую логику.

## Что я дополнительно прогнал

- `pnpm vitest run tests/promo.shared.test.ts tests/billing-credit.service.test.ts tests/referral-profile.persistence.test.ts`
  Результат: `3/3` файлов, `9/9` тестов прошли.
- `pnpm eslint ...` по затронутым файлам promo/referral/billing-flow
  Результат: ошибок линтера на выбранном наборе файлов нет.

## Что я отдельно перепроверил и НЕ считаю багом

- `reserveBestDiscountGrant()` больше не выглядит сломанным: там есть `pg_advisory_xact_lock` и guarded `UPDATE`, поэтому старый сценарий с двойной резервацией одного и того же гранта уже не подтверждается по коду.
- `redeemPromoCode()` теперь маппит `23505` в `409`, то есть гонка redeem не уходит в голый `500`.
- post-auth pending access code больше не чистится на transient-ошибках сети/5xx.
- `free_access_days` для активного trial теперь сдвигает `trialEndedAt` и `nextChargeAt`, а не только выдаёт overlay-доступ.

## Критические замечания

### 1. `releaseDueBillingCredits()` может начислить один и тот же credit entry больше одного раза

Файл: `server/application/subscriptions/billing-credit.service.ts:37-126`

Проблема:

- функция сначала делает `SELECT` всех `pending` записей, срок которых наступил;
- потом отдельным `UPDATE` переводит их в `posted`;
- после этого без проверки `affected rows` увеличивает `users.billingCredit` и декрементит `pendingRewardsCount`.

Если два запроса приходят одновременно, оба могут прочитать один и тот же набор `pending` записей до того, как первый коммитнет `UPDATE`.

Сценарий:

1. Пользователь открывает приложение в двух вкладках или одновременно дёргаются `/api/subscriptions/current` и `/api/referral/me`.
2. Оба запроса вызывают `releaseDueBillingCredits()`.
3. Оба читают одну и ту же pending-награду.
4. Первый запрос переводит entry в `posted` и начисляет баланс.
5. Второй запрос уже не обновляет строку в `billing_credit_entries`, но всё равно повторно увеличивает `users.billingCredit`, потому что работает по старому in-memory списку `rows`.

Что ломается:

- referrer может получить двойное начисление `billingCredit`;
- `pendingRewardsCount` тоже может уехать вниз лишний раз;
- баг денежный, потому что его реально можно поймать обычной конкурентной нагрузкой.

Как исправить:

- переделать функцию на `UPDATE ... WHERE status = 'pending' AND available_at <= now RETURNING ...`;
- агрегировать и начислять только те строки, которые реально вернул `RETURNING`;
- как альтернатива: `SELECT ... FOR UPDATE SKIP LOCKED`, но `UPDATE ... RETURNING` здесь проще и надёжнее.

---

### 2. Во secondary billing flows скидка и billing credit всё ещё применяются неатомарно

Файлы:

- `server/application/subscriptions/scheduled-plan-change.service.ts:375-440`
- `server/application/subscriptions/trial-billing-worker.service.ts:295-379`
- `server/api/subscriptions/retry-charge.post.ts:183-274`

Проблема:

- `reserveBestDiscountGrant()` и `applyAvailableBillingCredit()` вызываются до того, как внешний платёжный шаг становится по-настоящему устойчивым;
- в `scheduled-plan-change` это вообще размазано по нескольким `db.*` вызовам без единой вызывающей транзакции;
- в `trial-billing-worker` и `retry-charge` состояние тоже меняется до завершения провайдерского шага, а восстановление живёт только в error-ветках текущего процесса.

Почему это всё ещё опасно:

- если процесс упал между списанием кредита и созданием/сохранением provider payment;
- если сервер получил kill/timeout;
- если провайдер вернул аномальный ответ и код ушёл не в ту ветку восстановления;
- если параллельно стартует другой billing-flow и видит уже уменьшенный `users.billingCredit`.

Что ломается:

- пользователь может потерять `billingCredit` без завершённого биллингового результата;
- discount grant может остаться в `reserved`;
- дальнейший retry уже стартует из грязного состояния;
- это особенно плохо для `scheduled-plan-change`, потому что там уже создаётся pending subscription и одновременно очищается schedule.

Как исправить:

- сделать один внешний orchestrator-level transaction/lock на пользователя для всего блока `reserve discount -> debit credit -> persist attempt/pending subscription metadata`;
- до вызова провайдера фиксировать отдельное устойчивое состояние попытки, из которого потом можно гарантированно восстановиться;
- `applyAvailableBillingCredit()` нельзя оставлять как “прочитал баланс -> посчитал appliedAmount -> UPDATE” без блокировки пользователя на всё время потока;
- минимально: держать user-level lock до конца всей подготовки attempt-а, а не только внутри `reserveBestDiscountGrant()`.

## Значимые замечания

### 3. `scheduled-plan-change` слишком рано “забирает” запланированную смену и в части failure-веток теряет её навсегда

Файл: `server/application/subscriptions/scheduled-plan-change.service.ts:212-230`

Проблема:

- schedule очищается сразу через `claimedRows`;
- дальше есть ветки, где операция завершается `failed`, но schedule уже не восстанавливается.

Подтверждённые проблемные ветки:

- `payment_method_not_bound` — `server/application/subscriptions/scheduled-plan-change.service.ts:305-330`
- `target_plan_not_found` — `server/application/subscriptions/scheduled-plan-change.service.ts:342-367`
- `payment_id_missing` — `server/application/subscriptions/scheduled-plan-change.service.ts:633-683`
- `amount_currency_mismatch` — `server/application/subscriptions/scheduled-plan-change.service.ts:740-809`

Следствие:

- пользователь теряет запланированную смену тарифа без retry state;
- в UI больше нечего показывать, хотя реальная бизнес-операция не завершилась корректно;
- восстановление потом возможно только руками через поддержку/админку.

Как исправить:

- не очищать `scheduledPlanId*` до тех пор, пока не создан устойчивый pending state;
- либо вводить `scheduled_change_status = processing | failed | applied`, а не обнулять поля;
- либо симметрично восстанавливать schedule во всех неуспешных ветках, а не только в `payment_create_failed`.

---

### 4. Zero-amount activation paths не отправляют app events, хотя в БД уже пишут `purchase_success`

Файлы:

- `server/api/subscriptions/start-checkout.post.ts:1031-1167`
- `server/api/subscriptions/start-checkout.post.ts:1644-1718`
- `server/application/subscriptions/scheduled-plan-change.service.ts:442-516`

Почему это важно:

- в этих ветках подписка успешно активируется;
- в `subscription_events` уже пишется `purchase_success`;
- но `dispatchBillingPurchaseSuccessEvent()` и, местами, `dispatchBillingPlanChangedIfNeeded()` не вызываются.

Кого это ломает:

- `server/plugins/referral-event-subscribers.ts:18-29`
- `server/application/notifications/notification-event-subscribers.ts:18-34`
- `server/application/telegram/telegram-event-subscribers.ts:50-64`

Фактический эффект:

- часть побочных эффектов на успешную покупку не срабатывает;
- авто-восстановление AI notifications после покупки может не отработать;
- Telegram/app-events будут расходиться с тем, что реально записано в БД.

Как исправить:

- после успешного commit-а в zero-amount ветках вызывать те же app events, что и в non-zero happy path;
- не плодить special-case семантику “в БД success есть, а domain event нет”.

---

### 5. `effectiveBillingShiftDays` сейчас считает историю за всю жизнь пользователя, а не текущий effective shift

Файл: `server/application/promo-codes/billing-schedule-adjustments.service.ts:16-29`

Проблема:

- `getEffectiveBillingShiftDaysForUser()` делает просто `sum(days)` по всей таблице `billing_schedule_adjustments`;
- таблица при этом выглядит как аудит, а не как storage текущего активного сдвига.

Что из-за этого будет:

- UI может вечно показывать “Ближайшая платёжная граница уже сдвинута на N дн.”, даже когда этот сдвиг уже отыгран и исторически поглощён следующими циклами;
- метрика `effectiveBillingShiftDays` начинает означать “сколько дней мы когда-либо суммарно добавили пользователю”, а не “какой сдвиг действует сейчас”.

Как исправить:

- либо хранить отдельно materialized current shift;
- либо вычислять effective shift относительно текущего billing boundary, а не по сумме всей истории;
- текущее имя метода и текущее поведение семантически не совпадают, одно из двух надо менять.

## Обычные замечания

### 6. В `FeaturePaywallModal` промо-CTA может показаться на iOS до того, как загрузился `billingProviderHint`

Файл: `app/components/subscription/FeaturePaywallModal.vue:217-221`

Проблема:

- логика сейчас такая: `subscriptionStore.subscriptionData?.billingProviderHint !== 'apple_iap'`;
- пока `subscriptionData` ещё `null`, выражение даёт `true`.

Следствие:

- на iOS пользователь может увидеть кнопку `Есть промокод?`, хотя по требованиям internal promo/referral controls для `apple_iap` показываться не должны.

Как исправить:

- показывать CTA только если `billingProviderHint === 'yookassa'`;
- не использовать “undefined значит можно показывать” для flow-gating.

## Чего не хватает в тестах

- Нет теста на конкурентный вызов `releaseDueBillingCredits()`.
- Нет теста на crash-safe/rollback-safe поведение `scheduled-plan-change`, `trial-billing-worker` и `retry-charge` после списания кредита.
- Нет e2e/интеграционного теста на zero-amount activation paths с проверкой app-event side effects.
- Нет теста на то, что `effectiveBillingShiftDays` отражает текущий, а не исторический сдвиг.

## Приоритет фиксов

### До мержа

1. Исправить конкурентное двойное начисление в `releaseDueBillingCredits()`.
2. Довести secondary billing flows до консистентной модели reserve/debit/reconcile.
3. Убрать потерю schedule в `scheduled-plan-change` failure-ветках.
4. Добавить app-event dispatch в zero-amount success paths.

### Следом

5. Переделать расчёт `effectiveBillingShiftDays`.
6. Починить gating promo CTA в paywall modal.

## Вывод

Базовая архитектура по промокодам и referral уже стала заметно лучше, чем в раннем черновом состоянии: закрыты несколько очевидных гонок и появились недостающие guards. Но в текущем незакомиченном виде я бы не считал фичу готовой к merge без правок по `billingCredit` concurrency и без выравнивания secondary billing flows, потому что именно там сейчас лежат реальные денежные и state-consistency риски.
