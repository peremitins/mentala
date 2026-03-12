# Telegram-уведомления для Mentala

## Первая итерация

Этот документ уже приведён в соответствие с текущей кодовой базой Mentala и не предлагает отдельную «параллельную» архитектуру.

## 1. Что уже есть в проекте и что нужно учитывать

- В проекте уже есть `BullMQ + Redis` и общий клиент очередей: `server/infrastructure/redis/bullmqClient.ts`.
- Воркеры запускаются через Nitro plugins: `server/plugins/bullmq-workers.ts`, `server/plugins/notifications-worker.ts`, `server/plugins/trial-billing-worker.ts`.
- В проекте уже есть прямой вызов Telegram API для заявок с лендинга: `server/application/landing/lead-notifications.service.ts`.
- В проекте уже используется `runtimeConfig.TELEGRAM_BOT_TOKEN` / env `NUXT_TELEGRAM_BOT_TOKEN` для Telegram auth и lead-notifications.
- Источник истины по биллингу сейчас лежит в таблицах `subscription_events`, `payments`, `user_subscriptions`, `users`.
- Удаление пользователя уже реализовано как 2-фазный процесс через `POST /api/user/delete` и `userDeletionQueue`. Поэтому событие «пользователь удалён» и событие «запрошено удаление аккаунта» в текущем коде не одно и то же.
- Изменения схемы БД в проекте вносятся в `server/infrastructure/db/schema.ts`. Отдельные SQL-миграции руками для этой задачи заранее не описываются.

## 2. Цель первой итерации

Сделать лёгкую систему Telegram-уведомлений для внутренних команд Mentala, которая:

- не замедляет пользовательские запросы;
- использует текущий стек `Nitro + BullMQ + Redis`;
- переиспользует существующие источники данных;
- даёт базовые алерты по продукту, биллингу и технике;
- не требует тяжёлой аналитической подсистемы на старте.

## 3. Главный принцип

Отправка Telegram-уведомлений запрещена синхронно внутри пользовательского запроса.

Разрешённый путь:

1. В приложении фиксируется внутреннее событие.
2. Событие превращается в короткий alert-payload.
3. Alert-payload ставится в отдельную BullMQ-очередь.
4. Отдельный воркер в фоне формирует текст и отправляет сообщение в Telegram.
5. Результат доставки логируется.

Запрещено:

- ждать Telegram API внутри `register`, `verify`, `start-checkout`, `cancel`, `webhook`;
- ходить в БД за тяжёлыми обогащениями во время форматирования;
- привязывать бизнес-логику к `chat_id` и `message_thread_id`.

## 4. Каналы первой итерации

Используются 4 логических канала.

### 4.1. DevOps

Для технических и инфраструктурных событий:

- мало свободного места на диске;
- Redis недоступен;
- PostgreSQL недоступен;
- деградация push-доставки;
- всплеск `5xx`;
- другие явно критичные технические события.

Примечание: существующий disk alert из `.docs/disk-guard.md` можно временно оставить отдельным механизмом, но новые события нужно заводить уже через общую alert-схему.

### 4.2. Billing

Для платежей и подписок:

- успешная оплата;
- неуспешная оплата;
- отмена подписки / отключение автопродления;
- ошибка создания платежа;
- ошибка обработки webhook;
- ошибка применения запланированной смены тарифа.

Из первой итерации исключаются:

- refund-уведомления;
- отдельные уведомления по `payment_method_bound/unbound`, если не будет отдельного запроса от бизнеса.

Причина: в текущей кодовой базе нет готового refund-pipeline и нет стабильного источника refund-событий.

### 4.3. Users

Для ключевых пользовательских событий:

- новый пользователь;
- запрос на удаление аккаунта;
- milestone по общему количеству пользователей.

Важно: в первой итерации для users-чата фиксируем именно `запрос на удаление аккаунта`, а не факт физического hard-delete после grace period.

### 4.4. Errors

Для прикладных ошибок, которые реально требуют реакции:

- критическая ошибка приложения;
- критическая ошибка интеграции;
- критическая ошибка ключевого бизнес-сценария.

Сюда не отправляем:

- валидационные ошибки;
- одиночные recoverable ошибки;
- предупреждения и технический шум.

## 5. Daily summary

Отдельный чат под summary в первой итерации не нужен. Сводка уходит в `Users` чат одним сообщением.

### 5.1. Время

- один раз в день;
- в фиксированной timezone проекта;
- базовое значение: `Europe/Moscow`;
- базовое время: `10:00`.

Timezone и время должны быть отдельными server-side настройками, а не хардкодом в нескольких местах.

### 5.2. Период

Сводка строится за предыдущий календарный день в timezone отчёта.

Пример: 13 марта 2026 в `10:00 Europe/Moscow` уходит сводка за 12 марта 2026.

### 5.3. Что реально можно включить в первой итерации

Обязательный минимум:

- новые пользователи: по `users.createdAt`;
- запросы на удаление аккаунта: по `users.deletionRequestedAt`;
- успешные оплаты: по `payments.status = 'succeeded'`;
- сумма успешных оплат: по `payments.amount`;
- неуспешные оплаты: по `subscription_events.eventType = 'purchase_failed'`;
- отмены подписки: по `subscription_events.eventType = 'subscription_canceled'`;
- успешные активации / продления: по `subscription_events.eventType = 'purchase_success'`;
- registration milestones за день, если были.

Опционально, только после отдельного подтверждения источника данных:

- DAU / активные пользователи за день;
- количество критических прикладных ошибок;
- количество DevOps-инцидентов;
- refund-метрики.

Важно: сейчас в проекте нет надёжного единого источника для точного DAU за день. `lastLoginAt` обновляется не во всех auth-flow, поэтому использовать его как «точный активный пользователь за день» нельзя.

### 5.4. Формат

Сообщение должно быть компактным. Пример:

```text
📊 Mentala daily summary — 12.03.2026

Пользователи
- Новые: 14
- Запросы на удаление: 1
- Milestones: 1

Биллинг
- Успешные оплаты: 5
- Неуспешные оплаты: 2
- Успешные активации: 4
- Отмены подписки: 1
- Сумма успешных оплат: 2 495 RUB
```

## 6. Внутренние alert-события

Ниже перечислены именно внутренние типы событий для Telegram alerts. Это не обязано один-в-один совпадать с `subscription_events.eventType` в БД.

### 6.1. DevOps

- `devops.disk_low`
- `devops.redis_unavailable`
- `devops.postgres_unavailable`
- `devops.push_delivery_unavailable`
- `devops.http_500_spike`

### 6.2. Billing

- `billing.purchase_success`
- `billing.purchase_failed`
- `billing.subscription_canceled`
- `billing.checkout_error`
- `billing.webhook_error`
- `billing.subscription_change_failed`

### 6.3. Users

- `user.created`
- `user.deletion_requested`
- `user.registration_milestone_reached`

### 6.4. Errors

- `error.app_critical`
- `error.integration_critical`
- `error.business_flow_critical`

### 6.5. Reports

- `report.daily_summary`

## 7. Маппинг с текущей кодовой базой

### 7.1. Users

- `user.created`:
  источник по умолчанию — создание новой записи в `users`;
  финальную семантику нужно утвердить отдельно для email-flow.
- `user.deletion_requested`:
  источник — успешный `POST /api/user/delete`.
- `user.registration_milestone_reached`:
  вычисляется по общему числу пользователей.

### 7.2. Billing

- `billing.purchase_success`:
  источник — `subscription_events.eventType = 'purchase_success'`.
- `billing.purchase_failed`:
  источник — `subscription_events.eventType = 'purchase_failed'`.
- `billing.subscription_canceled`:
  источник — `subscription_events.eventType = 'subscription_canceled'`.
- `billing.subscription_change_failed`:
  источник — `subscription_events.eventType = 'subscription_change_failed'`.
- `billing.checkout_error`:
  источник — ошибки внутри `POST /api/subscriptions/start-checkout`.
- `billing.webhook_error`:
  источник — ошибки внутри `POST /api/payments/yookassa/webhook`.

Важно: `purchase_success` и `purchase_failed` могут фиксироваться из нескольких code-path. Для Telegram-уведомлений обязательна дедупликация по бизнес-ключу (`paymentId`, либо `subscriptionId + eventType`), иначе одно и то же событие улетит в чат дважды.

## 8. Требования к payload

Payload должен быть самодостаточным и коротким.

Пример:

```ts
{
  type: 'billing.purchase_success',
  dedupKey: 'billing:purchase_success:payment:2b7c...',
  payload: {
    userId: 42,
    subscriptionId: 123,
    paymentId: '2b7c...',
    amount: 499,
    currency: 'RUB',
    planId: 'premium',
    createdAt: '2026-03-12T09:20:00.000Z'
  }
}
```

Обязательные поля envelope:

- `type`;
- `dedupKey`;
- `payload`;
- `createdAt`;
- `source`;

Запрещено делать так, чтобы formatter для обычного сообщения выполнял цепочку тяжёлых догрузок из нескольких таблиц.

## 9. Маршрутизация по чатам

Маршрутизация хранится централизованно в одном конфиге.

Пример:

```ts
const TELEGRAM_ROUTING = {
  'devops.disk_low': 'devops',
  'devops.redis_unavailable': 'devops',
  'devops.postgres_unavailable': 'devops',
  'devops.push_delivery_unavailable': 'devops',
  'devops.http_500_spike': 'devops',

  'billing.purchase_success': 'billing',
  'billing.purchase_failed': 'billing',
  'billing.subscription_canceled': 'billing',
  'billing.checkout_error': 'billing',
  'billing.webhook_error': 'billing',
  'billing.subscription_change_failed': 'billing',

  'user.created': 'users',
  'user.deletion_requested': 'users',
  'user.registration_milestone_reached': 'users',
  'report.daily_summary': 'users',

  'error.app_critical': 'errors',
  'error.integration_critical': 'errors',
  'error.business_flow_critical': 'errors',
} as const;
```

Бизнес-логика не знает `chat_id` и `message_thread_id`.

## 10. Очередь и воркер

Для Telegram alerts нужна отдельная очередь, отдельная от push-уведомлений.

Требования:

- очередь на BullMQ;
- фоновая обработка;
- retry ограничен;
- backoff обязателен;
- сбой Telegram не ломает приложение;
- результат доставки логируется.

Рекомендуемая базовая политика:

- `attempts: 3`;
- `backoff: exponential`;
- `delay: 10_000`;
- `removeOnComplete` и `removeOnFail` по образцу существующих очередей проекта.

## 11. Дедупликация

### 11.1. DevOps и Errors

Обязательна агрегация одинаковых событий в коротком окне.

Примеры:

- 50 одинаковых ошибок Redis за 3 минуты;
- 100 одинаковых `500` по одному route;
- серия одинаковых ошибок интеграции.

Правило:

- первое сообщение отправляем сразу;
- дубли временно подавляем;
- по окончании окна можно отправить summary.

### 11.2. Users

- `user.created` не дедуплицируется;
- `user.registration_milestone_reached` должен иметь жёсткий idempotency key;
- `user.deletion_requested` дедуплицируется по `userId`, если запрос повторён технически.

### 11.3. Billing

- успех и неуспех оплаты дедуплицируются по `paymentId`;
- отмена подписки дедуплицируется по `subscriptionId + eventType`;
- ошибки checkout/webhook дедуплицируются по fingerprint ошибки и временному окну.

## 12. Логирование доставок

Нужен отдельный лог доставок Telegram.

Минимальные поля:

- `id`;
- `event_type`;
- `dedup_key`;
- `target_channel`;
- `status`;
- `attempt`;
- `error_message`;
- `telegram_message_id`;
- `created_at`;
- `sent_at`.

Хранение:

- completed: 14-30 дней;
- failed: 30 дней;
- очистка отдельной периодической задачей.

## 13. Конфигурация

Конфиг должен жить в server runtime config.

Базовый вариант:

- `NUXT_TELEGRAM_BOT_TOKEN`
- `NUXT_TELEGRAM_ALERTS_CHAT_DEVOPS_ID`
- `NUXT_TELEGRAM_ALERTS_CHAT_BILLING_ID`
- `NUXT_TELEGRAM_ALERTS_CHAT_USERS_ID`
- `NUXT_TELEGRAM_ALERTS_CHAT_ERRORS_ID`
- `TELEGRAM_REPORTS_TIMEZONE`
- `TELEGRAM_DAILY_REPORT_HOUR`

Если нужны threads:

- `NUXT_TELEGRAM_ALERTS_THREAD_DEVOPS_ID`
- `NUXT_TELEGRAM_ALERTS_THREAD_BILLING_ID`
- `NUXT_TELEGRAM_ALERTS_THREAD_USERS_ID`
- `NUXT_TELEGRAM_ALERTS_THREAD_ERRORS_ID`

Важно: до реализации нужно отдельно решить, alerting использует текущий `NUXT_TELEGRAM_BOT_TOKEN` или отдельный токен для внутреннего бота.

## 14. Предлагаемая структура кода

Структура должна соответствовать уже существующим паттернам проекта, без нового корневого слоя `events/`.

Рекомендуемая раскладка:

```text
server/
  application/
    telegram/
      telegram-alert.types.ts
      telegram-routing.ts
      telegram.client.ts
      telegram.formatter.ts
      telegram-alerts.service.ts
      daily-summary.service.ts
      queues/
        telegramAlerts.queue.ts
      workers/
        telegramAlerts.worker.ts
      repositories/
        telegram-deliveries.repository.ts
  infrastructure/
    db/
      schema.ts
  plugins/
    telegram-worker.ts
```

Если удобнее, worker можно подключить в существующий `server/plugins/bullmq-workers.ts`, но без смешивания кода push и Telegram в одном модуле.

## 15. Нефункциональные требования

### 15.1. Производительность

- пользовательский API не ждёт Telegram;
- постановка события в очередь дешёвая;
- formatter не делает тяжёлых запросов;
- Redis не забивается шумом одинаковых ошибок.

### 15.2. Надёжность

- Telegram API не влияет на основной бизнес-flow;
- есть retry;
- есть delivery log;
- есть дедупликация;
- есть idempotency на уровне бизнес-ключей.

### 15.3. Масштабируемость

- легко добавить новый тип события;
- легко добавить новый канал;
- scheduler и worker должны корректно жить в multi-instance режиме так же, как другие фоновые подсистемы проекта.

## 16. Что не входит в первую итерацию

- отдельный security chat;
- refund-уведомления;
- DAU и сложная продуктовая аналитика без отдельной событийной схемы;
- тонкая настройка правил из админки;
- пользовательские Telegram-интеграции;
- отдельный UI для управления Telegram alerts.

## 17. Этапы реализации

### Этап 1. Базовый каркас

- очередь;
- воркер;
- client;
- routing;
- formatter;
- delivery log.

### Этап 2. Users и Billing

- `user.created`;
- `user.deletion_requested`;
- milestones;
- `billing.purchase_success`;
- `billing.purchase_failed`;
- `billing.subscription_canceled`;
- `billing.subscription_change_failed`;
- `billing.checkout_error`;
- `billing.webhook_error`.

### Этап 3. Errors и DevOps

- критические бизнес-ошибки;
- интеграционные ошибки;
- Redis / PostgreSQL / push delivery / `5xx spike`;
- интеграция с существующим disk alert.

### Этап 4. Daily summary

- scheduler;
- агрегаты за предыдущий день;
- отправка summary в users-чат.

## 18. Критерии готовности

Фича считается готовой, когда:

- уведомления уходят в правильные чаты;
- пользовательские запросы не ждут Telegram;
- purchase success / failed не дублируются при webhook + polling;
- удаление аккаунта в users-чате трактуется однозначно;
- summary приходит в одно и то же время в одной timezone;
- ошибки доставки логируются;
- шум по DevOps/Error событиям подавляется.
