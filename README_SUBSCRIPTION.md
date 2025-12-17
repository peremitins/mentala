# 🎯 Система подписок Mentala — Быстрый старт

## Что нужно сделать для запуска

### 1️⃣ Применить миграцию БД

```bash
pnpm db:migrate
```

Это создаст все необходимые таблицы для системы подписок.

### 2️⃣ Заполнить тарифные планы

```bash
pnpm seed:subscription-plans
```

Это создаст тарифы: Basic, PRO, Premium, Custom.

### 3️⃣ Настроить переменные окружения

Добавьте в `.env.development`:

```bash
# YooKassa (получите на https://yookassa.ru)
NUXT_YOOKASSA_SHOP_ID=your_shop_id_here
NUXT_YOOKASSA_SECRET_KEY=your_secret_key_here
NUXT_YOOKASSA_TEST_MODE=true

# URL приложения
NUXT_PUBLIC_APP_URL=http://localhost:3000
```

### 4️⃣ Зарегистрироваться в YooKassa

1. Перейдите на [https://yookassa.ru](https://yookassa.ru)
2. Создайте аккаунт (потребуется ИНН для юр. лица или паспорт для ИП)
3. Получите **Shop ID** и **Secret Key** в разделе "Настройки" → "API"
4. Для тестирования используйте **тестовые ключи**

**Тестовая карта для оплаты:** `5555 5555 5555 4444` (любая дата в будущем, любой CVC)

### 5️⃣ Настроить webhook (для локальной разработки)

Для локальной разработки используйте [ngrok](https://ngrok.com):

```bash
# Установите ngrok
brew install ngrok  # или скачайте с сайта

# Запустите туннель
ngrok http 3000

# Скопируйте URL (например, https://abc123.ngrok.io)
# Укажите в YooKassa: https://abc123.ngrok.io/api/payments/yookassa/webhook
```

---

## 🧪 Тестирование

### Базовое тестирование

1. **Запустите приложение:**

   ```bash
   pnpm dev
   ```

2. **Зарегистрируйте нового пользователя:**

   - Trial должен активироваться автоматически
   - Проверьте в настройках: должен быть блок "Подписка" с Trial

3. **Откройте страницу подписки:**

   - Перейдите на `/subscription`
   - Должны отображаться тарифы: PRO, Premium, Custom
   - Попробуйте Custom калькулятор

4. **Проверьте блок в настройках:**
   - Перейдите на `/settings?tab=general`
   - Должен быть блок "Подписка" с прогресс-баром использования минут

### Тестирование оплаты

1. **Выберите тариф на `/subscription`**
2. **Нажмите "Оформить подписку"**
3. **В тестовом режиме YooKassa:**
   - Используйте карту: `5555 5555 5555 4444`
   - Любая дата в будущем, любой CVC
4. **После оплаты:**
   - Подписка должна активироваться автоматически
   - Проверьте в настройках: должен обновиться план

---

## ⚠️ Важно

### Текущий статус интеграции с YooKassa

**Частично реализовано:**

- ✅ Созданы все API endpoints
- ✅ Реализована бизнес-логика
- ⚠️ **Требуется доработка:** реальные вызовы YooKassa API

В текущей реализации:

- `POST /api/subscriptions/start-checkout` возвращает mock `paymentUrl`
- Webhook endpoint готов и подтверждает подлинность уведомлений через API YooKassa (`GET /v3/payments/{payment_id}`), без HMAC‑подписи

**Что нужно сделать:**

1. Заменить mock на реальное создание платежа в `server/api/subscriptions/start-checkout.post.ts`:
   - `POST https://api.yookassa.ru/v3/payments`
   - `amount.value` передавать строго как `toPay` (после применения кредита) — это совпадает с `user_subscriptions.checkout_amount`
   - передавать `metadata.subscriptionId`
   - сохранять `payment.id` в `user_subscriptions.yookassa_payment_id`
   - возвращать `confirmation.confirmation_url` как `paymentUrl`
2. (Позже) подключить recurring/ЛК YooKassa и реализовать отмену автопродления в YooKassa из `POST /api/subscriptions/cancel`

Подробности: см. `.docs/subscription_setup_guide.md`

---

## 📚 Документация

- **ТЗ системы:** `.docs/subscription_system_spec.md`
- **Подробная инструкция:** `.docs/subscription_setup_guide.md`
- **Итоговая сводка:** `.docs/SUBSCRIPTION_IMPLEMENTATION_SUMMARY.md`

---

## 🐛 Troubleshooting

### Trial не активируется

**Решение:**

1. Проверьте, что план `basic` существует: `SELECT * FROM subscription_plans WHERE id = 'basic';`
2. Проверьте логи сервера
3. Убедитесь, что `hasUsedTrial = false` у пользователя
4. Проверьте, что при регистрации создаётся подписка с `planId = 'basic'` и устанавливаются `trialStartedAt` и `trialEndedAt`

### Webhook не приходит

**Решение:**

1. Используйте ngrok для локальной разработки
2. Укажите ngrok URL в настройках YooKassa
3. Проверьте, что endpoint доступен публично

### Ошибка при расчете Custom

**Решение:**

1. Проверьте, что `weeklyMinutes` кратно 10
2. Проверьте диапазон: 10-200 минут
3. Проверьте логи сервера

---

## ✅ Чек-лист готовности

- [ ] Миграция БД применена
- [ ] Тарифные планы заполнены
- [ ] Переменные окружения настроены
- [ ] Зарегистрирован аккаунт в YooKassa
- [ ] Получены Shop ID и Secret Key
- [ ] Настроен webhook (ngrok для локальной разработки)
- [ ] Протестирована регистрация (Trial активируется)
- [ ] Протестирована страница `/subscription`
- [ ] Протестирован блок подписки в настройках

---

**Готово!** Система подписок готова к тестированию. 🎉

Для полной функциональности с реальными платежами требуется завершить интеграцию с YooKassa API (см. TODO в коде).
