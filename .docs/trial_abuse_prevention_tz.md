# ТЗ: Защита от злоупотребления пробным периодом

## 1. Проблема

**Текущая ситуация:**

- Пользователь может удалить аккаунт после окончания пробного периода
- При повторной регистрации с тем же email создается новый аккаунт с `hasUsedTrial = false`
- Пробный период активируется снова
- Это позволяет бесконечно использовать пробный период

**Уязвимости:**

1. При hard delete аккаунта все данные удаляются, включая `hasUsedTrial`
2. При soft delete и восстановлении через OAuth/email `hasUsedTrial` сохраняется, но можно использовать другой email
3. Нет отслеживания использования Trial по email независимо от существования аккаунта

---

## 2. Цель

Предотвратить злоупотребление пробным периодом через:

- Удаление и перерегистрацию аккаунта с тем же email
- Сохранение информации о количестве использованных дней триала

---

## 3. Решение: Отслеживание использования Trial по email с учетом использованных дней

**Суть:** Сохранять информацию об использовании Trial отдельно от пользователя, включая количество использованных дней. При повторной регистрации выдавать только оставшиеся дни триала.

**Кейс использования:**

1. Пользователь регистрируется → активируется триал на 7 дней
2. Проходит 2 дня использования триала
3. Пользователь удаляет аккаунт
4. При удалении фиксируется: использовано 2 дня из 7
5. Пользователь регистрируется заново с тем же email
6. Система проверяет: использовано 2 дня, осталось 5 дней
7. Пользователю выдается триал на 5 дней (не на 7)

**Реализация:**

- Создать таблицу `trial_usage_tracking` для отслеживания использованных Trial
- При активации Trial сохранять email (нормализованный) и дату начала триала
- При удалении аккаунта вычислять и сохранять количество использованных дней
- При повторной регистрации проверять использованные дни и выдавать только оставшиеся

**Поля таблицы:**

```typescript
trial_usage_tracking {
  id: serial
  email_normalized: varchar(255) NOT NULL // нормализованный email (см. раздел 4.5)
  email_hash: varchar(64) UNIQUE NOT NULL // HMAC-SHA256 от email_normalized (см. GDPR и приватность)
  first_trial_started_at: timestamp NOT NULL // когда впервые начался триал
  last_trial_started_at: timestamp // последний раз когда начался триал
  total_days_used: integer DEFAULT 0 NOT NULL // сколько дней было использовано в сумме (максимум 7)
  created_at: timestamp
  updated_at: timestamp
}
```

**GDPR и приватность:**

- Данные в `trial_usage_tracking` содержат персональные данные (email)
- **Срок хранения:** 1 год с момента последнего использования Trial (`last_trial_started_at`) или удаления аккаунта, что наступит позже
- **Очистка:** ежедневная фоновая очистка записей старше 1 года (опционально отключается через `TRIAL_USAGE_CLEANUP_ENABLED=false`)
- **Анонимизация:** При необходимости анонимизации (по запросу пользователя или по истечении срока) можно:
  - Удалить `email_normalized`, оставить `email_hash` (HMAC-SHA256)
  - Это сохраняет защиту от abuse, но снижает риск утечек PII
- **Рекомендованный подход (выбранный):** хранить **оба** поля (`email_normalized` + `email_hash`):
  - `email_hash` — основной ключ для поиска/уникальности
  - `email_normalized` — для поддержки и дебага
  - Хеш должен быть **HMAC‑SHA256** с серверным секретом (`EMAIL_HASH_PEPPER`)

**Идентификатор пользователя (email/phone):**

- **Текущее решение:** аккаунт без email **не создаём** → без email нет Trial и нет регистрации.
- **Причина:** защита от abuse в рамках MVP требует стабильного идентификатора.
- **Будущее (когда появится регистрация по телефону):**
  - Добавить `phone_normalized` и/или `phone_hash` в ту же таблицу `trial_usage_tracking`
  - Ввести правило: **trial_usage_tracking** ищется по одному из ключей в порядке приоритета: `email_hash` → `phone_hash`
  - Для пользователей без email, но с телефоном, триал ограничивается по телефону
  - Если есть и email и телефон — использовать оба, чтобы не было обхода через смену канала регистрации

**Логика:**

1. При активации Trial (`activateTrialForUser`):

   - Нормализовать email пользователя (см. раздел 4.5 о нормализации email)
   - Вычислить `email_hash = HMAC-SHA256(email_normalized, EMAIL_HASH_PEPPER)`
   - Проверить наличие записи в `trial_usage_tracking` по `email_hash`
   - Если записи нет → создать новую запись с `total_days_used = 0`, выдать полный триал на 7 дней
   - **ВАЖНО:** создание записи должно быть идемпотентным (UPSERT) из‑за гонок при параллельной регистрации
   - Если запись есть:
     - Вычислить оставшиеся дни: `remainingDays = 7 - total_days_used`
     - Если `remainingDays <= 0` → создать Basic БЕЗ триала и установить `hasUsedTrial = true`
     - Если `remainingDays > 0` → выдать триал на `remainingDays` дней
     - Обновить `last_trial_started_at`
   - **ВАЖНО:** Все операции (создание/обновление tracking, создание подписки, обновление пользователя, логирование событий) должны выполняться в одной транзакции для обеспечения консистентности данных

2. При удалении аккаунта (`delete.post.ts`):

   - Получить email пользователя
   - Если у пользователя был активный триал (`trialStartedAt` не null):
     - Вычислить количество использованных дней: `usedDays = Math.max(1, Math.floor((now - trialStartedAt) / 86400000))`
     - **КРИТИЧНО:** Минимум 1 день засчитывается при любом факте старта триала, даже если прошло менее 24 часов. Это предотвращает обход через удаление аккаунта в первые сутки.
     - Обновить запись в `trial_usage_tracking`:
       - `total_days_used = LEAST(total_days_used + usedDays, 7)` (но не больше 7)
       - `updated_at = now`
     - **ВАЖНО:** если запись в `trial_usage_tracking` отсутствует — создать её (UPSERT), иначе обновление ничего не сделает и защита сломается

3. При регистрации нового пользователя:
   - Нормализовать email
   - Проверить наличие записи в `trial_usage_tracking`
   - Если запись есть → при активации триала будет использована логика из пункта 1
   - Если записи нет → `hasUsedTrial = false` (можно активировать полный Trial на 7 дней)

**Преимущества:**

- ✅ Простая реализация
- ✅ Работает даже при hard delete аккаунта
- ✅ Не требует дополнительных данных от пользователя
- ✅ Справедливая система: пользователь получает только неиспользованные дни
- ✅ Защищает от злоупотребления через удаление и перерегистрацию

**Недостатки:**

- ❌ Можно обойти, используя разные email-адреса
- ❌ Не защищает от использования временных email-сервисов

---

## 4. Технические детали реализации

### 4.1. Схема БД

```typescript
// server/infrastructure/db/schema.ts
export const trialUsageTracking = pgTable(
  'trial_usage_tracking',
  {
    id: serial('id').primaryKey(),
    emailNormalized: varchar('email_normalized', { length: 255 }).notNull(),
    emailHash: varchar('email_hash', { length: 64 }).notNull().unique(),
    firstTrialStartedAt: timestamp('first_trial_started_at', {
      withTimezone: true,
    })
      .notNull()
      .defaultNow(),
    lastTrialStartedAt: timestamp('last_trial_started_at', {
      withTimezone: true,
    }),
    totalDaysUsed: integer('total_days_used').default(0).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => ({
    emailNormalizedIdx: index('idx_trial_usage_email_normalized').on(
      table.emailNormalized
    ),
    emailHashIdx: index('idx_trial_usage_email_hash').on(table.emailHash),
  })
);
```

### 4.2. Изменения в `activateTrialForUser`

```typescript
// server/application/subscriptions/trial.service.ts

export async function activateTrialForUser(
  userId: number,
  timezone?: string,
  email?: string // Добавить email
) {
  // ... существующий код проверки hasUsedTrial ...

  // НОВОЕ: Проверка через trial_usage_tracking
  if (email) {
    const emailNormalized = normalizeEmail(email); // Использует функцию нормализации из 4.5
    const emailHash = hashEmail(emailNormalized); // HMAC-SHA256 с pepper (см. 4.5)
    const existing = await db
      .select()
      .from(trialUsageTracking)
      .where(eq(trialUsageTracking.emailHash, emailHash))
      .limit(1);

    if (existing.length) {
      const tracking = existing[0];
      const remainingDays = 7 - tracking.totalDaysUsed;

      // ВСЕ операции выполняются в транзакции для обеспечения консистентности
      return await db.transaction(async (tx) => {
        if (remainingDays <= 0) {
          // Все дни триала использованы
          console.log(
            `[Trial] User ${userId} email ${emailNormalized} already used all 7 trial days, creating Basic without trial`
          );

          // ВАЖНО: Устанавливаем hasUsedTrial = true даже если триал не выдаем
          await tx
            .update(users)
            .set({
              hasUsedTrial: true,
              timezone: timezone || user[0].timezone || 'Europe/Moscow',
            })
            .where(eq(users.id, userId));

          // ВАЖНО: createBasicSubscription должна уметь работать через tx
          return await createBasicSubscription(
            userId,
            timezone || user[0].timezone || 'Europe/Moscow',
            false,
            tx
          );
        }

        // Выдаем триал на оставшиеся дни
        console.log(
          `[Trial] User ${userId} email ${emailNormalized} has ${remainingDays} days remaining, creating trial for ${remainingDays} days`
        );

        const now = new Date();
        const trialEndDate = new Date(
          now.getTime() + remainingDays * 24 * 60 * 60 * 1000
        );
        const subscriptionEndDate = new Date(
          now.getTime() + 30 * 24 * 60 * 60 * 1000
        );

        // Обновляем пользователя
        await tx
          .update(users)
          .set({
            hasUsedTrial: true,
            trialStartedAt: now,
            trialEndedAt: trialEndDate,
            timezone: timezone || user[0].timezone || 'Europe/Moscow',
          })
          .where(eq(users.id, userId));

        // Обновляем tracking
        await tx
          .update(trialUsageTracking)
          .set({
            lastTrialStartedAt: now,
            updatedAt: now,
          })
          .where(eq(trialUsageTracking.emailHash, emailHash));

        // Создаем подписку Basic (с Trial активным)
        const [subscription] = await tx
          .insert(userSubscriptions)
          .values({
            userId,
            planId: 'basic',
            billingPeriod: 'month',
            startDate: now,
            endDate: subscriptionEndDate,
            paymentStatus: 'active',
            autoRenew: false,
            sourcePlatform: 'web',
          })
          .returning();

        if (!subscription) {
          throw new Error(`Failed to create subscription for user ${userId}`);
        }

        // Логируем событие
        await tx.insert(subscriptionEvents).values({
          userId,
          eventType: 'trial_started',
          planId: 'basic',
          metadata: {
            startDate: now.toISOString(),
            endDate: trialEndDate.toISOString(),
            remainingDays,
            totalDaysUsed: tracking.totalDaysUsed,
          },
        });

        return subscription;
      });
    } else {
      // Первая регистрация - создаем запись в tracking в транзакции
      return await db.transaction(async (tx) => {
        const now = new Date();
        await tx
          .insert(trialUsageTracking)
          .values({
            emailNormalized,
            emailHash,
            firstTrialStartedAt: now,
            lastTrialStartedAt: now,
            totalDaysUsed: 0,
          })
          .onConflictDoNothing();

        // Продолжаем с активацией полного триала на 7 дней (существующий код)
        // ... существующий код активации полного триала на 7 дней для новых пользователей ...
      });
    }
  }

  // ... существующий код активации полного триала на 7 дней для новых пользователей ...
}
```

### 4.3. Изменения в `delete.post.ts`

```typescript
// server/api/user/delete.post.ts

// В функции удаления аккаунта, перед soft-delete пользователя:

// Фиксируем использованные дни триала
const user = await db
  .select({
    email: users.email,
    trialStartedAt: users.trialStartedAt,
  })
  .from(users)
  .where(eq(users.id, userId))
  .limit(1);

if (user.length && user[0].email && user[0].trialStartedAt) {
  const emailNormalized = normalizeEmail(user[0].email); // Использует функцию нормализации из 4.5
  const emailHash = hashEmail(emailNormalized); // HMAC-SHA256 с pepper (см. 4.5)
  const now = new Date();
  const trialStart = user[0].trialStartedAt;

  // Вычисляем количество использованных дней
  // КРИТИЧНО: Минимум 1 день засчитывается при любом факте старта триала
  // Это предотвращает обход через удаление аккаунта в первые 24 часа
  const diffMs = now.getTime() - trialStart.getTime();
  const usedDays = Math.max(1, Math.floor(diffMs / (24 * 60 * 60 * 1000)));

  // Обновляем tracking (всегда, даже если прошло менее 24 часов)
  // ВАЖНО: если записи нет — создаем её (UPSERT), иначе защита сломается
  await db
    .insert(trialUsageTracking)
    .values({
      emailNormalized,
      emailHash,
      firstTrialStartedAt: trialStart,
      lastTrialStartedAt: trialStart,
      totalDaysUsed: usedDays,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: trialUsageTracking.emailHash,
      set: {
        totalDaysUsed: sql`LEAST(${trialUsageTracking.totalDaysUsed} + ${usedDays}, 7)`,
        updatedAt: now,
      },
    });

  console.log(
    `[Trial] User ${userId} (${emailNormalized}) deleted account, recorded ${usedDays} used trial days (minimum 1 day for any trial start)`
  );
}

// Затем продолжаем с soft-delete пользователя
```

### 4.4. Изменения в местах вызова `activateTrialForUser`

Нужно передавать email во всех местах (email должен быть нормализован через `normalizeEmail` из 4.5):

- `server/application/auth/oauth.ts` - передать `email` из профиля (уже нормализован)
- `server/api/auth/email/verify.post.ts` - передать `email` из запроса (уже нормализован)
- `server/api/auth/telegram/verify.post.ts` - для Telegram email может быть null, передавать только если есть
  - **Текущее правило:** если email отсутствует — регистрация отклоняется (аккаунты без email не поддерживаются)

### 4.5. Нормализация email для защиты от алиасов

**Критично:** Необходимо явно описать политику нормализации email для предотвращения обхода через email-алиасы (Gmail +tag, точки, регистры, unicode-homoglyphs).

**Требования к нормализации:**

1. **Регистр:** Привести к нижнему регистру (`toLowerCase()`)
2. **Gmail-алиасы:**
   - Удалить точки в локальной части до символа `@` (для Gmail: `user.name@gmail.com` → `username@gmail.com`)
   - Удалить часть после `+` в локальной части (для Gmail: `user+tag@gmail.com` → `user@gmail.com`)
   - Применить только для доменов Gmail (`@gmail.com`, `@googlemail.com`)
3. **Unicode:** Нормализовать unicode-символы (NFKC нормализация) для защиты от homoglyphs
4. **Trim:** Удалить пробелы в начале и конце

**Реализация:**

```typescript
// server/application/auth/verification.ts

export function normalizeEmail(email: string): string {
  if (!email) return email;

  // 1. Trim и приведение к нижнему регистру
  let normalized = email.trim().toLowerCase();

  // 2. Разделение на локальную часть и домен
  const [localPart, domain] = normalized.split('@');
  if (!localPart || !domain) return normalized;

  // 3. Обработка Gmail-алиасов
  const gmailDomains = ['gmail.com', 'googlemail.com'];
  if (gmailDomains.includes(domain)) {
    // Удаляем точки в локальной части
    let gmailLocal = localPart.replace(/\./g, '');
    // Удаляем часть после + (если есть)
    gmailLocal = gmailLocal.split('+')[0];
    normalized = `${gmailLocal}@${domain}`;
  }

  // 4. Unicode нормализация (NFKC)
  normalized = normalized.normalize('NFKC');

  return normalized;
}
```

**Хэширование email (обязательное):**

- Используем HMAC‑SHA256 с серверным секретом, чтобы хеш нельзя было перебором восстановить.
- Секрет хранится в env: `EMAIL_HASH_PEPPER`.

```typescript
// server/application/auth/verification.ts

import { createHmac } from 'node:crypto';

export function hashEmail(emailNormalized: string): string {
  return createHmac('sha256', process.env.EMAIL_HASH_PEPPER || '')
    .update(emailNormalized)
    .digest('hex');
}
```

**Примеры нормализации:**

- `User.Name@gmail.com` → `username@gmail.com`
- `user+tag@gmail.com` → `user@gmail.com`
- `user.name+test@Gmail.COM` → `username@gmail.com`
- `user@example.com` → `user@example.com` (не Gmail, точки не удаляются)
- `user+tag@example.com` → `user+tag@example.com` (не Gmail, + не удаляется)

**ВАЖНО:** Эта же функция должна использоваться везде, где происходит работа с email (регистрация, авторизация, проверка tracking).

---

## 5. Миграция данных

**Вопрос:** Что делать с существующими пользователями, которые уже использовали Trial?

**Решение:**

1. Создать скрипт миграции, который:

   - Нормализует `users.email` по новым правилам (Gmail aliases + lowercase + NFKC)
   - Логирует конфликты (если несколько аккаунтов сводятся к одному email) и прерывает миграцию
   - Скрипт: `server/infrastructure/db/migrate-normalize-emails.ts`

2. Создать скрипт миграции, который:

   - Найдет всех пользователей с `hasUsedTrial = true` и `trialStartedAt` не null
   - Для каждого пользователя:
     - Вычислит использованные дни: `usedDays = max(1, floor((now - trialStartedAt) / 86400000))`
     - Создаст запись в `trial_usage_tracking`:
       - `email_normalized = normalizeEmail(user.email)`
       - `email_hash = hashEmail(email_normalized)`
       - `first_trial_started_at = trial_started_at`
       - `last_trial_started_at = trial_started_at`
       - `total_days_used = usedDays` (но не больше 7)
   - Если триал уже истек, `total_days_used = 7`

3. Запустить миграцию один раз после деплоя (оба скрипта, в этом порядке)

---

## 6. Acceptance Criteria

1. ✅ Пользователь не может получить полный Trial повторно с тем же email
2. ✅ Пользователь не может обойти защиту через удаление и перерегистрацию
3. ✅ Система отслеживает использование Trial независимо от существования аккаунта
4. ✅ При удалении аккаунта фиксируется количество использованных дней
5. ✅ При повторной регистрации пользователь получает только оставшиеся дни триала
6. ✅ Существующие пользователи не теряют доступ после внедрения
7. ✅ Если использовано 7 дней, пользователь не получает триал при повторной регистрации

---

## 7. Примеры сценариев

### Сценарий 1: Первая регистрация

- Пользователь регистрируется с email `user@example.com`
- Активируется триал на 7 дней
- В `trial_usage_tracking` создается запись: `total_days_used = 0`

### Сценарий 2: Удаление после 2 дней использования

- Пользователь использовал триал 2 дня
- Удаляет аккаунт
- В `trial_usage_tracking` обновляется: `total_days_used = 2`

### Сценарий 3: Повторная регистрация после удаления

- Пользователь регистрируется снова с `user@example.com`
- Система проверяет: `total_days_used = 2`, осталось 5 дней
- Активируется триал на 5 дней
- В `trial_usage_tracking` обновляется: `last_trial_started_at = now`

### Сценарий 4: Удаление после использования всех 7 дней

- Пользователь использовал все 7 дней триала
- Удаляет аккаунт
- В `trial_usage_tracking` обновляется: `total_days_used = 7`
- При повторной регистрации триал не активируется, создается Basic без триала

---

## 8. Риски и ограничения

**Риски:**

- Можно обойти, используя разные email-адреса
- Обход через временные email-сервисы

**Ограничения:**

- Не защищает от использования разных email-адресов (но нормализация защищает от Gmail-алиасов)
- Требует точного расчета использованных дней (округление в меньшую сторону)
- Минимум 1 день засчитывается при любом факте старта триала (может показаться несправедливым, но необходимо для защиты)

**Меры:**

- Использовать округление в меньшую сторону (floor) для расчета дней
- Ограничить `total_days_used` максимумом 7 дней
- Минимум 1 день засчитывается при любом факте старта триала (даже если прошло менее 24 часов)
- Нормализация email для защиты от Gmail-алиасов и других вариантов обхода
- Все операции выполняются в транзакциях для обеспечения консистентности данных
- Явная установка `hasUsedTrial = true` даже при `remainingDays <= 0`
