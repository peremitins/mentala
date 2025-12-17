# Ревью подписок/биллинга — актуальный статус

## Что уже закрыто (можно не возвращаться)

- Webhook YooKassa:
  - подлинность подтверждается через API YooKassa (`GET /v3/payments/{payment_id}`) + (опц.) IP allowlist;
  - идемпотентность по `payments.id` + защита от гонок через `ON CONFLICT DO NOTHING`;
  - сумма/валюта платежа сверяются с ожидаемыми `user_subscriptions.checkout_*`;
  - кредит обновляется строго при финализации `pending -> active/canceled` (защита от повторных начислений) и атомарно (SQL‑инкремент);
  - все критичные мутации выполняются в транзакции.
- Checkout:
  - `POST /api/subscriptions/start-checkout` обязателен `Idempotency-Key`;
  - ответ сохраняется в `idempotency_keys.response_json` и повторные вызовы возвращают тот же результат.
- Смена плана:
  - текущая `active` подписка не переводится в `expired` до успешной оплаты новой;
  - перевод старой в `expired` делается после финализации (в webhook/внутренней финализации).
- Trial:
  - Trial не отдельный план; завершается при покупке платного плана.
- Учёт минут:
  - `therapy_sessions.last_activity_at` обновляется (ping + серверное обновление при запросах в чат);
  - неделя считается в timezone пользователя.
- Серверные ограничения:
  - доступ к AI и недельный лимит минут проверяются на сервере;
  - `/api/chat/stream` требует `therapySessionId`, чтобы нельзя было обойти биллинг прямыми вызовами.

## Что остаётся сделать (осознанные TODO, без костылей)

1. Реальный checkout YooKassa:
   - в `start-checkout` заменить mock на `POST /v3/payments`;
   - сохранять `payment.id` в `user_subscriptions.yookassa_payment_id`;
   - возвращать `confirmation.confirmation_url` как `paymentUrl`;
   - использовать `Idempotence-Key` (YooKassa) + наш `Idempotency-Key`.
2. Автопродление/отмена в YooKassa:
   - когда появится recurring/подписки в YooKassa — реализовать отмену на их стороне из `POST /api/subscriptions/cancel`.
3. Логи:
   - убрать лишние `console.*` в server‑коде, перевести на структурный логгер (`event.context.logger`/pino) без лишних payload.
4. UX paywall:
   - когда `403/402` по лимиту/доступу — показать понятный экран/модалку и CTA на `/subscription` (сейчас это скорее «техническая» ошибка).
