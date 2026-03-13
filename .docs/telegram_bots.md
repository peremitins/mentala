# Telegram-уведомления для Mentala

## Первая итерация

Этот документ уже приведён в соответствие с текущей кодовой базой Mentala и не предлагает отдельную «параллельную» архитектуру.

## 1. Что уже есть в проекте и что нужно учитывать

- В проекте уже есть `BullMQ + Redis` и общий клиент очередей: `server/infrastructure/redis/bullmqClient.ts`.
- Воркеры запускаются через Nitro plugins: `server/plugins/bullmq-workers.ts`, `server/plugins/notifications-worker.ts`, `server/plugins/trial-billing-worker.ts`.
- В проекте уже есть прямой вызов Telegram API для заявок с лендинга: `server/application/landing/lead-notifications.service.ts`.
- В проекте уже используется `runtimeConfig.TELEGRAM_BOT_TOKEN` / env `NUXT_TELEGRAM_BOT_TOKEN` для Telegram auth и lead-notifications, поэтому для внутреннего alerting нужен отдельный бот и отдельный server-side token.
- Источник истины по биллингу сейчас лежит в таблицах `subscription_events`, `payments`, `user_subscriptions`, `users`.
- Удаление пользователя уже реализовано как 2-фазный процесс через `POST /api/user/delete` и `userDeletionQueue`. Поэтому событие «пользователь удалён» и событие «запрошено удаление аккаунта» в текущем коде не одно и то же.
- Для строгого DAU в кодовой базе пока нет отдельного источника активности, поэтому первая итерация Telegram summary должна сразу добавить lightweight activity-source, а не использовать `lastLoginAt` как прокси.
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

1. В приложении фиксируется доменное или прикладное событие, либо читается релевантное состояние из БД.
2. На сервере строится нормализованное internal alert event для Telegram alerts.
3. Из него формируется короткий alert-payload.
4. Alert-payload ставится в отдельную BullMQ-очередь.
5. Отдельный воркер в фоне формирует текст и отправляет сообщение в Telegram.
6. Результат доставки логируется.

### 3.1. Internal Event vs Alert Payload

В первой итерации нужно различать два уровня:

- доменное / прикладное событие:
  например `user.registered`, `subscription_events.purchase_success`, `user.deletion_requested`;
- normalised internal alert event:
  единый server-side event именно для подсистемы Telegram alerts.

Internal alert event может быть построен на основе:

- одного доменного события;
- нескольких записей БД;
- результата серверного use-case;
- технического сигнала мониторинга.

Но для Telegram alerts он всегда должен иметь единый envelope:

- `type`;
- `dedupKey`;
- `payload`;
- `createdAt`;
- `source`;
- `environment`.

Запрещено:

- ждать Telegram API внутри `register`, `verify`, `start-checkout`, `cancel`, `webhook`;
- ходить в БД за тяжёлыми обогащениями во время форматирования;
- привязывать бизнес-логику к `chat_id`.

## 4. Каналы первой итерации

Используются 4 логических канала.

Важно: в первой итерации это именно логические каналы. Физически все сообщения уходят в один и тот же Telegram чат. Логический канал нужен для маршрутизации, форматирования, дедупликации и будущего разделения по разным чатам.

### 4.1. DevOps

Для технических и инфраструктурных событий:

- мало свободного места на диске;
- деградация push-доставки;
- всплеск `5xx`;
- другие явно критичные технические события.

Примечание: существующий disk alert из `.docs/disk-guard.md` можно временно оставить отдельным механизмом, но новые события нужно заводить уже через общую alert-схему.

### 4.2. Billing

Для платежей и подписок:

- успешная оплата;
- неуспешная оплата;
- успешная привязка карты;
- фактически применённая смена тарифа;
- возврат;
- отмена подписки / отключение автопродления;
- ошибка создания платежа;
- ошибка обработки webhook;
- критическая billing-ошибка.

Правило первой итерации: логический Billing-канал = реальные денежные события + критические billing-ошибки.

Не отправляем сюда:

- `purchase_success` с `paymentId = null`;
- `trial_billing_scheduled`;
- `subscription_change_scheduled`, если изменение только запланировано и ещё не применилось;
- любые подготовительные, плановые и внутренние billing-события без списания или возврата денег;
- `payment_method_unbound` в первой итерации.

Исключение по бизнес-запросу:

- `payment_method_bound` отправляем как отдельный Billing alert;
- `billing.plan_changed` отправляем, когда смена тарифа уже реально применена:
  immediate activation, webhook/polling activation или scheduled apply.

Примечание: refund входит в scope продукта, но в текущей кодовой базе ещё нет готового refund-source. Для реализации первой итерации его нужно добавить отдельно.

### 4.3. Users

Для ключевых пользовательских событий:

- зарегистрированный пользователь;
- запрос на удаление аккаунта.

Правило регистрации:

- email-flow: событие отправляется только после успешного verify / активации;
- OAuth: событие отправляется сразу после успешного создания аккаунта;
- Telegram auth: событие отправляется сразу после успешного создания аккаунта.

Milestone thresholds задаются конфигом.

Стартовый набор:

- `100`;
- `500`;
- `1000`.

Важно: в первой итерации для логического users-канала фиксируем именно `запрос на удаление аккаунта`, а не факт физического hard-delete после grace period.

### 4.4. Errors

Для прикладных ошибок, которые реально требуют реакции:

- критическая ошибка приложения;
- критическая ошибка интеграции;
- критическая ошибка ключевого бизнес-сценария.

Сюда не отправляем:

- валидационные ошибки;
- одиночные recoverable ошибки;
- предупреждения и технический шум.

## 5. Упрощения текущего scope

Из первой итерации убраны:

- daily summary;
- `user_daily_activity` и любой DAU/activity-source учёт;
- registration milestones;
- отдельные `devops.redis_unavailable` и `devops.postgres_unavailable`, потому что без bypass-канала они не давали надёжной доставки при падении той же инфраструктуры.

## 6. Внутренние alert-события

Ниже перечислены именно внутренние типы событий для Telegram alerts. Это не обязано один-в-один совпадать с `subscription_events.eventType` в БД.

### 6.1. DevOps

- `devops.push_delivery_unavailable`
- `devops.http_500_spike`

### 6.2. Billing

- `billing.purchase_success`
- `billing.purchase_failed`
- `billing.payment_method_bound`
- `billing.plan_changed`
- `billing.subscription_canceled`
- `billing.checkout_error`
- `billing.webhook_error`
- `billing.critical_error`

### 6.3. Users

- `user.registered`
- `user.deletion_requested`

### 6.4. Errors

- `error.app_critical`
- `error.integration_critical`
- `error.business_flow_critical`

### 6.6. Формальные определения для DevOps-сигналов

`devops.http_500_spike` в первой итерации считается по global-level правилу:

- не меньше `20` ответов `500-599` за `5` минут по приложению в целом.

Стартовые значения должны задаваться конфигом.

`devops.push_delivery_unavailable` в первой итерации считается по одному из правил:

- доля ошибок push-отправки выше `50%` за окно `5` минут при не менее чем `20` попытках;
- push queue stalled;
- провайдер push недоступен полностью.

Стартовые значения также задаются конфигом.

## 7. Маппинг с текущей кодовой базой

### 7.1. Users

- `user.registered`:
  доменное событие полноценной регистрации, а не факт сырой вставки в `users`;
  email-flow публикует событие после успешного verify;
  OAuth и Telegram публикуют событие сразу после создания аккаунта;
  при формировании Telegram payload дополнительно подтягивается `users.email`.
- `user.deletion_requested`:
  источник — успешный `POST /api/user/delete`;
  для режима `immediate` email передаётся в event явно, потому что запись пользователя уже удалена из БД.

### 7.2. Billing

- `billing.purchase_success`:
  источник — `subscription_events.eventType = 'purchase_success'`, но только для реальных денежных событий с ненулевым `paymentId`.
- `billing.purchase_failed`:
  источник — `subscription_events.eventType = 'purchase_failed'`, если событие относится к реальному платежу.
- `billing.subscription_canceled`:
  источник — `subscription_events.eventType = 'subscription_canceled'`.
- `billing.checkout_error`:
  источник — ошибки внутри `POST /api/subscriptions/start-checkout`.
- `billing.webhook_error`:
  источник — ошибки внутри `POST /api/payments/yookassa/webhook`.
- `billing.critical_error`:
  источник — критические ошибки биллинга, которые ломают реальный денежный сценарий; в текущей реализации это `subscription_change_failed` внутри scheduled plan change и денежные mismatch-кейсы в `POST /api/payments/yookassa/webhook`.

Важно:

- `purchase_success` с `paymentId = null` не уходит в логический Billing-канал;
- `trial_billing_scheduled` не уходит в логический Billing-канал;
- `subscription_change_applied` без движения денег не уходит в логический Billing-канал;
- `purchase_success` и `purchase_failed` могут фиксироваться из нескольких code-path, поэтому для Telegram-уведомлений обязательна дедупликация по бизнес-ключу (`paymentId`, либо `subscriptionId + eventType`).

## 8. Требования к payload

Payload должен быть самодостаточным и коротким.

Пример:

```ts
{
  type: 'billing.purchase_success',
  dedupKey: 'billing:purchase_success:payment:2b7c...',
  environment: 'prod',
  payload: {
    userId: 42,
    subscriptionId: 123,
    paymentId: '2b7c...',
    amountMinor: 49900,
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
- `environment`.

### 8.1. Денежный формат

Для всех Telegram billing alerts вводится единый стандарт:

- в payload денежные суммы передаются в minor units;
- formatter отвечает за преобразование в читаемый денежный формат;
- базовая валюта первой итерации — `RUB`;
- при появлении другой валюты formatter не должен ломаться.

Если исходные данные в БД лежат в рублях, mapper в Telegram alerts обязан нормализовать их в `amountMinor` до постановки задачи в очередь.

### 8.2. Ограничения по данным

В Telegram alerts запрещено отправлять:

- содержимое AI-чатов;
- тексты дневниковых записей;
- терапевтические ответы и чувствительные health-данные;
- phone number;
- полные реквизиты карты или payment method details;
- токены, секреты, webhook signatures и служебные auth headers.

Допустимы только:

- технические идентификаторы;
- email пользователя для операционных alerts уровня `users` / `billing` / `error.business_flow_critical` / `billing.critical_error`, если он нужен для ручной диагностики;
- безопасный минимум billing-данных;
- агрегаты;
- короткий операционный контекст.

Запрещено делать так, чтобы formatter для обычного сообщения выполнял цепочку тяжёлых догрузок из нескольких таблиц.

### 8.3. Environment tag в сообщениях

На текущем этапе используется один общий alerts-bot и один общий чат для `local`, `dev` и `prod`.

Поэтому:

- `environment` обязательно входит в payload;
- formatter обязан добавлять env-метку в заголовок каждого сообщения;
- формат метки: в скобках, например `(dev)` или `(prod)`.

Примеры:

- `🚨 Spike по HTTP 5xx (prod)`
- `💸 Успешный платеж (dev)`

## 9. Маршрутизация по чатам

Маршрутизация хранится централизованно в одном конфиге.

Пример:

```ts
const TELEGRAM_ROUTING = {
  'devops.push_delivery_unavailable': 'devops',
  'devops.http_500_spike': 'devops',

  'billing.purchase_success': 'billing',
  'billing.purchase_failed': 'billing',
  'billing.subscription_canceled': 'billing',
  'billing.checkout_error': 'billing',
  'billing.webhook_error': 'billing',
  'billing.critical_error': 'billing',

  'user.registered': 'users',
  'user.deletion_requested': 'users',

  'error.app_critical': 'errors',
  'error.integration_critical': 'errors',
  'error.business_flow_critical': 'errors',
} as const;
```

Физическая доставка в первой итерации:

- любой логический канал резолвится в один `TELEGRAM_ALERTS_CHAT_ID`;
- разделение по разным чатам откладывается на следующую итерацию.

Бизнес-логика не знает `chat_id`.

## 10. Очередь и воркер

Для Telegram alerts нужна отдельная очередь, отдельная от push-уведомлений.

Требования:

- очередь на BullMQ;
- фоновая обработка;
- retry ограничен;
- backoff обязателен;
- timeout для Telegram API обязателен;
- ограничение скорости отправки обязательно;
- сбой Telegram не ломает приложение;
- результат доставки логируется.

Рекомендуемая базовая политика:

- `attempts: 3`;
- `backoff: exponential`;
- `delay: 10_000`;
- `timeoutMs: 5000`;
- `workerConcurrency: 1` на первой итерации, так как все события идут в один чат;
- последовательная обработка `429 Too Many Requests` с уважением `retry_after`;
- `removeOnComplete` и `removeOnFail` по образцу существующих очередей проекта.

Воркер обязан:

- обрабатывать `429` и `Retry-After`;
- не разгонять бесконтрольный параллелизм;
- логировать код ответа провайдера.

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

- `user.registered` не дедуплицируется;
- `user.deletion_requested` дедуплицируется по `userId`, если запрос повторён технически.

### 11.3. Billing

- успех и неуспех оплаты дедуплицируются по `paymentId`;
- refund дедуплицируется по `refundId` или provider refund key;
- отмена подписки дедуплицируется по `subscriptionId + eventType`;
- ошибки checkout / webhook / critical billing error дедуплицируются по fingerprint ошибки и временному окну.

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
- `provider_response_code`;
- `provider_retry_after_seconds`;
- `telegram_message_id`;
- `created_at`;
- `sent_at`.

Хранение:

- `sent` и `failed`: 30 дней по умолчанию;
- `queued` и `processing` cleanup-задачей не удаляются;
- очистка выполняется отдельной ежедневной server-side задачей с batch cleanup.

## 13. Конфигурация

Конфиг должен жить в server runtime config.

Базовый вариант:

- `TELEGRAM_ALERTS_BOT_TOKEN`
- `TELEGRAM_ALERTS_CHAT_ID`
- `TELEGRAM_REPORTS_TIMEZONE`
- `TELEGRAM_ALERTS_DELIVERY_CLEANUP_ENABLED`
- `TELEGRAM_ALERTS_DELIVERY_RETENTION_DAYS`
- `TELEGRAM_ALERTS_ENV_LABEL`
- `TELEGRAM_API_TIMEOUT_MS`
- `TELEGRAM_HTTP_5XX_SPIKE_THRESHOLD`
- `TELEGRAM_HTTP_5XX_SPIKE_WINDOW_MINUTES`
- `TELEGRAM_PUSH_DEGRADATION_ERROR_RATE_PERCENT`
- `TELEGRAM_PUSH_DEGRADATION_MIN_ATTEMPTS`
- `TELEGRAM_PUSH_DEGRADATION_WINDOW_MINUTES`

Правила текущего rollout:

- используется один и тот же bot token и один и тот же чат для всех окружений;
- окружение определяется server-side и обязательно попадает в сообщение как `(dev)` / `(prod)` / `(local)`;
- разнос по разным чатам для prod/dev откладывается на следующую итерацию;
- alerts-bot всё равно остаётся отдельным от Telegram auth / landing-бота;
- для internal alerting не используем `NUXT_PUBLIC_*`;
- env для alerts должны быть только server-side.

## 14. Предлагаемая структура кода

Структура должна соответствовать уже существующим паттернам проекта.

Допустим тонкий слой `server/application/events/*`, но только как публичный facade для публикации прикладных событий.

Важно:

- внешний business / infra код не должен импортировать Telegram-сервисы напрямую;
- `server/application/events/*` не содержит Telegram API, formatter и delivery-логику;
- Telegram-специфика остаётся внутри `server/application/telegram/*`;
- bridge между app events и Telegram alerts регистрируется отдельным subscriber-модулем.

Рекомендуемая раскладка:

```text
server/
  application/
    events/
      app-events.types.ts
      app-event-bus.ts
      app-events.dispatchers.ts
    telegram/
      telegram-alert.types.ts
      telegram-routing.ts
      telegram.client.ts
      telegram.formatter.ts
      telegram-alerts.service.ts
      telegram-event-subscribers.ts
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
    telegram-event-subscribers.ts
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
- есть idempotency на уровне бизнес-ключей;
- при недоступности Redis app-level Telegram alerts могут временно не ставиться в очередь;
- fallback на прямую синхронную отправку без Redis в первую итерацию не входит.

### 15.3. Масштабируемость

- легко добавить новый тип события;
- легко добавить новый канал;
- scheduler и worker должны корректно жить в multi-instance режиме так же, как другие фоновые подсистемы проекта.

## 16. Что не входит в первую итерацию

- отдельный security chat;
- сложная продуктовая аналитика и daily summary;
- тонкая настройка правил из админки;
- пользовательские Telegram-интеграции;
- отдельный UI для управления Telegram alerts;
- fallback-механизм прямой отправки при недоступности Redis.

## 17. Этапы реализации

### Этап 1. Базовый каркас

- очередь;
- воркер;
- client;
- routing;
- formatter;
- delivery log.

### Этап 2. Users и Billing

- `user.registered`;
- `user.deletion_requested`;
- `billing.purchase_success`;
- `billing.purchase_failed`;
- `billing.subscription_canceled`;
- `billing.checkout_error`;
- `billing.webhook_error`;
- `billing.critical_error`.

### Этап 2b. Refunds

Подэтап удалён из текущего scope: отдельный refund-source в проекте не поддерживается.

### Этап 3. Errors и DevOps

- критические бизнес-ошибки;
- интеграционные ошибки;
- push delivery / `5xx spike`.

## 18. Критерии готовности

Фича считается готовой, когда:

- уведомления уходят в общий alerts chat с корректной env-меткой и корректным логическим каналом;
- пользовательские запросы не ждут Telegram;
- `user.registered` трактуется одинаково во всех auth-flow;
- billing alerts не дублируются при повторной обработке одного и того же provider-события;
- `purchase_success` без `paymentId` не попадает в логический Billing-канал;
- в логический users-канал уходит именно `user.deletion_requested`, а не hard-delete;
- ошибки доставки логируются;
- шум по DevOps/Error событиям подавляется.
