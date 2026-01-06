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
3. Нет отслеживания использования Trial по другим идентификаторам (IP, устройство, fingerprint)

---

## 2. Цель

Предотвратить злоупотребление пробным периодом через:

- Удаление и перерегистрацию аккаунта
- Регистрацию с разными email-адресами
- Использование разных устройств/IP

---

## 3. Решения

### 3.1. Отслеживание использования Trial по email (Базовый уровень)

**Суть:** Сохранять информацию об использовании Trial отдельно от пользователя.

**Реализация:**

- Создать таблицу `trial_usage_tracking` для отслеживания использованных Trial
- При активации Trial сохранять email (нормализованный) в таблицу
- При регистрации проверять, использовал ли этот email уже Trial

**Поля таблицы:**

```typescript
trial_usage_tracking {
  id: serial
  email_normalized: varchar(255) UNIQUE NOT NULL // нормализованный email
  first_used_at: timestamp NOT NULL // когда впервые использован Trial
  last_used_at: timestamp // последнее использование (для аналитики)
  usage_count: integer DEFAULT 1 // количество использований (для аналитики)
  created_at: timestamp
  updated_at: timestamp
}
```

**Логика:**

1. При активации Trial (`activateTrialForUser`):

   - Нормализовать email пользователя
   - Проверить наличие записи в `trial_usage_tracking`
   - Если записи нет → создать новую запись
   - Если запись есть → обновить `last_used_at` и `usage_count++`

2. При регистрации нового пользователя:
   - Нормализовать email
   - Проверить наличие записи в `trial_usage_tracking`
   - Если запись есть → установить `hasUsedTrial = true` для нового пользователя
   - Если записи нет → `hasUsedTrial = false` (можно активировать Trial)

**Преимущества:**

- ✅ Простая реализация
- ✅ Работает даже при hard delete аккаунта
- ✅ Не требует дополнительных данных от пользователя

**Недостатки:**

- ❌ Можно обойти, используя разные email-адреса
- ❌ Не защищает от использования временных email-сервисов

---

### 3.2. Отслеживание по комбинации email + IP (Средний уровень)

**Суть:** Дополнительно к email отслеживать IP-адрес первого использования Trial.

**Реализация:**

- Расширить таблицу `trial_usage_tracking`:
  ```typescript
  trial_usage_tracking {
    // ... существующие поля
    first_ip: varchar(45) // IPv4 или IPv6
    ip_hash: varchar(64) // SHA-256 хеш IP для дополнительной защиты
  }
  ```

**Логика:**

1. При активации Trial:

   - Сохранять email и IP-адрес (или хеш IP)
   - При регистрации проверять и email, и IP

2. При регистрации:
   - Проверять наличие записи по email ИЛИ по IP (хешу)
   - Если найдена запись → `hasUsedTrial = true`

**Преимущества:**

- ✅ Защищает от использования разных email с одного IP
- ✅ Усложняет обход для обычных пользователей

**Недостатки:**

- ❌ Можно обойти через VPN/прокси
- ❌ Проблемы с динамическими IP (мобильные операторы)
- ❌ Может блокировать легитимных пользователей из одной сети (офис, семья)

---

### 3.3. Отслеживание по устройству/браузеру (Продвинутый уровень)

**Суть:** Использовать fingerprint устройства/браузера для отслеживания.

**Реализация:**

- Расширить таблицу `trial_usage_tracking`:
  ```typescript
  trial_usage_tracking {
    // ... существующие поля
    device_fingerprint: varchar(255) // хеш fingerprint устройства
    user_agent_hash: varchar(64) // хеш User-Agent
  }
  ```

**Логика:**

1. На клиенте собирать fingerprint устройства (через библиотеку типа `fingerprintjs`)
2. При регистрации/активации Trial отправлять fingerprint на сервер
3. Сохранять fingerprint в `trial_usage_tracking`
4. При регистрации проверять fingerprint

**Преимущества:**

- ✅ Защищает от использования разных email на одном устройстве
- ✅ Работает даже при смене IP

**Недостатки:**

- ❌ Можно обойти через очистку браузера/использование приватного режима
- ❌ Проблемы с мобильными приложениями (нужна специальная реализация)
- ❌ Может блокировать легитимных пользователей на общих устройствах

---

### 3.4. Комбинированный подход (Рекомендуемый)

**Суть:** Комбинация методов с весовой системой и лимитами.

**Реализация:**

1. **Таблица отслеживания:**

```typescript
trial_usage_tracking {
  id: serial
  email_normalized: varchar(255) NOT NULL
  email_hash: varchar(64) // SHA-256 хеш для дополнительной защиты
  first_ip: varchar(45)
  ip_hash: varchar(64)
  device_fingerprint: varchar(255)
  first_used_at: timestamp NOT NULL
  last_used_at: timestamp
  usage_count: integer DEFAULT 1
  risk_score: integer DEFAULT 0 // оценка риска (0-100)
  created_at: timestamp
  updated_at: timestamp

  // Индексы
  INDEX idx_email_normalized (email_normalized)
  INDEX idx_email_hash (email_hash)
  INDEX idx_ip_hash (ip_hash)
  INDEX idx_device_fingerprint (device_fingerprint)
}
```

2. **Логика проверки:**

```typescript
async function checkTrialEligibility(
  email: string,
  ip?: string,
  deviceFingerprint?: string
): Promise<{
  eligible: boolean;
  reason?: string;
  riskScore: number;
}> {
  const emailNormalized = normalizeEmail(email);
  const emailHash = sha256(emailNormalized);

  // Проверяем по email
  const byEmail = await db
    .select()
    .from(trialUsageTracking)
    .where(eq(trialUsageTracking.emailNormalized, emailNormalized))
    .limit(1);

  if (byEmail.length) {
    return {
      eligible: false,
      reason: 'Trial already used with this email',
      riskScore: 100,
    };
  }

  // Проверяем по IP (если предоставлен)
  let riskScore = 0;
  if (ip) {
    const ipHash = sha256(ip);
    const byIp = await db
      .select()
      .from(trialUsageTracking)
      .where(eq(trialUsageTracking.ipHash, ipHash))
      .limit(1);

    if (byIp.length) {
      riskScore += 30; // IP использовался ранее
    }
  }

  // Проверяем по device fingerprint (если предоставлен)
  if (deviceFingerprint) {
    const byDevice = await db
      .select()
      .from(trialUsageTracking)
      .where(eq(trialUsageTracking.deviceFingerprint, deviceFingerprint))
      .limit(1);

    if (byDevice.length) {
      riskScore += 50; // Устройство использовалось ранее
    }
  }

  // Если riskScore >= 80 → блокируем
  if (riskScore >= 80) {
    return {
      eligible: false,
      reason: 'High risk of trial abuse detected',
      riskScore,
    };
  }

  return {
    eligible: true,
    riskScore,
  };
}
```

3. **При активации Trial:**

```typescript
async function activateTrialForUser(
  userId: number,
  email: string,
  ip?: string,
  deviceFingerprint?: string,
  timezone?: string
) {
  // Проверяем eligibility
  const eligibility = await checkTrialEligibility(email, ip, deviceFingerprint);

  if (!eligibility.eligible) {
    console.warn(`[Trial] User ${userId} not eligible: ${eligibility.reason}`);
    // Создаем подписку Basic БЕЗ Trial
    return await createBasicSubscription(userId, timezone, false);
  }

  // Активируем Trial
  const subscription = await createBasicSubscription(userId, timezone, true);

  // Сохраняем в tracking
  const emailNormalized = normalizeEmail(email);
  await db
    .insert(trialUsageTracking)
    .values({
      emailNormalized,
      emailHash: sha256(emailNormalized),
      firstIp: ip || null,
      ipHash: ip ? sha256(ip) : null,
      deviceFingerprint: deviceFingerprint || null,
      firstUsedAt: new Date(),
      lastUsedAt: new Date(),
      usageCount: 1,
      riskScore: eligibility.riskScore,
    })
    .onConflictDoUpdate({
      target: trialUsageTracking.emailNormalized,
      set: {
        lastUsedAt: new Date(),
        usageCount: sql`${trialUsageTracking.usageCount} + 1`,
      },
    });

  return subscription;
}
```

**Преимущества:**

- ✅ Комплексная защита от разных типов злоупотреблений
- ✅ Гибкая система оценки риска
- ✅ Не блокирует легитимных пользователей слишком агрессивно
- ✅ Позволяет собирать аналитику о попытках злоупотребления

**Недостатки:**

- ❌ Более сложная реализация
- ❌ Требует сбора дополнительных данных (IP, fingerprint)

---

## 4. Рекомендуемое решение

**Выбрать: Комбинированный подход (3.4) с упрощенной реализацией**

**Фаза 1 (MVP):**

- Реализовать отслеживание по email (3.1)
- Это решит основную проблему для большинства случаев

**Фаза 2 (Улучшение):**

- Добавить отслеживание по IP (3.2)
- Добавить систему оценки риска

**Фаза 3 (Продвинутая защита):**

- Добавить отслеживание по device fingerprint (3.3)
- Улучшить систему оценки риска

---

## 5. Технические детали реализации

### 5.1. Схема БД

```typescript
// server/infrastructure/db/schema.ts
export const trialUsageTracking = pgTable(
  'trial_usage_tracking',
  {
    id: serial('id').primaryKey(),
    emailNormalized: varchar('email_normalized', { length: 255 })
      .notNull()
      .unique(),
    emailHash: varchar('email_hash', { length: 64 }), // SHA-256
    firstIp: varchar('first_ip', { length: 45 }), // IPv4 или IPv6
    ipHash: varchar('ip_hash', { length: 64 }), // SHA-256 хеш IP
    deviceFingerprint: varchar('device_fingerprint', { length: 255 }),
    firstUsedAt: timestamp('first_used_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    lastUsedAt: timestamp('last_used_at', { withTimezone: true }),
    usageCount: integer('usage_count').default(1).notNull(),
    riskScore: integer('risk_score').default(0).notNull(),
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
    ipHashIdx: index('idx_trial_usage_ip_hash').on(table.ipHash),
    deviceFingerprintIdx: index('idx_trial_usage_device_fingerprint').on(
      table.deviceFingerprint
    ),
  })
);
```

### 5.2. Изменения в `activateTrialForUser`

```typescript
// server/application/subscriptions/trial.service.ts

export async function activateTrialForUser(
  userId: number,
  timezone?: string,
  email?: string, // Добавить email
  ip?: string, // Добавить IP
  deviceFingerprint?: string // Добавить fingerprint
) {
  // ... существующий код проверки hasUsedTrial ...

  // НОВОЕ: Проверка через trial_usage_tracking
  if (email) {
    const emailNormalized = normalizeEmail(email);
    const existing = await db
      .select()
      .from(trialUsageTracking)
      .where(eq(trialUsageTracking.emailNormalized, emailNormalized))
      .limit(1);

    if (existing.length) {
      // Email уже использовал Trial
      console.log(
        `[Trial] User ${userId} email ${emailNormalized} already used trial, skipping`
      );
      // Создаем Basic БЕЗ Trial
      return await createBasicSubscription(userId, timezone, false);
    }
  }

  // ... существующий код активации Trial ...

  // НОВОЕ: Сохранение в tracking
  if (email) {
    const emailNormalized = normalizeEmail(email);
    await db.insert(trialUsageTracking).values({
      emailNormalized,
      emailHash: sha256(emailNormalized),
      firstIp: ip || null,
      ipHash: ip ? sha256(ip) : null,
      deviceFingerprint: deviceFingerprint || null,
      firstUsedAt: new Date(),
      lastUsedAt: new Date(),
      usageCount: 1,
      riskScore: 0,
    });
  }

  return subscription;
}
```

### 5.3. Изменения в местах вызова `activateTrialForUser`

Нужно передавать email, IP и fingerprint во всех местах:

- `server/application/auth/oauth.ts`
- `server/api/auth/email/verify.post.ts`
- `server/api/auth/telegram/verify.post.ts`

---

## 6. Дополнительные меры защиты

### 6.1. Лимит попыток регистрации

- Ограничить количество регистраций с одного IP в день (например, 3-5)
- Хранить в Redis с TTL 24 часа

### 6.2. Аналитика и мониторинг

- Логировать все попытки регистрации с высоким riskScore
- Отслеживать паттерны злоупотребления (множественные регистрации, быстрые удаления)
- Алерты для администраторов при подозрительной активности

### 6.3. Grace period для восстановления

- При soft delete сохранять информацию о Trial в `trial_usage_tracking`
- При восстановлении аккаунта проверять, не истек ли grace period (например, 30 дней)
- Если grace period не истек → можно восстановить Trial

---

## 7. Миграция данных

**Вопрос:** Что делать с существующими пользователями, которые уже использовали Trial?

**Решение:**

1. Создать скрипт миграции, который:

   - Найдет всех пользователей с `hasUsedTrial = true`
   - Создаст записи в `trial_usage_tracking` для их email
   - Установит `first_used_at = trial_started_at` из users
   - Установит `usage_count = 1`

2. Запустить миграцию один раз после деплоя

---

## 8. Acceptance Criteria

1. ✅ Пользователь не может получить Trial повторно с тем же email
2. ✅ Пользователь не может обойти защиту через удаление и перерегистрацию
3. ✅ Система отслеживает использование Trial независимо от существования аккаунта
4. ✅ Существующие пользователи не теряют доступ после внедрения
5. ✅ Система собирает аналитику о попытках злоупотребления
6. ✅ Легитимные пользователи не блокируются (низкий false positive rate)

---

## 9. Приоритет реализации

**Высокий приоритет:**

- Фаза 1: Отслеживание по email (решает 80% проблемы)

**Средний приоритет:**

- Фаза 2: Отслеживание по IP + система оценки риска

**Низкий приоритет:**

- Фаза 3: Отслеживание по device fingerprint
- Расширенная аналитика и мониторинг

---

## 10. Риски и ограничения

**Риски:**

- Ложные срабатывания (false positives) для легитимных пользователей
- Проблемы с динамическими IP (мобильные операторы)
- Обход через временные email-сервисы

**Ограничения:**

- Не защищает от использования разных email-адресов (но усложняет)
- Не защищает от использования VPN/прокси
- Требует сбора дополнительных данных (GDPR compliance)

**Меры:**

- Настроить систему оценки риска с низким порогом блокировки
- Предусмотреть механизм обжалования для заблокированных пользователей
- Соблюдать требования GDPR при сборе данных (IP, fingerprint)
