# Система подписок Mentala

Краткая спецификация и инструкция по настройке.  
Текущее состояние (`as-is`): подписочный контур (тарифы, лимиты, server-side gate, Trial, paywall на AI-функции, TTS kill-switch) уже реализован.  
Интеграция с YooKassa сейчас в pre-integration режиме: `start-checkout` работает через `pending`-подписку и mock `paymentUrl`, а боевой `POST /v3/payments` будет включён после получения рабочих данных YooKassa.

---

## 0. Важно: что уже сделано без рабочих данных YooKassa

**Реализовано сейчас (можно использовать):**

1. Рабочая тарифная матрица `Basic/PRO/Premium` + Trial 7 дней (для AI-доступов и напоминаний).
2. Серверный контроль доступа к ИИ-чату и ИИ-напоминаниям (без доверия клиенту).
3. Единый лимитный контракт `HTTP 402` для `start session/chat/chat stream`.
4. Premium fair-use guard `900 мин/нед`.
5. Жёсткий allowlist модели чата на сервере.
6. Budget guard до обращения к провайдеру в `POST /api/chat` и `POST /api/chat/stream`.
7. TTS kill-switch (`FEATURE_TTS_ENABLED=false` по умолчанию) на backend и frontend.

**Отложено до получения данных YooKassa:**

1. Реальный create-payment (`POST https://api.yookassa.ru/v3/payments`) и получение `confirmation_url`.
2. Полный production reconciliation pending-платежей по `payment.id`.
3. Операционный hardening (`checkoutStatus`, single-pending/single-active инварианты, admin flow для manual review).

---

## 1. Тарифы (зафиксированная продуктовая матрица v1)

> Для AI-доступов и контентных ограничений (`meditations/breath/sos`) матрица синхронизирована с backend через entitlement-слой.

| Тариф       | Цена (мес) | Лимит ИИ-минут/неделю | Кому нужен                                                                        |
| ----------- | ---------- | --------------------- | --------------------------------------------------------------------------------- |
| **Basic**   | 0 ₽        | 0                     | Пользователь, которому нужны только шаблонные уведомления без ИИ-чата             |
| **PRO**     | 399 ₽      | 100                   | Пользователь, которому нужен регулярный текстовый ИИ-чат без «тяжёлых» ИИ-функций |
| **Premium** | 899 ₽      | Безлимит\*            | Активный пользователь, которому нужен максимальный ИИ-функционал                  |

Годовой план: скидка ~20% (`месяц × 12 × 0.8`). В UI — переключатель «Месяц / Год».

**Trial:** не отдельный тариф, а состояние Basic на 7 дней после регистрации.  
Во время Trial — для Basic включается полный ИИ-доступ уровня Premium (с той же fair-use защитой, что и у Premium).  
После окончания — Basic без ИИ-доступа. Повторный Trial недоступен (`hasUsedTrial`).

### 1.1 Доступность функций по тарифам

| Функция                                          | Basic        | PRO                    | Premium                |
| ------------------------------------------------ | ------------ | ---------------------- | ---------------------- |
| Текстовый ИИ-чат                                 | ❌           | ✅                     | ✅                     |
| Лимит минут ИИ-чата                              | 0            | 100/нед                | Безлимит\*             |
| SOS: техники «Быстрой стабилизации»              | ✅           | ✅                     | ✅                     |
| SOS: переход в ИИ-чат после техники              | ❌           | ✅                     | ✅                     |
| Медитации                                        | ❌           | ✅ (полная библиотека) | ✅ (полная библиотека) |
| Дыхательные практики                             | 2 популярные | Все                    | Все                    |
| Создание кастомной дыхательной практики          | ❌           | ✅                     | ✅                     |
| Уведомления на шаблонах (`textSource=templates`) | ✅           | ✅                     | ✅                     |
| ИИ-напоминания (`textSource=ai`)                 | ❌           | ❌                     | ✅                     |
| Кастомный prompt для ИИ-напоминаний              | ❌           | ❌                     | ✅                     |
| Приоритет генерации ИИ-напоминаний               | ❌           | ❌                     | ✅                     |
| Приоритетная поддержка                           | ❌           | ❌                     | ✅                     |

\* `Безлимит` для Premium означает отсутствие пользовательского фиксированного лимита в UI, но действует серверная fair-use защита от убыточного/аномального использования (см. раздел 1.3).

### 1.2 Важные ограничения

1. Формулировка «безлимитный ИИ-чат» допускается только с пометкой `*fair-use` и ссылкой на правила защиты (раздел 1.3).
2. Все ИИ-лимиты проверяются на сервере, клиент не является источником истины.
3. Временный kill-switch TTS действует для всех планов (см. раздел 9).

### 1.3 Fair-use защита для Premium (обязательная)

Premium позиционируется как «безлимит», но для защиты unit-экономики и анти-абуза вводится единый fair-use guardrail:

1. `PREMIUM_FAIR_USE_GUARD_MINUTES_PER_WEEK = 900` (временная блокировка новых ИИ-ответов до начала следующей недели в timezone пользователя).

Правила срабатывания:

1. При достижении fair-use порога (`>= 900 мин/нед`) новые попытки запуска ИИ-ответа через `POST /api/therapy/session/start`, `POST /api/chat`, `POST /api/chat/stream` возвращают отказ:
   - `HTTP 402` + код `premium_fair_use_limit_reached`,
   - мягкое сообщение с датой автоматического восстановления доступа (`nextResetAt`).
2. Сброс ограничений:
   - недельный порог — в начале следующей недели.
3. Для служебных ролей (`admin/moderator/support`) fair-use guard не применяется.
4. Все срабатывания guard логируются и метрикуются отдельно (`premium_fair_use_limit_hits`).

Рекомендуемый текст ответа (API/UI):

1. `message`: `Вы используете возможности ИИ на максимум! Чтобы поддерживать высокую скорость и качество ответов для всех участников, мы взяли небольшую техническую паузу. Чат снова станет доступен в {{nextResetAt}}`
2. Тон: нейтральный и уважительный, без формулировок «запрещено», «нарушение», «вы превысили».

### 1.4 Обязательный тех-гейт перед включением Premium «безлимит\*»

Перед любым production-включением «безлимит\*» для Premium обязательно закрыть 3 техриска:

1. Жёсткий allowlist моделей на сервере (клиент не может выбрать дорогую/произвольную модель).
2. Budget guard для stream-роута (`/api/chat/stream`) с отказом до обращения к провайдеру при превышении лимитов стоимости.
3. Усиленный anti-abuse: защита не только in-memory IP rate-limit, но и серверные лимиты по user/session/device (с персистентным хранилищем и отдельной метрикой блокировок).
   - ошибки провайдера/таймауты/5xx не должны списывать anti-abuse счётчики;
   - учитываются только успешно отданные пользователю ИИ-ответы.

Правило запуска:

1. Если хотя бы один пункт выше не реализован и не покрыт мониторингом/алертами, режим Premium «безлимит\*» в production не включается.

Текущий статус по тех-гейту:

1. Allowlist моделей: ✅ реализовано.
2. Budget guard для stream: ✅ реализовано.
3. Персистентный anti-abuse по user/session/device: ⏳ в работе (пока есть базовые server-side проверки лимитов).

### 1.5 Контракт API для «безлимит\*» (решение по данным)

Чтобы backend и frontend трактовали Premium одинаково, фиксируется контракт:

1. `features.aiChatMode`:
   - `disabled` (Basic),
   - `limited` (PRO),
   - `unlimited_fair_use` (Premium, Trial).
2. `features.weeklyMinutesLimit`:
   - число для `limited`,
   - `null` для `unlimited_fair_use`.
3. `features.fairUseGuardMinutesPerWeek`:
   - `900` для `unlimited_fair_use`,
   - `null` для `disabled/limited`.

### 1.6 Единый контракт ошибки лимита (обязательно)

Для `POST /api/therapy/session/start`, `POST /api/chat`, `POST /api/chat/stream` используется единый код и единый смысл:

1. `HTTP 402`
2. `code = premium_fair_use_limit_reached`
3. `message` = согласованный мягкий текст
4. `nextResetAt` = ISO-дата/время автоматического восстановления

Для stream-роута ошибка передаётся тем же кодом в SSE error payload.

Поведение для активного stream (обязательная UX-норма):

1. Лимит проверяется перед стартом генерации ответа, а не посреди уже идущего stream-ответа.
2. Если порог достигнут во время активного ответа, текущий ответ завершается штатно (без резкого обрыва).
3. Новые ИИ-ответы блокируются после завершения текущей терапевтической сессии или после её фактического закрытия (idle timeout / закрытие приложения / старт новой сессии).
4. Для новых запросов после этого возвращается стандартный `HTTP 402` с тем же контрактом (`code`, `message`, `nextResetAt`).

### 1.7 UI карточки тарифов (контент и структура, обязательно)

Ниже фиксируется, как должны выглядеть карточки тарифов на экране подписки, чтобы не было расхождений между маркетингом и backend-ограничениями.

Общая структура карточки (для всех планов):

1. Заголовок карточки: название плана (`Basic` / `PRO` / `Premium`).
2. Бейджи периода: `Месяц` (активный), `Год (-20%)` (неактивный/переключаемый).
3. Цена: крупно (`0 ₽`, `399 ₽`, `899 ₽`) + подпись `в месяц`/`в год`.
4. Список фич: 4-6 коротких пунктов с иконкой `✓`.
5. Если есть ограничения ИИ: отдельная строка в списке, без двусмысленности.
6. Кнопка действия: `Активный` / `Выбрать` / `Текущий план`.

Карточка `Basic`:

1. Цена: `0 ₽` + подпись `бесплатно`.
2. Пункты:
   - `SOS-техники для быстрой стабилизации`
   - `Базовые дыхательные практики`
   - `Стандартные напоминания`
3. Кнопка:
   - если текущий план: `Активный` (disabled),
   - иначе: `Выбрать`.

Карточка `PRO`:

1. Цена: `399 ₽` + подпись `в месяц`.
2. Пункты:
   - `Всё из Basic`
   - `ИИ-сессии для регулярной поддержки`
   - `До 100 минут в неделю`
   - `Полная библиотека медитаций`
   - `Доступ ко всем дыхательным практикам`
   - `ИИ-напоминания с изображениями для усиления эффекта`
3. Кнопка: `Выбрать` (или `Текущий план`).

Карточка `Premium`:

1. Цена: `899 ₽` + подпись `в месяц`.
2. Бейдж: `Рекомендуем` (опционально).
3. Пункты:
   - `Всё из PRO`
   - `Безлимитные ИИ-сессии`
   - `Голосовой диалог с ИИ в реальном времени`
   - `Персональный стиль ИИ-напоминаний`
   - `Создание и управление своими практиками`
   - `Создание своих привычек`
   - `Создание личной терапии`
   - `Приоритетная поддержка`
4. Кнопка: `Выбрать` (или `Текущий план`).

Обязательные UX-правила для тарифных карточек:

1. Тексты карточек должны совпадать с серверными проверками доступа и лимитов (single source of truth — это backend).
2. Для Trial (Basic + активный trial) действует Premium-уровень доступа на 7 дней.

### 1.8 Контракт закрытого доступа (lock/paywall) для функций

Обязательное поведение UI для функций, недоступных на текущем тарифе:

1. На недоступных карточках/блоках показывается иконка premium-доступа (lock/crown) и бейдж требуемого тарифа (`PRO` или `Premium`).
   - Для компактных карточек (где текст не помещается) показывается только иконка тарифа: `⭐` для `PRO`, `💎` для `Premium`, без текстовой подписи.
2. По клику на такой блок открывается модалка с объяснением, почему функция недоступна, и CTA на нужный тариф.
3. Текст модалки и требуемый тариф не хардкодятся во фронте — приходят с backend из БД.
4. CTA в модалке ведёт на экран подписки и предвыбирает нужный тариф (`targetPlan`).

Минимальный контракт хранения в БД:

1. Таблица `feature_access_policies`:
   - `feature_key` (PK, string): уникальный ключ функции (например `chat.assistant`, `sos.chat_handoff`, `breath.catalog.full`, `meditations.library.full`, `breath.custom.create`).
   - `required_plan` (`basic|pro|premium`): минимальный тариф для доступа.
   - `trial_unlocked` (boolean): открывать ли функцию в Trial.
   - `lock_icon` (`pro|premium`): какой визуальный бейдж показывать.
   - `paywall_title` (text): заголовок модалки.
   - `paywall_description` (text): описание выгоды/ограничения.
   - `paywall_cta_text` (text): текст кнопки.
   - `paywall_target_plan` (`pro|premium`): на какой тариф вести.
   - `updated_at`.
2. Источник истины по доступам — только backend (фронт рендерит состояние по API).

API-контракт (обязательный):

1. `GET /api/subscriptions/entitlements` возвращает:
   - текущий план пользователя;
   - `features[featureKey] = { available, requiredPlan, trialUnlocked, paywall }`;
   - `paywall = { title, description, ctaText, targetPlan }`.
2. Для критичных server-side операций сохраняется backend-валидация доступа (UI-lock не является защитой).

### 1.9 Bootstrap-контракт через `GET /api/user/me` (обязательный)

Чтобы интерфейс сразу при загрузке приложения понимал, какие блоки открыты/закрыты, в `GET /api/user/me` добавляется объект `billing` (рекомендуемое имя).

Минимальный контракт `billing`:

1. `planId`: `basic|pro|premium`.
2. `trialActive`: `boolean`.
3. `trialExpiresAt`: `string | null` (ISO).
4. `aiChatMode`: `disabled|limited|unlimited_fair_use`.
5. `weeklyMinutesLimit`: `number | null`.
6. `fairUseGuardMinutesPerWeek`: `number | null`.
7. `entitlementsVersion`: `string` (etag/hash версии правил доступа).
8. `features`: словарь доступов по `featureKey`:
   - `available: boolean`
   - `requiredPlan: basic|pro|premium`
   - `paywall: { title, description, ctaText, targetPlan } | null`

Правила использования:

1. Фронт использует `billing` из `GET /api/user/me` как bootstrap-источник для иконок lock и показа paywall-модалки.
2. `GET /api/subscriptions/entitlements` остаётся источником детального обновления/рефреша.
3. При изменении правил доступа (`feature_access_policies`) backend обязан обновлять `entitlementsVersion`, чтобы клиент мог инвалидировать кэш.

---

## 2. Модели и БД

- **subscription_plans** — планы `basic`, `pro`, `premium` (seed: `pnpm seed:subscription-plans`).
- **user_subscriptions** — активная/истекшая подписка пользователя: `planId`, `billingPeriod`, `startDate`, `endDate`, `paymentStatus` (`active`/`expired`/`pending`/`canceled`), checkout-поля для ожидаемой оплаты.
- `to-be`: сохранить `paymentStatus` для доступа (`active`/`expired`/`pending`/`canceled`) и добавить отдельное поле `checkoutStatus` для операционных кейсов (`in_progress`/`manual_review`/`closed`), с default `in_progress` при создании pending-подписки.
- **feature_access_policies** — таблица правил закрытого доступа и paywall-текстов по `featureKey` (source of truth для entitlement).
- **users** — `trialStartedAt`, `trialEndedAt`, `hasUsedTrial`.
- **therapy_sessions** — `last_activity_at` для учёта минут.
- **payments**, **idempotency_keys** — платежи и идемпотентность.

---

## 3. API и флоу

- `GET /api/subscriptions/plans` — список тарифов.
- `GET /api/user/me` — bootstrap-профиль пользователя; включает объект `billing` для первичного UI-gating (иконки lock, paywall-модалки, trial/banner состояния).
- `GET /api/subscriptions/current` — текущая подписка пользователя.
- `GET /api/subscriptions/usage` — использовано минут за неделю, лимит.
- `GET /api/subscriptions/entitlements` — матрица доступов к функциям + тексты/CTA для paywall-модалок.
- `POST /api/subscriptions/start-checkout` — начало оплаты. **Обязателен заголовок `Idempotency-Key`.** Тело: `{ planId, billingPeriod }`. Ответ: `paymentUrl`, `subscriptionId`, `amount`, `toPay`, `creditApplied`, `creditGranted`, `status`.
- `POST /api/payments/yookassa/webhook` — приём уведомлений YooKassa. Подлинность — через `GET /v3/payments/{id}`; сумма сверяется с `user_subscriptions.checkout_*`; при `payment.succeeded` — активация подписки в транзакции.
- `POST /api/subscriptions/cancel` — soft cancel: отключение `autoRenew` у активной подписки на нашей стороне (провайдерная отмена — в roadmap).

Чат: `POST /api/chat/stream` требует `therapySessionId` и обновляет `last_activity_at` (обход биллинга запрещён).

---

## 4. Быстрый старт

1. **Миграции:** `pnpm db:generate` и `pnpm db:migrate`.
2. **Seed планов:** `pnpm seed:subscription-plans`.
3. **Переменные окружения** (`.env.development` или `.env`):

```bash
NUXT_PRIVATE_DB_URL=postgresql://...
NUXT_YOOKASSA_SHOP_ID=...
NUXT_YOOKASSA_SECRET_KEY=...
NUXT_YOOKASSA_TEST_MODE=true
NUXT_PUBLIC_APP_URL=http://localhost:3000
```

4. **YooKassa:** зарегистрироваться на yookassa.ru, получить Shop ID и Secret Key. Webhook: `https://<ваш-домен>/api/payments/yookassa/webhook`, события `payment.succeeded`, `payment.canceled`. Локально — ngrok на порт приложения.
5. **Тестовая карта:** `5555 5555 5555 4444`, любая дата и CVC.

---

## 5. Тестирование

- Новый пользователь — проверка: в БД `plan_id = 'basic'`, `trial_ended_at` в будущем.
- Checkout: `curl -X POST .../api/subscriptions/start-checkout -H 'Idempotency-Key: unique-key-123' -d '{"planId":"premium","billingPeriod":"month"}'`.
- Учёт минут: `POST /api/therapy/session/start`, `ping`, `GET /api/subscriptions/usage`.

---

## 6. Текущий статус и TODO

**Реализовано (`as-is`):**

1. `start-checkout` с обязательным `Idempotency-Key` и хранением ответа в `idempotency_keys` (TTL по умолчанию: 24 часа).
2. Checkout-поля в `user_subscriptions` для безопасной сверки webhook: `checkout_amount`, `checkout_currency`, `billing_credit_applied`, `billing_credit_granted`, `yookassa_payment_id`.
3. Webhook `POST /api/payments/yookassa/webhook` с верификацией через API YooKassa, проверкой суммы/валюты и idempotency по `payments.id`.
4. Безопасная финализация подписки:
   - `pending -> active` только после валидного `payment.succeeded`,
   - при дублях webhook повторная активация не происходит,
   - старые активные подписки переводятся в `expired`.
5. Учёт минут по timezone и серверные проверки доступа к ИИ/лимитов.
6. Путь `toPay === 0` финализирует подписку без webhook в транзакции; факт фиксируется в `subscription_events` как `purchase_success` с `method=internal_credit`.
7. Тарифная логика `aiChatMode` в едином контракте:
   - `disabled` (Basic),
   - `limited` (PRO),
   - `unlimited_fair_use` (Premium, Trial).
8. Premium fair-use guard (`900 мин/нед`) с единым payload и мягким текстом.
9. Единый `HTTP 402` контракт для лимита в:
   - `POST /api/therapy/session/start`,
   - `POST /api/chat`,
   - `POST /api/chat/stream` (через SSE error payload).
10. Жёсткий allowlist chat-моделей на сервере (клиент не может выбрать произвольную дорогую модель).
11. Budget guard до вызова провайдера в non-stream и stream чат-роутах.
12. Жёсткий server-side запрет `textSource=ai` для `Basic/PRO` на `PUT /api/notifications/prefs/:kind`.
13. Временный kill-switch TTS:

- `FEATURE_TTS_ENABLED=false` по умолчанию;
- backend TTS endpoint блокируются;
- frontend скрывает управление и не запускает озвучку.

14. Реализован entitlement-слой через `feature_access_policies` + fallback policy-map в коде (`entitlements.service`).
15. `GET /api/user/me` возвращает `billing` snapshot (plan/trial/aiChatMode/entitlementsVersion/features) для bootstrap UI-гейтов.
16. Добавлен `GET /api/subscriptions/entitlements` для явного рефреша матрицы доступов.
17. Закрытые контентные операции (`meditations`, `breath custom`) валидируются сервером и возвращают `HTTP 402` + `code=feature_plan_required`.

**Осталось (`to-be`):**

1. В `start-checkout` заменить mock на реальный `POST https://api.yookassa.ru/v3/payments`; сохранять `payment.id` в `user_subscriptions.yookassa_payment_id`; возвращать `confirmation.confirmation_url` как `paymentUrl`.
2. При создании платежа передавать `subscriptionId/orderId` в metadata YooKassa; webhook обязан финализировать только корректно связанную `pending` подписку.
3. Если у `pending` подписки уже установлен `yookassa_payment_id`, webhook с другим `payment.id` не может её финализировать.
4. Для pending checkout ввести single-pending инвариант: если уже есть `pending` с заполненным `yookassa_payment_id`, новый YooKassa payment не создается (возвращается тот же `confirmation_url` или требуется явная отмена pending).
5. Запретить смену `yookassa_payment_id` в рамках одной pending-подписки.
6. Добавить reconciliation для потерянного/задержанного webhook: проверка `pending` через `GET /v3/payments/{id}` (фоновой job и/или защищенным endpoint "Я оплатил"), с конфигурируемым порогом 15-30 минут (дефолт: 15 минут); reconciliation включается только для записей с `yookassa_payment_id`.
7. Добавить hardening конкурентности: "не более одной active подписки на пользователя" (частичный unique index или row-level lock в критических транзакциях).
8. Для `Idempotency-Key`: если ключ повторно используется с другим payload (`planId`/`billingPeriod`), возвращать `409`.
9. В `/api/subscriptions/current` добавить явный флаг `cancelAtPeriodEnd` для UI (вместо угадывания по сочетанию полей) и отдавать `checkoutStatus`.
10. При появлении recurring в YooKassa — отмена автопродления из `POST /api/subscriptions/cancel`.
11. Добавить server-side paywall config (регион/канал оплаты), затем Stripe (global web) и IAP verify (iOS/Android) без ломки текущих контрактов.
12. При 402/403 по лимиту — понятный paywall и CTA на `/subscription`.
13. Узаконить `checkoutStatus=manual_review` в модели/контрактах: mismatch-кейсы не должны "жить только в логах".
14. Добавить админ-операции `approve_manual_review` / `reject_manual_review` (идемпотентные, с audit event, с переводом в терминальные статусы).
15. Зафиксировать переходы `checkoutStatus`: `pending` создается с `in_progress`; при `webhook succeeded` и zero-pay финализации выставляется `closed`; при `webhook canceled` также выставляется `closed`.
16. Зафиксировать границу этапов: `checkoutStatus` внедряется в hardening-этап (аналог Phase 1.5), не в базовый Phase 1.
17. На этапе hardening выполнить миграцию `user_subscriptions.checkout_status` с `NOT NULL DEFAULT 'in_progress'` и backfill существующих записей.
18. Ввести `pending_ttl_hours` (дефолт: 24 часа) и cron-очистку зависших `pending`: `canceled` + возврат зарезервированного кредита + audit event.
19. Для `feature_access_policies` добавить админ-интерфейс/процесс редактирования политик без ручного SQL.

### Критично для текущего этапа

- Пока не внедрен реальный `POST /v3/payments`, поле `paymentUrl` — технический mock и не может считаться подтверждением оплаты.
- Источник истины оплаты — только webhook после verify через `GET /v3/payments/{id}` и запись в `payments`.
- После появления `confirmation_url` доступ все равно выдается только после webhook; клиент после возврата с оплаты проверяет статус через `/api/subscriptions/current`.
- Если webhook еще не пришел, UI показывает "Оплата обрабатывается", а не мгновенную ошибку.
- При долгом `pending` сервер обязан запустить reconciliation через verify API YooKassa и довести подписку до конечного статуса по факту платежа.
- Если у `pending` нет `yookassa_payment_id`, verify/reconciliation не выполняется; такой кейс закрывается по `pending_ttl_hours` (в dev допустим mock без оплаты).

### Вне текущего scope (не считать реализованным)

- Runtime-маршрутизация провайдеров `apple_iap / google_play / ios_external`.
- iOS External Link entitlement как активный рабочий флоу.
- Единый entitlement-merge из нескольких источников (`max(expire_at)` между провайдерами).

### Семантика состояний (as-is)

- `pending` — создан checkout, оплата еще не подтверждена.
- `active` — доступ активен.
- `canceled` — отменен pending-checkout (не "доступ отключен сейчас").
- `expired` — период завершен или подписка вытеснена новой.
- "отмена в конце периода" сейчас моделируется как `active + autoRenew=false`.

### Hardening для антифрода (to-be)

- Для `toPay === 0` обязательна атомарная транзакция + audit trail с `method=internal_credit`.
- Повторный `start-checkout` с новым ключом не должен повторно активировать платный план без достаточного доступного кредита.
- Для `amount/currency mismatch` обязателен управляемый исход через `checkoutStatus=manual_review` и запись security/audit события.

---

## 7. Troubleshooting

- **Trial не активируется:** проверить наличие плана `basic`, `has_used_trial`, создание подписки при регистрации и поля `trial_started_at` / `trial_ended_at`.
- **Webhook не приходит:** для локали использовать ngrok, указать ngrok URL в настройках YooKassa, проверить доступность эндпоинта.

Документация YooKassa: <https://yookassa.ru/developers/api>

---

## 8. Цены и рентабельность

### 8.1 Что фиксируем в этой версии

1. Оставляем три плана: `Basic` / `PRO` / `Premium`.
2. Разделяем `PRO` и `Premium` не только ценой, но и доступом к ИИ-функциям:
   - `PRO` = текстовый ИИ-чат;
   - `Premium` = текстовый ИИ-чат + ИИ-напоминания + продвинутые функции.
3. Вводим минутные лимиты на чат + технический anti-abuse guard:
   - для `PRO`: жёсткий лимит `100 минут/нед`;
   - для `Premium`: «безлимит\*» с единым fair-use guard (`900 мин/нед`);
   - отдельный лимит `responses/month` не вводим;
   - для обоих платных планов: технический anti-abuse guard (server-side), не как маркетинговый тарифный лимит.
4. TTS в чате временно выключаем для всех планов до отдельной экономики voice (раздел 9).

### 8.2 Unit-economics guardrails

1. Базовая модель чата: `gpt-4o-mini` (строгий allowlist на сервере).
2. Целевой порог: `ИИ Cost Ratio <= 15%` от подписочной выручки.
3. Аварийный порог: при `ИИ Cost Ratio > 25%` — автоматический пересмотр лимитов/квот.
4. Маркетинговый принцип: если используется формулировка «безлимит», обязательно добавлять пометку `*fair-use` и ссылку на правила защиты.

### 8.3 Что обязательно проверить до прод-выкатки тарифов

1. Серверный enforce:
   - для `PRO`: `minutes/week`,
   - для `Premium`: единый fair-use guard по минутам.
   - для обоих: персистентный anti-abuse guard по user/session/device.
2. Отдельный мониторинг стоимости чата и ИИ-напоминаний по планам.
3. Пороговые алерты по перерасходу ИИ-бюджета.
4. Деградационный режим (снижение лимитов через конфиг без релиза) для инцидентов стоимости.

---

## 9. ВАЖНО: Временный Kill-Switch для чатовой TTS (as-is, реализовано)

### 9.1 Цель

Временно убрать риск отрицательной unit-экономики из-за дорогой озвучки (`tts-1-hd`) до выбора более дешёвой модели и до привязки TTS к Premium.

### 9.2 Реализованное решение

1. Используется единый feature-flag `FEATURE_TTS_ENABLED` (и публичный алиас `NUXT_FEATURE_TTS_ENABLED`) с дефолтом `false`.
2. При `FEATURE_TTS_ENABLED=false` backend полностью блокирует чатовую TTS:
   - API `/api/tts/openai` и `/api/tts/openai.stream` не должны выполнять запросы к провайдеру;
   - попытки включить `voice` через настройки чата должны игнорироваться/принудительно давать `false`.
3. При `FEATURE_TTS_ENABLED=false` frontend скрывает элементы управления чатовой озвучкой:
   - скрыть визуальную кнопку/переключатель озвучки в чате;
   - не запускать TTS-озвучивание ответа ассистента, даже если в локальном состоянии осталось старое `voice=true`.
4. Файлы и код TTS не удаляются. Это временный kill-switch.
5. В продуктовой документации зафиксировано: «TTS временно отключён и не входит в текущий scope планов».

### 9.3 Границы (что НЕ трогаем этим этапом)

1. Не удаляем существующие TTS endpoint/composable/компоненты.
2. Не меняем в этом этапе лимиты минут/цены тарифов в БД.
3. Не включаем TTS ни для одного плана до отдельного решения по себестоимости.

### 9.4 Критерии приёмки

1. При `FEATURE_TTS_ENABLED=false` запросы к TTS endpoint не проходят в провайдера.
2. В UI чата нет доступного переключателя озвучки.
3. После отправки сообщений не происходит автоматическое озвучивание.
4. При переключении флага в `true` функционал может быть возвращён без отката архитектуры.

---

## 10. Следующий этап после получения данных YooKassa

Перед финальным production rollout закрыть оставшиеся пункты:

1. В `start-checkout` включить реальный `POST https://api.yookassa.ru/v3/payments` и отдавать `confirmation.confirmation_url`.
2. Передавать `subscriptionId/orderId` в metadata платежа YooKassa и финализировать только корректно связанную `pending` подписку.
3. Внедрить reconciliation зависших `pending` платежей (`GET /v3/payments/{id}`) с отдельной метрикой и алертами.
4. Доделать hardening конкурентности:
   - single-pending инвариант;
   - single-active инвариант.
5. Зафиксировать `checkoutStatus` (`in_progress/manual_review/closed`) и админ-процессы `approve/reject`.
6. Добавить server-side paywall config под мульти-провайдерный биллинг (YooKassa/Stripe/IAP) без ломки текущих API-контрактов.
7. Для будущего возврата TTS зафиксировать отдельную voice-экономику:
   - выделенные квоты/лимиты,
   - отдельный budget guard,
   - отдельные алерты по себестоимости.
