# Ревью: промокоды, коды доступа и реферальная программа

Дата ревью: 2026-04-08
Ветка: `feature/refferal`
Скоуп: незакомиченные изменения по задачам промокодов, access-кодов и реферальной программы.

Смотрел: schema.ts, shared/dto/{promo-code,access-code,referral}.ts, server/application/{promo-codes,access-codes,referral,subscriptions/billing-credit\*}, server/api/{admin/promo-codes, access-codes, referral}, webhook.post.ts, start-checkout.post.ts, auth/index.vue, usePendingAccessCode, pending-access-code.client.ts.

Дисклеймер: ревью по чтению кода, без запуска. Некоторые сценарии требуют верификации на живой БД/нагрузке.

---

## 🔴 Критические

### 1. Race при `reserveBestDiscountGrant` — возможна двойная апликация одного гранта

**Файл:** `server/application/promo-codes/promo-discount-grants.service.ts:142-249`

Выбор гранта идёт через `SELECT` без блокировки (нет `FOR UPDATE`), затем `UPDATE` по `id`. Два параллельных checkout'а одного юзера:

1. Оба читают список доступных грантов, оба выбирают один и тот же top-1 грант.
2. Первый помечает его `reservation_key = K1`.
3. Второй делает `UPDATE` тем же id и перезаписывает `reservation_key = K2` (условия `WHERE` нет по key, только по `id`).
4. Оба считают итоговую сумму со скидкой и отправляют платёж в YooKassa.
5. `finalizeDiscountGrantSuccess` ищет по `reservationKey = 'reserved'`. Побеждает только второй (у него совпадает ключ). Первый получает `null` — грант у него "не погасился", но он уже заплатил со скидкой.

Итог: один грант даёт скидку двум платежам. Это прямые денежные потери.

**Как воспроизвести:** дублируем запрос POST `/api/subscriptions/start-checkout` почти одновременно (два tab'а, spamming по кнопке, ретраи сети). В логах увидим два платежа с `promoDiscountPercent > 0`, а грант один.

**Фикс:** либо `SELECT … FOR UPDATE SKIP LOCKED` при выборе кандидатов, либо сделать UPDATE-with-returning с условием `status IN ('active') OR reservation_key = :key` и проверять affected rows. Альтернатива — advisory lock по `user_id` на время checkout'а.

---

### 2. Discount grant и billing credit применяются ВНЕ транзакции до создания платежа

**Файл:** `server/api/subscriptions/start-checkout.post.ts:980-1022` (saved-method) и `:1515-1555` (checkout flow)

Последовательность:

```
reserveBestDiscountGrant()          // UPDATE discount grant вне tx
applyAvailableBillingCredit()       // UPDATE users.billing_credit, INSERT ledger entry вне tx
… затем createYooKassaPayment() и db.transaction([…])
```

Если после `applyAvailableBillingCredit` упадёт что-то до `yookassaPaymentCreated = true`, в `catch` вызываются `restoreAppliedBillingCredit` и `releaseDiscountGrantReservation`, но оба с `.catch(() => {})` — любая ошибка восстановления проглатывается. При падении процесса (SIGKILL, таймаут, 500 между шагами) никто не вернёт кредит и не освободит грант.

Более того, `credit` уже списан на этапе, когда subscription ещё не создана — если ловим 409 или throw до `pendingSubscription` insert, у юзера минусовый кредит в базе до ручного восстановления.

**Фикс:** сделать reserve/apply внутри транзакции, которая создаёт pending-сабскрипшн. Или — если грант нужен до сабскрипшна для расчёта YooKassa-платежа — хранить "tentative" reservation со своим TTL и явно помечать `finalizeDiscountGrantSuccess` только в webhook'е. В случае с billing credit — списывать только после подтверждения (в webhook `succeeded`), иначе это hot path для потери денег.

---

### 3. Race при `processReferralRewardsAfterPurchase` — возможен "осиротевший" pending credit entry

**Файл:** `server/application/referral/referral-rewards.service.ts:235-337`

Схема: две параллельные оплаты одного invitee (редкий, но реальный кейс — webhook-ретраи yookassa). Оба читают `redemption` со статусом `pending_conversion`, оба вставляют `billingCreditEntries` pending, оба делают `UPDATE … WHERE status='pending_conversion'`. Один выигрывает и получает `updatedRows[0]`, второй возвращает `null`.

Проблема: pending credit entry уже вставлен ДО UPDATE. Проигравший транзакционно откатит? Нет — обе операции в одной транзакции, но транзакции независимы (отдельные webhook'и). Откатывать нечего — второй просто возвращает `null`, но свой INSERT уже закоммитит. Получаем дубликат pending credit entry без соответствующей конверсии.

**Фикс:** вставку pending credit entry делать ПОСЛЕ success-check update (`UPDATE … RETURNING`, и только если вернулся ряд — вставлять entry). Или уникальный индекс на `billing_credit_entries(source_referral_redemption_id)` для `entry_type='referral_referrer_reward'`.

---

### 4. Webhook YooKassa идемпотентность vs discount finalize

**Файл:** `server/api/payments/yookassa/webhook.post.ts:906-913`

`finalizeDiscountGrantSuccess({ reservationKey: 'checkout-subscription:${sub.id}' })` вызывается внутри success-webhook'а. YooKassa шлёт webhook'и с ретраями. Вторая доставка уже увидит `status != 'reserved'` (`applied`) и ничего не сделает — OK.

Но: в `start-checkout` для saved-method flow grant финализируется inline в запросе (ключ `saved-checkout:${userId}:${idempotencyKey}`), а webhook для того же платежа придёт чуть позже и попытается финализировать по ключу `checkout-subscription:${sub.id}` — другой ключ → no-op. Это корректно, но означает, что логика зависит от того, попал ли платёж под saved-method flow или нет. Нет явной проверки и при баге в ветке легко двойно-финализировать. Подтверждается тестами? (`tests/` содержит только `billing-credit.service.test.ts` и `promo.shared.test.ts`, прямого теста на saved-method/webhook взаимодействие нет.) Рекомендую добавить e2e-тест.

---

## 🟠 Значимые

### 5. `AdminPromoCampaignCreateDto` не требует `targetUserId`/`targetEmail` для `bindingMode` ≠ none

**Файл:** `shared/dto/promo-code.ts:156-188`

`AdminPromoCampaignUpdateDto` валидирует `bindingMode='user_id'` → `targetUserId` обязателен, `bindingMode='email'` → `targetEmail` обязателен. Но `Create` DTO этой проверки не имеет. Админ может создать кампанию с `bindingMode='user_id'`, но без `targetUserId`, и попасть в обход ограничения.

**Последствие:** в `promo-code-preview.service.ts:156-165` проверка — `if (campaign.bindingMode === 'user_id' && campaign.targetUserId && campaign.targetUserId !== params.userId)`. Если `targetUserId` равен `null`, проверка пропускается — любой пользователь активирует якобы персональный промокод.

**Фикс:** superRefine в `AdminPromoCampaignCreateDto` аналогичный `Update`. И/или в preview service — если `bindingMode` != `'none'`, но `targetUserId/targetEmail` null — отклонять.

---

### 6. `promo-code-redeem.service.ts` дважды грузит контекст

**Файл:** `server/application/promo-codes/promo-code-redeem.service.ts:36-47`

В транзакции сначала `loadValidatedPromoCampaignContext`, затем `previewPromoCode`, который САМ снова вызывает `loadValidatedPromoCampaignContext`. Дублирующая нагрузка + потенциальная гонка, если между двумя вызовами что-то изменится (в рамках одной tx — не должно, но код всё равно выполняет все SELECT'ы два раза).

**Фикс:** `previewPromoCode` должен принимать уже загруженный context и только форматировать ответ.

---

### 7. Free access days во время trial не сдвигают дату списания

**Файл:** `server/application/promo-codes/billing-schedule-adjustments.service.ts:67-81`

Если у пользователя нет активной платной подписки (он на trial), `applyBillingScheduleAdjustment` возвращает `shiftApplied: false` и ничего не делает с `users.trialEndedAt` / `users.nextChargeAt`. Но `billingAccessGrant` выдан и юзер видит Pro/Premium.

Результат: юзер на trial применяет промокод "30 дней Pro", получает overlay, но trial заканчивается и с него списывают деньги в исходную дату, хотя "честный сдвиг" по смыслу должен был сдвинуть и trial end / next charge. По смыслу фичи это баг — юзер ожидает получить 30 дополнительных дней.

**Фикс:** в trial-ветке отдельно сдвигать `trialEndedAt` и `nextChargeAt` на количество дней. Проработать взаимодействие с `trial-billing-worker`.

---

### 8. `revokeReferralBillingCreditEntry` может двойно декрементить `pendingRewardsCount`

**Файл:** `server/application/subscriptions/billing-credit.service.ts:348-420`

Если entry уже перешёл в `posted` (deduct на `users.billingCredit` состоялся), функция уменьшает `pendingRewardsCount` ещё раз, хотя при release (`releaseDueBillingCredits:115-122`) счётчик уже уменьшался. Клэмп `greatest(... - 1, 0)` защищает от отрицательных значений, но real value = текущий legitimate pending count минус 1 — статистика искажается.

**Фикс:** декрементить `pendingRewardsCount` только в ветке `entry.status === 'pending'`.

---

### 9. `pending-access-code.client.ts` чистит код при любой ошибке

**Файл:** `app/plugins/pending-access-code.client.ts:75-78`

Любое падение (network glitch, 5xx, timeout) — и код навсегда удалён из cookie. Пользователь ввёл промокод при регистрации, а потом из-за временной ошибки сети теряет его. Раньше бы перепопыткой сработало.

**Фикс:** различать клиентские ошибки (404/409/403 — это "финальный" провал, чистим) и transient (5xx, network — оставляем код для повтора). Можно попробовать ретрай N раз.

---

### 10. `redeemPromoCode` / `redeemReferralCode` — проверка binding внутри tx не защищает от гонок по transaction level

Транзакция Postgres по умолчанию в `read committed`. В `loadValidatedPromoCampaignContext` делается SELECT `promoCampaigns`, `assertPromoCampaignAvailable` делает SELECT `promoCodeRedemptions`. Между ними параллельная tx может успеть вставить redemption. Спасает `uk_promo_code_redemptions_campaign` unique constraint — второй INSERT упадёт с 23505. Но обработка этого `23505` не предусмотрена (`buildRedeemError` не покрывает). Пользователь увидит 500 вместо "Промокод уже использован".

**Фикс:** try/catch 23505 → 409 user-friendly.

---

## 🟡 Обычные / стилистические

### 11. `isLowerPlan(targetPlanId, effectivePlan.planId === 'basic' ? 'basic' : effectivePlan.planId)`

`promo-code-preview.service.ts:240-243` — тернарник тавтологичный, просто `effectivePlan.planId`.

### 12. `resolveDbClient(tx?: any)` и `tx: any` везде

В новых сервисах `tx` типизирован как `any`. При миграциях Drizzle легко потерять типобезопасность. Есть ли утилитный тип `DbOrTx`? Стоит зафиксировать.

### 13. `server/plugins/referral-event-subscribers.ts` — всего 5 строк, непонятно зачем plugin-обёртка. Можно инлайнить.

### 14. DTO `PromoBenefitPayloadDto` дублирует валидацию `planMode='explicit' требует explicitPlanId` в двух местах (`FreeAccessDaysBenefitPayloadBaseDto.superRefine` И во внешнем `discriminatedUnion.superRefine`). Можно оставить только внешний или только внутренний.

### 15. `ensureReferralProfile` генерирует уникальный код через цикл на 20 попыток — при коллизии с промокодом код получит conflict. 20 попыток — приемлемо, но хорошо бы логировать случаи близкие к exhaust.

### 16. В `promo-code-preview` и `referral-redeem` сообщения-строки зашиты по-русски в бэке — проект локализует через i18n ключи (в CLAUDE.md явно: "сервер отдаёт ключи i18n"). Нарушение архитектурного правила. Все `statusMessage`, `message`, `title`, `description`, `warning` должны быть i18n-ключами.

### 17. `assertAccessCodeAvailable` — race между проверкой и INSERT. Полагаемся на unique constraints — это OK, но тогда проверка вообще не нужна, достаточно ловить 23505. Упрощает код.

### 18. `server/api/admin/promo-codes/index.post.ts` — админ передаёт `status: 'active'` хардкодом, но в DTO `Create` нет поля `status`. ОК, но означает, что `draft`-состояние нельзя создать через API (только через update). Это дизайн-решение? Документировать.

### 19. `AdminPromoCampaignCreateDto.adminComment.max(500)` — в schema `text('admin_comment')` без лимита. Минорная несинхронность, но валидатор жёстче чем БД — ОК.

### 20. `billing-schedule-adjustments` не учитывает, что user может иметь `scheduled_plan_change` — сдвиг `scheduledChangeAt` на `days` корректен, но не синхронизируется с `scheduled-plan-change.service.ts` (тот тоже изменён в этом ветке — проверить совместимость).

### 21. Файл `.playwright-cli/` попал в `??` untracked — добавить в `.gitignore`.

---

## Тесты

Присутствуют:

- `tests/billing-credit.service.test.ts`
- `tests/promo.shared.test.ts`
- `tests/referral-profile.persistence.test.ts`

Не хватает:

- Тесты на redeem промокода с разными bindingMode (особенно negative-case для `user_id`+null).
- Тесты на параллельный redeem (race на unique constraint).
- Тесты на `reserveBestDiscountGrant` при одном гранте и двух concurrent checkout'ах.
- E2E на flow "saved-method 100% скидкой" — сейчас есть большая ветка без тестов.
- Тест на `processReferralRewardsAfterPurchase` idempotency при повторе webhook'а.
- Тест на pending-access-code.client.ts: transient error → код не теряется.

---

## Обратная совместимость (CLAUDE.md)

- Добавлены только новые таблицы, новых required-полей в существующие таблицы не видно в diff schema (кроме новых default-ных колонок — safe). ✅
- Новые поля в ответах API (`promoDiscountPercent`, `promoDiscountAmount`) — nullable/optional. ✅
- Сообщения на бэке — по-русски в plain text (см. п. 16). ❌

---

## Сводная приоритизация фиксов

Перед мержем в main **обязательно**:

1. #1 Race reserveBestDiscountGrant (потеря денег).
2. #2 Credit/grant вне транзакции (потеря денег).
3. #3 Race processReferralRewardsAfterPurchase (дубликат награды).
4. #5 Create DTO binding validation (обход персональных промокодов).
5. #10 Маппинг 23505 → 409 (UX).

В ближайшем follow-up: 6. #7 Trial + free access days сдвиг (некорректное начисление). 7. #8 pendingRewardsCount double-decrement. 8. #9 Cookie-cleanup на transient error. 9. #16 Локализация через i18n.

Остальное — по мере ревью/cleanup.
