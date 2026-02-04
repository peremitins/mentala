# Система подписок Mentala

Краткая спецификация и инструкция по настройке. Оплата и смена тарифа — только через веб (YooKassa); iOS/Android показывают статус и инструкцию «открыть сайт».

---

## 1. Тарифы

| Тариф     | Цена (мес) | Лимит минут/неделю | Функционал |
| --------- | ---------- | -------------------- | ---------- |
| **Basic** | 0 ₽        | 0                    | Только уведомления с шаблонами (без ИИ) |
| **PRO**   | 349 ₽      | 100                  | AI-чат, уведомления, трекер привычек |
| **Premium** | 649 ₽    | 100                  | Всё из PRO + расширенная аналитика |

Годовой план: скидка ~20% (`месяц × 12 × 0.8`). В UI — переключатель «Месяц / Год».

**Trial:** не отдельный тариф, а состояние Basic на 7 дней после регистрации. Во время Trial — полный доступ как Premium (100 мин/нед). После окончания — Basic без ИИ. Повторный Trial недоступен (`hasUsedTrial`).

---

## 2. Модели и БД

- **subscription_plans** — планы `basic`, `pro`, `premium` (seed: `pnpm seed:subscription-plans`).
- **user_subscriptions** — активная/истекшая подписка пользователя: `planId`, `billingPeriod`, `startDate`, `endDate`, `paymentStatus` (`active`/`expired`/`pending`/`canceled`), checkout-поля для ожидаемой оплаты.
- **users** — `trialStartedAt`, `trialEndedAt`, `hasUsedTrial`.
- **therapy_sessions** — `last_activity_at` для учёта минут.
- **payments**, **idempotency_keys** — платежи и идемпотентность.

---

## 3. API и флоу

- `GET /api/subscriptions/plans` — список тарифов.
- `GET /api/subscriptions/current` — текущая подписка пользователя.
- `GET /api/subscriptions/usage` — использовано минут за неделю, лимит.
- `POST /api/subscriptions/start-checkout` — начало оплаты. **Обязателен заголовок `Idempotency-Key`.** Тело: `{ planId, billingPeriod }`. Ответ: `paymentUrl` (YooKassa).
- `POST /api/payments/yookassa/webhook` — приём уведомлений YooKassa. Подлинность — через `GET /v3/payments/{id}`; сумма сверяется с `user_subscriptions.checkout_*`; при `payment.succeeded` — активация подписки в транзакции.

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

**Реализовано:** webhook с проверкой через API YooKassa, идемпотентность checkout, смена плана без досрочного expired, учёт минут по timezone, серверные проверки доступа к AI и лимита.

**Осталось:**

1. В `start-checkout` заменить mock на реальный `POST https://api.yookassa.ru/v3/payments`; сохранять `payment.id` в `user_subscriptions.yookassa_payment_id`; возвращать `confirmation.confirmation_url` как `paymentUrl`.
2. При появлении recurring в YooKassa — отмена автопродления из `POST /api/subscriptions/cancel`.
3. При 402/403 по лимиту — понятный paywall и CTA на `/subscription`.

---

## 7. Troubleshooting

- **Trial не активируется:** проверить наличие плана `basic`, `has_used_trial`, создание подписки при регистрации и поля `trial_started_at` / `trial_ended_at`.
- **Webhook не приходит:** для локали использовать ngrok, указать ngrok URL в настройках YooKassa, проверить доступность эндпоинта.

Документация YooKassa: <https://yookassa.ru/developers/api>

---

## 8. Цены и рентабельность

### Проблематика текущей модели

- **PRO (349₽/мес, 100 мин/нед ≈ 400 мин/мес):** при полном использовании лимита расход OpenAI ~208₽ (0.52₽/мин), маржа ~40% — опасно мало для SaaS.
- **Premium (649₽/мес, те же 400 мин):** маржа выше (~68%), но нет чёткой дифференциации с PRO (одинаковый лимит).
- Нет защиты от «жадных» пользователей, использующих весь лимит в начале недели.

### Тарификация OpenAI

- Модель: `gpt-4o-mini`. Input ~$0.15/1M токенов, Output ~$0.60/1M токенов.
- Средний запрос терапии ~2500–3000 токенов; на 1 минуту диалога ≈ 0.52₽.
- Rate limits (Tier) растут с тратой; отдельно за Tier не платим.

### Рекомендуемые направления (на выбор)

**Вариант 1 — новая тарифная сетка (рекомендуется для долгосрочного роста):**

- Starter: 299₽/мес — 25 мин/нед (100 мин/мес).
- PRO: 549₽/мес — 75 мин/нед (300 мин/мес).
- Premium: 999₽/мес — 150 мин/нед (600 мин/мес) + аватар.
- Business: 1999₽/мес — до 2000 мин + приоритет.

Цель: маржа 69–83% на тарифах, чёткая дифференциация, защита от перерасхода.

**Вариант 2 — уменьшить лимиты при текущих ценах:**

- PRO: 349₽ — 37 мин/нед (150 мин/мес).
- Premium: 649₽ — 75 мин/нед (300 мин/мес).

**Вариант 3 — поэтапно (для плавного перехода):**

- Сейчас: оставить цены, уменьшить лимиты (например PRO 200 мин, Premium 400 мин), добавить Starter 199₽ за 50 мин.
- Через 3 месяца: анализ реального использования, возможное повышение цен на 20–30%, введение Business.

### Критерии успеха

- Маржа не менее 70% при среднем использовании (40–50% лимита); не менее 50% при 100% использовании.
- Чёткая дифференциация тарифов (минимум ~2× разница по лимитам).
- Метрики: ARPU ≥ 400₽/мес, OpenAI Cost Ratio ≤ 15% от выручки.

### Риски и митигация

- **Потеря пользователей при изменении цен:** grandfathering для текущих подписчиков (3–6 мес), поэтапное повышение.
- **Превышение Rate Limits:** мониторинг TPM, оптимизация промптов и контекста (частично уже сделано: summaries, лимит сообщений в контексте, max_output_tokens).
- **Низкая конверсия:** A/B тесты цен, улучшение онбординга и trial.

Текущая модель при 100% использовании лимита PRO не масштабируется; пересмотр тарифной сетки (Вариант 1 или 3) и мониторинг расходов считаются критичными.
