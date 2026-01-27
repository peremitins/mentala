# ТЗ: Исправление удаления пользователя и генерации слотов уведомлений

## Статус: ⚠️ Частично реализовано (~40-50%)

**Реализовано:** Основная логика генерации слотов работает  
**Осталось:** Полный цикл удаления пользователя, DB-ограничения, восстановление аккаунта

### 📊 Сводка по реализации

#### ✅ Реализовано (Генерация слотов):

- ✅ Горизонт планирования: 2 дня (сегодня + завтра)
- ✅ Распределение по дням: частично сегодня, полностью завтра
- ✅ Равномерное распределение внутри дня
- ✅ Динамический интервал между слотами
- ✅ Детерминированный джиттер
- ✅ Улучшенный анти-оверлап (поиск в обе стороны)
- ✅ Удаление queued слотов при регенерации
- ✅ Защита ручных слотов от сдвига

#### ⚠️ Частично реализовано (Удаление пользователя):

- ⚠️ Фаза A (soft-delete): реализована через fallback `isBlocked`
- ⚠️ Очередь `user-deletion`: создана, но worker отсутствует

#### ❌ Не реализовано:

- ❌ Поля `deletion_requested_at`, `deleted_at` в схеме БД
- ❌ Фаза B (hard-delete): worker отсутствует
- ❌ Scheduler `user-deletion-sweeper`
- ❌ Защита от пушей удалённым пользователям в `sendToUser()`
- ❌ Миграции для каскадного удаления
- ❌ Обезличивание финансовых данных
- ❌ API восстановления аккаунта
- ❌ Partial unique index для предотвращения дублей слотов
- ❌ Обработка конфликтов при вставке с retry-логикой

### 🔧 Исправленные блокеры:

1. **Soft-delete vs Hard-delete:** Исправлено противоречие - теперь используется soft-delete (`deleted_at`) для grace-period, hard-delete только после grace-period
2. **Hard-delete после grace:** Добавлен scheduler `user-deletion-sweeper` (cron ежедневно) для гарантированного удаления после grace-period
3. **Таблицы с text user_id:** Явно указано, что `session_summaries` и `user_response_ids` очищаются вручную в worker (без FK)
4. **Финансовые таблицы:** Явно прописана миграция для изменения `payments.user_id` и `subscription_events.user_id` с CASCADE на SET NULL + nullable
5. **Restore-логика:** Исправлено условие (grace-period НЕ прошёл) + добавлен способ восстановления (одноразовая ссылка/токен или разрешение логина в течение grace)
6. **notification_preferences.enabled:** НЕ трогаем при удалении, сохраняем предыдущее состояние (исключаем deleted users в планировщиках)
7. **DB unique index:** Добавлен partial unique index для предотвращения дублей + обработка ошибок (retry с поиском свободного времени) + транзакция с SELECT FOR UPDATE для защиты от гонок
8. **Диапазоны через полночь:** Исправлена логика `generateSlotTimes()` для корректной работы с любыми временными окнами (18:00-04:00 и т.д.), включая случай когда мы во второй части окна
9. **Миграции:** Добавлен шаг "почистить мусор" (orphan-строки и дубли) перед добавлением FK/unique
10. **Retry при вставке:** Исправлено - ищем ближайшую свободную минуту в пределах окна, а не просто +1 minute
11. **Горизонт планирования:** Изменён с 1 на 2 дня (сегодня + завтра)
12. **minGapMinutes:** Унифицирован (10 минут везде)
13. **Разлогинивание:** Добавлено в Фазу A удаления

---

## 🔴 Проблема 1: Удаление пользователя

### Текущее состояние

- `POST /api/user/delete` удаляет только `chat_settings` через `deleteAll()`
- `DELETE /api/users/:id` удаляет только строку из `users`, оставляя все зависимые данные
- Уведомления продолжают отправляться после удаления пользователя
- Нет механизма восстановления аккаунта

### Цель

После удаления аккаунта:

1. Пуши не приходят вообще (даже если job уже в очереди)
2. Данные полностью удаляются или обезличиваются
3. Запрос возвращает ответ быстро (без ожидания каскада)
4. Есть возможность восстановить аккаунт в течение grace-period

---

## 🔴 Проблема 2: Генерация слотов уведомлений

### Текущее состояние

1. **Дублирование времени**: множество слотов на одно и то же время (например, 22:30)
2. **Неправильное распределение**: при включении уведомлений вечером на следующий день генерируется меньше слотов, чем настроено
3. **Горизонт планирования = 1 день**: слоты генерируются только на сегодня, "завтра" не заполняется
4. **Анти-оверлап работает только вперёд**: при упоре в границу окна слоты "прилипают" к концу диапазона

### Цель

1. Слоты распределяются равномерно без дублей во времени
2. "Сегодня" может быть неполным (если включили вечером), но "завтра" всегда полное по настройке
3. Минимальный интервал между слотами соблюдается
4. Горизонт планирования покрывает несколько дней вперёд

---

## 📋 ТЗ: Удаление пользователя

### 1.1. Схема БД

#### Добавить поля в таблицу `users`: ❌ **НЕ РЕАЛИЗОВАНО**

```sql
ALTER TABLE users
  ADD COLUMN deletion_requested_at TIMESTAMP WITH TIME ZONE,
  ADD COLUMN deleted_at TIMESTAMP WITH TIME ZONE;
```

**Текущее состояние:** Используется fallback через `isBlocked` в `server/api/user/delete.post.ts`

#### Добавить поля для обезличивания финансовых данных: ❌ **НЕ РЕАЛИЗОВАНО**

```sql
ALTER TABLE payments
  ADD COLUMN anonymized_at TIMESTAMP WITH TIME ZONE;

ALTER TABLE subscription_events
  ADD COLUMN anonymized_at TIMESTAMP WITH TIME ZONE;
```

#### Добавить каскадное удаление для всех user-owned таблиц:

**Критично (ON DELETE CASCADE):**

- `notification_slots.user_id` (integer)
- `notification_preferences.user_id` (integer)
- `user_devices.user_id` (integer)
- `habits.user_id` (integer)
- `therapy_topics_custom.user_id` (integer)
- `user_prompts.user_id` (integer)
- `welcome_prompts.user_id` (integer)
- `user_preferences.user_id` (integer)
- `chat_settings.user_id` (integer)
- `profiles.user_id` (integer)
- `ai_sessions.user_id` (integer)
- `sessions.user_id` (integer)
- `oauth_accounts.user_id` (integer)
- `telegram_accounts.user_id` (integer)
- `notification_interactions.user_id` (integer)
- `daily_adherence.user_id` (integer)
- `ai_generated_notification_texts.user_id` (integer)

**Ручная очистка (text user_id, без FK):**

- `session_summaries.user_id` (text) → удалять вручную в worker
- `user_response_ids.user_id` (text) → удалять вручную в worker

**Аудит/безопасность (ON DELETE SET NULL):**

- `security_events.user_id` (уже nullable)

**Финансы (ON DELETE SET NULL + обезличивание):**

**ВАЖНО:** Сейчас в схеме `payments.user_id` и `subscription_events.user_id` имеют `ON DELETE CASCADE`. Нужно изменить на `SET NULL`.

- `payments.user_id` → **ИЗМЕНИТЬ:** сделать nullable + `ON DELETE SET NULL` + добавить `anonymized_at` + удалить PII из `metadata`
- `subscription_events.user_id` → **ИЗМЕНИТЬ:** сделать nullable + `ON DELETE SET NULL` + добавить `anonymized_at`
- `user_subscriptions.user_id` → уже CASCADE, но нужно обезличить перед удалением (если требуется по закону)

**Частичный каскад:**

- `ai_notification_text_usage` → каскадится через `slot_id`, но нужно проверить `ai_text_id`

#### Миграции: ❌ **НЕ РЕАЛИЗОВАНО**

**ВАЖНО: Перед миграциями нужно почистить мусор (orphan-строки и дубли)**

```sql
-- 1. Удалить orphan-строки (где user_id не существует в users)
DELETE FROM payments WHERE user_id IS NOT NULL AND NOT EXISTS (
  SELECT 1 FROM users WHERE users.id = payments.user_id
);

DELETE FROM subscription_events WHERE user_id IS NOT NULL AND NOT EXISTS (
  SELECT 1 FROM users WHERE users.id = subscription_events.user_id
);

-- 2. Дедупликация notification_slots (оставляем только самый ранний слот для каждой пары user_id+scheduled_at)
DELETE FROM notification_slots ns1
WHERE EXISTS (
  SELECT 1 FROM notification_slots ns2
  WHERE ns2.user_id = ns1.user_id
    AND ns2.scheduled_at = ns1.scheduled_at
    AND ns2.status IN ('planned', 'queued')
    AND ns2.id < ns1.id
);

-- 3. Удалить orphan-строки в других таблицах (если есть)
-- Повторить для всех таблиц с FK на users
```

**2. Изменение финансовых таблиц (с CASCADE на SET NULL):**

```sql
-- payments: сделать user_id nullable и изменить FK
ALTER TABLE payments
  ALTER COLUMN user_id DROP NOT NULL,
  DROP CONSTRAINT IF EXISTS payments_user_id_fkey,
  ADD CONSTRAINT payments_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL;

ALTER TABLE payments
  ADD COLUMN IF NOT EXISTS anonymized_at TIMESTAMP WITH TIME ZONE;

-- subscription_events: сделать user_id nullable и изменить FK
ALTER TABLE subscription_events
  ALTER COLUMN user_id DROP NOT NULL,
  DROP CONSTRAINT IF EXISTS subscription_events_user_id_fkey,
  ADD CONSTRAINT subscription_events_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL;

ALTER TABLE subscription_events
  ADD COLUMN IF NOT EXISTS anonymized_at TIMESTAMP WITH TIME ZONE;
```

**3. Добавление каскадного удаления для integer user_id:**

```sql
-- Пример для notification_slots
ALTER TABLE notification_slots
  DROP CONSTRAINT IF EXISTS notification_slots_user_id_fkey,
  ADD CONSTRAINT notification_slots_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;

-- Повторить для всех таблиц с integer user_id (см. список выше)
```

**4. Таблицы с text user_id (без FK, ручная очистка):**

```sql
-- session_summaries и user_response_ids НЕ получают FK
-- Они будут очищаться вручную в deletion worker
-- (так как user_id там text, а не integer)
```

### 1.2. 2-фазное удаление (Soft-delete → Hard-delete) ⚠️ **ЧАСТИЧНО РЕАЛИЗОВАНО**

**ВАЖНО: Используем soft-delete для grace-period, hard-delete после grace-period**

#### Фаза A: Мгновенное отключение (синхронно, <300ms) ✅ **РЕАЛИЗОВАНО**

**Файл:** `server/api/user/delete.post.ts`

**API изменения:**

```typescript
// POST /api/user/delete
// DELETE /api/users/:id
// Оба должны вызывать один и тот же use-case
```

**Логика (синхронно):**

1. **Soft-delete пользователя:**

   - `deletion_requested_at = NOW()`
   - `deleted_at = NOW()` (помечаем как удалённого, но физически не удаляем)
   - Это делает аккаунт недоступным сразу

2. **Разлогинить пользователя:**

   - Ревокнуть все сессии: `UPDATE sessions SET revoked_at = NOW() WHERE user_id = ?`
   - Очистить cookie/токен на клиенте (вернуть в ответе флаг для фронта)
   - В ответе API вернуть: `{ ok: true, jobId: '...', loggedOut: true }` - фронт должен разлогинить пользователя

3. **Остановить пуши:**

   - Удалить `user_devices` для пользователя
   - Удалить `notification_slots` со статусами `planned` и `queued`
   - **ВАЖНО:** НЕ трогать `notification_preferences.enabled` - сохраняем предыдущее состояние
   - Вместо этого исключаем deleted users в планировщиках/генерации

4. **Поставить задачу в BullMQ:** `user-deletion` с `jobId: user-delete-${userId}` и `delay: 7 days` (запустится через grace-period)

   - **Дополнительно:** Создать cron/scheduler `user-deletion-sweeper` (ежедневно в 00:00) для safety-net
   - **ВАЖНО:** Sweeper должен быть зарегистрирован в планировщике (см. ниже)

5. **Вернуть ответ:** `{ ok: true, jobId: 'user-delete-${userId}', canRestore: true }` или `202 Accepted`

#### Фаза B: Полная зачистка (асинхронно, BullMQ worker) ❌ **НЕ РЕАЛИЗОВАНО**

**Worker: `user-deletion`**

**Текущее состояние:** Очередь создана (`server/application/users/queues/userDeletion.queue.ts`), но worker отсутствует

**ВАЖНО:** Job ставится с `delay: 7 days` в Фазе A, так что при запуске grace-period уже прошёл.

1. **Проверить, что grace-period прошёл (safety-check):**

   - Если `deletion_requested_at >= NOW() - INTERVAL '7 days'` → пропустить (ранний запуск, не должно быть)
   - Если `deletion_requested_at < NOW() - INTERVAL '7 days'` → продолжаем

2. **Обезличить финансовые данные (ПЕРЕД удалением пользователя):**

   - `payments`: `user_id = NULL`, удалить PII из `metadata`, `anonymized_at = NOW()`
   - `subscription_events`: `user_id = NULL`, `anonymized_at = NOW()`
   - **ВАЖНО:** Делаем это ДО удаления пользователя, так как после удаления FK каскад может помешать

3. **Удалить файлы пользователя в storage** (если есть R2 префиксы)

4. **Отменить/удалить jobs:**

   - `notification-slots-generation: slots-${userId}`
   - `delivery-${slotId}` для всех слотов пользователя

5. **Удалить пользователя физически:**

   - `DELETE FROM users WHERE id = ? AND deleted_at IS NOT NULL` (каскад удалит остальное)
   - **ВАЖНО:** `deleted_at` уже был установлен в Фазе A, не устанавливаем его здесь

6. **Ручная очистка таблиц с text user_id** (без FK):
   - `session_summaries`: `DELETE FROM session_summaries WHERE user_id = ?::text`
   - `user_response_ids`: `DELETE FROM user_response_ids WHERE user_id = ?::text`

**Дополнительно: Safety-net scheduler** ❌ **НЕ РЕАЛИЗОВАНО**

Создать cron/scheduler `user-deletion-sweeper` (ежедневно в 00:00 UTC):

```typescript
// server/application/users/deletion-sweeper.service.ts

export async function sweepDeletedUsers(): Promise<void> {
  // Найти всех пользователей, у которых прошёл grace-period, но они ещё не удалены
  const usersToDelete = await db
    .select()
    .from(users)
    .where(
      and(
        isNotNull(users.deletedAt),
        isNotNull(users.deletionRequestedAt),
        sql`${users.deletionRequestedAt} < NOW() - INTERVAL '7 days'`
      )
    );

  for (const user of usersToDelete) {
    // Поставить job на удаление (идемпотентно)
    await queue.add(
      'user-deletion',
      { userId: user.id },
      {
        jobId: `user-delete-${user.id}`,
        removeOnComplete: true,
      }
    );
  }
}
```

### 1.3. Защита от отправки пушей удалённым пользователям ❌ **НЕ РЕАЛИЗОВАНО**

**В `sendToUser()` добавить проверку:**

```typescript
// server/application/notifications/delivery.service.ts

export async function sendToUser(
  userId: number,
  payload: NotificationPayload
): Promise<number> {
  // КРИТИЧНО: Проверка перед отправкой
  const [user] = await db
    .select({
      id: users.id,
      deletionRequestedAt: users.deletionRequestedAt,
      deletedAt: users.deletedAt,
    })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  // Проверяем soft-delete (deleted_at) или запрос на удаление
  if (!user || user.deletedAt || user.deletionRequestedAt) {
    console.warn(
      `[FCM] User ${userId} is deleted or deletion requested, skipping notification`
    );
    return 0;
  }

  // ... остальная логика
}
```

**В `processDueSlots()` добавить проверку:**

```typescript
// Перед отправкой каждого слота проверять, что пользователь не удалён
```

### 1.4. Восстановление аккаунта (опционально) ❌ **НЕ РЕАЛИЗОВАНО**

**Проблема:** После soft-delete пользователь разлогинен, но должен иметь возможность восстановить аккаунт.

**Решение: Одноразовая ссылка/токен для восстановления**

**API:**

```typescript
// POST /api/user/restore-request
// Запрос на восстановление (без авторизации)
// 1. Принять email пользователя
// 2. Проверить, что пользователь существует и deletion_requested_at IS NOT NULL
// 3. Проверить, что deletion_requested_at >= NOW() - INTERVAL '7 days' (grace-period НЕ прошёл)
// 4. Сгенерировать одноразовый токен восстановления (JWT с коротким TTL, например 1 час)
// 5. Отправить email с ссылкой вида: /restore?token=...
// 6. Вернуть { ok: true, message: 'Restore link sent to email' }

// POST /api/user/restore
// Восстановление по токену (без авторизации)
// 1. Проверить токен восстановления
// 2. Проверить, что deletion_requested_at >= NOW() - INTERVAL '7 days' (grace-period НЕ прошёл)
// 3. Удалить deletion_requested_at и deleted_at
// 4. НЕ трогать notification_preferences.enabled (оно уже было сохранено)
// 5. Регенерировать слоты (если preferences.enabled = true)
// 6. Создать новую сессию и вернуть токен авторизации
// 7. Вернуть { ok: true, restored: true, sessionToken: '...' }
```

**Альтернативный вариант (проще):**

Разрешить логин в течение grace-period, но показывать только экран восстановления:

```typescript
// POST /api/auth/email/login
// При логине проверять deleted_at
// Если deleted_at IS NOT NULL и deletion_requested_at >= NOW() - INTERVAL '7 days':
//   - Разрешить логин
//   - Вернуть флаг { needsRestore: true }
//   - Фронт показывает экран восстановления
// Если grace-period прошёл - блокировать логин

// POST /api/user/restore (требует авторизации)
// 1. Проверить, что пользователь авторизован и deleted_at IS NOT NULL
// 2. Проверить, что deletion_requested_at >= NOW() - INTERVAL '7 days' (grace-period НЕ прошёл)
// 3. Удалить deletion_requested_at и deleted_at
// 4. НЕ трогать notification_preferences.enabled
// 5. Регенерировать слоты (если preferences.enabled = true)
// 6. Вернуть { ok: true, restored: true }
```

---

## 📋 ТЗ: Исправление генерации слотов

### 2.1. Горизонт планирования ✅ **РЕАЛИЗОВАНО**

**Проблема:** `horizonDays: 1` → слоты генерируются только на сегодня

**Решение:**

1. Создать единый конфиг: ✅ **РЕАЛИЗОВАНО**

**Файл:** `server/application/notifications/global-orchestration.service.ts` (строки 75-79)

```typescript
const SCHEDULE_CONFIG = {
  horizonDays: 2, // Сегодня + завтра
  jitterMinutes: 15,
  minGapMinutes: 10,
};
```

2. Использовать конфиг везде: ✅ **РЕАЛИЗОВАНО**
   - `global-orchestration.service.ts` ✅
   - `scheduler.service.ts` ✅

### 2.2. Исправление распределения слотов по дням ✅ **РЕАЛИЗОВАНО**

**Проблема:** При включении вечером на следующий день генерируется меньше слотов

**Решение в `generateSlotTimes()`:**

**Файл:** `server/application/notifications/slot-times.service.ts`

**Ключевые требования:**

1. Для текущего дня: генерировать только то количество, которое влезет в оставшееся время
2. Для следующего дня: всегда генерировать полное количество `timesPerDay`
3. Равномерное распределение внутри дня: первое уведомление около начала окна, последнее около конца, остальные равномерно
4. Динамический интервал: для малого количества уведомлений максимально отдалить, для большого - минимум 10 минут

```typescript
// server/application/notifications/slot-times.service.ts

export function generateSlotTimes(
  timesPerDay: number,
  timezone: string,
  days: number,
  activeDays: number[] = [0, 1, 2, 3, 4, 5, 6],
  timeRangeStart: number = 540,
  timeRangeEnd: number = 1350,
  customSlotTimes: (number | null)[] | null = null,
  jitterMinutes: number = 15,
  userId: number // ДОБАВИТЬ: для детерминированного джиттера
): Date[] {
  const slots: Date[] = [];
  const nowUTC = new Date();
  const nowLocal = toZonedTime(nowUTC, timezone);
  const currentMinutes = nowLocal.getHours() * 60 + nowLocal.getMinutes();
  const crossesMidnight = timeRangeStart > timeRangeEnd;

  // Вычисляем динамический интервал
  // Если уведомлений мало (≤10), максимально отдалить (но равномерно)
  // Если много, использовать minGapMinutes (10 минут)
  const windowDuration = crossesMidnight
    ? 1440 - timeRangeStart + timeRangeEnd
    : timeRangeEnd - timeRangeStart;
  const dynamicMinGap =
    timesPerDay <= 10
      ? Math.max(10, Math.floor(windowDuration / (timesPerDay + 1))) // Равномерное распределение
      : 10; // Минимум 10 минут для большого количества

  for (let d = 0; d < days; d++) {
    const dateLocal = new Date(nowLocal);
    dateLocal.setDate(dateLocal.getDate() + d);
    const dayOfWeek = dateLocal.getDay();

    if (!activeDays.includes(dayOfWeek)) {
      continue;
    }

    let slotsForThisDay: number;
    let timeWindowStart: number;
    let timeWindowEnd: number;

    if (d === 0) {
      // Текущий день: считаем оставшееся время
      if (crossesMidnight) {
        // Диапазон через полночь (например, 18:00-04:00)
        // Определяем, в какой части окна мы находимся
        if (currentMinutes >= timeRangeStart) {
          // Мы в первой части (вечер, например 20:00 при окне 18:00-04:00)
          // Оставшееся время: до 24:00 + от 00:00 до timeRangeEnd
          const remainingMinutes = 1440 - currentMinutes + timeRangeEnd;
          slotsForThisDay = Math.min(
            timesPerDay,
            calculateSlotsForTimeWindow(
              remainingMinutes,
              timesPerDay,
              dynamicMinGap
            )
          );
          // ВАЖНО: Для распределения используем правильные границы
          // timeWindowStart = текущая позиция в первой части
          // timeWindowEnd = конец первой части (1440) + начало второй части (0) + конец второй части (timeRangeEnd)
          // Но для проверки попадания в окно используем timeRangeStart и timeRangeEnd
          timeWindowStart = currentMinutes;
          timeWindowEnd = 1440; // Конец первой части (до 24:00)
          // Слоты после 00:00 будут в следующем дне, но для распределения учитываем обе части
        } else if (currentMinutes <= timeRangeEnd) {
          // Мы во второй части (утро, например 02:00 при окне 18:00-04:00)
          // Оставшееся время: до timeRangeEnd
          const remainingMinutes = timeRangeEnd - currentMinutes;
          slotsForThisDay = Math.min(
            timesPerDay,
            calculateSlotsForTimeWindow(
              remainingMinutes,
              timesPerDay,
              dynamicMinGap
            )
          );
          timeWindowStart = currentMinutes;
          timeWindowEnd = timeRangeEnd;
        } else {
          // Мы вне окна (например, 10:00 при окне 18:00-04:00)
          // Слотов на сегодня нет, но они будут на завтра
          slotsForThisDay = 0;
          continue;
        }
      } else {
        // Обычный диапазон внутри суток (например, 10:00-22:00)
        if (currentMinutes < timeRangeStart) {
          // Ещё не началось - генерируем полное количество
          slotsForThisDay = timesPerDay;
          timeWindowStart = timeRangeStart;
          timeWindowEnd = timeRangeEnd;
        } else if (currentMinutes >= timeRangeEnd) {
          // Уже закончилось - слотов на сегодня нет
          slotsForThisDay = 0;
          continue;
        } else {
          // Мы в середине диапазона
          const remainingMinutes = timeRangeEnd - currentMinutes;
          slotsForThisDay = Math.min(
            timesPerDay,
            calculateSlotsForTimeWindow(
              remainingMinutes,
              timesPerDay,
              dynamicMinGap
            )
          );
          timeWindowStart = currentMinutes;
          timeWindowEnd = timeRangeEnd;
        }
      }
    } else {
      // Следующие дни: ВСЕГДА полное количество
      slotsForThisDay = timesPerDay;
      timeWindowStart = timeRangeStart;
      timeWindowEnd = timeRangeEnd;
    }

    // Генерируем slotsForThisDay слотов равномерно распределённых по дню
    // Первое около начала окна, последнее около конца, остальные равномерно
    const manualTimes = Array.isArray(customSlotTimes) ? customSlotTimes : [];

    for (let i = 0; i < slotsForThisDay; i++) {
      const manualValue = manualTimes[i];
      let slotMinutes: number;

      if (manualValue !== null && manualValue !== undefined) {
        slotMinutes = manualValue;
      } else {
        // Равномерное распределение: первое около начала, последнее около конца
        if (slotsForThisDay === 1) {
          // Одно уведомление - в середине окна
          slotMinutes = timeWindowStart + (timeWindowEnd - timeWindowStart) / 2;
        } else {
          // Несколько уведомлений - равномерно распределяем
          // ВАЖНО: Для диапазонов через полночь нужно правильно вычислять шаг
          // Используем "линейные минуты" для корректной работы с любыми окнами

          let step: number;
          let windowDuration: number;

          if (crossesMidnight) {
            // Диапазон через полночь (например, 18:00-04:00)
            // Работаем в "линейных минутах": [start, start+duration]
            // duration = (1440 - start) + end
            const fullWindowDuration = 1440 - timeRangeStart + timeRangeEnd;

            if (d === 0 && currentMinutes >= timeRangeStart) {
              // Текущий день, мы в первой части окна (вечер)
              // Оставшееся окно: от currentMinutes до конца окна
              // Вычисляем позицию currentMinutes в полном окне
              const positionInFullWindow = currentMinutes - timeRangeStart;
              const remainingInFullWindow =
                fullWindowDuration - positionInFullWindow;
              windowDuration = remainingInFullWindow;
              // Начинаем с позиции в полном окне
              const startPosition = positionInFullWindow;
              step = windowDuration / (slotsForThisDay - 1);
              const positionInWindow = startPosition + step * i;
              // Преобразуем обратно в минуты дня
              if (positionInWindow < 1440 - timeRangeStart) {
                // В первой части (вечер текущего дня)
                slotMinutes = timeRangeStart + positionInWindow;
              } else {
                // Во второй части (утро следующего дня)
                slotMinutes = positionInWindow - (1440 - timeRangeStart);
              }
            } else if (d === 0 && currentMinutes <= timeRangeEnd) {
              // Текущий день, мы во второй части окна (утро)
              // Оставшееся окно: от currentMinutes до timeRangeEnd
              windowDuration = timeRangeEnd - currentMinutes;
              step = windowDuration / (slotsForThisDay - 1);
              slotMinutes = currentMinutes + step * i;
            } else {
              // Полный день или следующий день
              // Равномерно распределяем по всему окну
              step = fullWindowDuration / (slotsForThisDay - 1);
              const positionInWindow = step * i;
              if (positionInWindow < 1440 - timeRangeStart) {
                // В первой части (вечер)
                slotMinutes = timeRangeStart + positionInWindow;
              } else {
                // Во второй части (утро следующего дня)
                slotMinutes = positionInWindow - (1440 - timeRangeStart);
              }
            }
          } else {
            // Обычный диапазон внутри суток
            windowDuration = timeWindowEnd - timeWindowStart;
            step = windowDuration / (slotsForThisDay - 1);
            slotMinutes = timeWindowStart + step * i;
          }
        }

        // Нормализация для диапазона через полночь
        if (crossesMidnight && slotMinutes >= 1440) {
          slotMinutes = slotMinutes % 1440;
        }

        // Детерминированный джиттер (не Math.random!)
        // ВАЖНО: userId нужно добавить в параметры generateSlotTimes()
        const jitter = generateDeterministicJitter(
          userId, // Передаётся из параметров функции
          dateLocal,
          i,
          jitterMinutes
        );
        slotMinutes += jitter;

        // Нормализация и ограничение границами
        slotMinutes = Math.round(slotMinutes);
        if (slotMinutes >= 1440) slotMinutes = slotMinutes % 1440;
        if (slotMinutes < 0) slotMinutes = (slotMinutes % 1440) + 1440;

        // Ограничиваем временным окном
        if (!crossesMidnight) {
          // Обычный диапазон - просто ограничиваем границами
          slotMinutes = Math.max(
            timeRangeStart,
            Math.min(timeRangeEnd, slotMinutes)
          );
        } else {
          // Диапазон через полночь - проверяем попадание в окно
          // Окно: [timeRangeStart, 1440) U [0, timeRangeEnd]
          if (slotMinutes >= timeRangeStart || slotMinutes <= timeRangeEnd) {
            // В окне - оставляем как есть
          } else {
            // Вне окна - находим ближайшую границу
            if (slotMinutes > timeRangeEnd && slotMinutes < timeRangeStart) {
              // Между концом второй части и началом первой части
              const distToStart = timeRangeStart - slotMinutes;
              const distToEnd = slotMinutes - timeRangeEnd;
              slotMinutes =
                distToStart < distToEnd ? timeRangeStart : timeRangeEnd;
            }
          }
        }
      }

      // Создаём Date объект и добавляем в slots
      const slotHour = Math.floor(slotMinutes / 60);
      const slotMin = slotMinutes % 60;
      let slotDay = dateLocal.getDate();

      // ВАЖНО: Для диапазонов через полночь правильно определяем день
      if (crossesMidnight) {
        // Если слот попадает в часть после полуночи (0:00 - timeRangeEnd)
        if (slotMinutes < timeRangeEnd) {
          slotDay = dateLocal.getDate() + 1;
        } else if (slotMinutes >= timeRangeStart) {
          // Слот в первой части (вечер) - остаётся в текущем дне
          slotDay = dateLocal.getDate();
        }
        // Если slotMinutes между timeRangeEnd и timeRangeStart - это вне окна, не должно быть
      }

      const slotLocalDate = new Date(
        dateLocal.getFullYear(),
        dateLocal.getMonth(),
        slotDay,
        slotHour,
        slotMin,
        0,
        0
      );

      const slotUTC = fromZonedTime(slotLocalDate, timezone);
      const slotLocal = toZonedTime(slotUTC, timezone);

      // Пропускаем слоты в прошлом (только для текущего дня)
      if (d === 0 && slotLocal <= nowLocal) {
        continue;
      }

      slots.push(slotUTC);
    }
  }

  return slots;
}

// Вспомогательная функция для вычисления оставшихся минут
function calculateRemainingMinutesInRange(
  currentMinutes: number,
  rangeStart: number,
  rangeEnd: number,
  crossesMidnight: boolean
): number {
  if (!crossesMidnight) {
    return Math.max(0, rangeEnd - currentMinutes);
  } else {
    if (currentMinutes >= rangeStart) {
      return 1440 - currentMinutes + rangeEnd;
    } else if (currentMinutes <= rangeEnd) {
      return rangeEnd - currentMinutes;
    } else {
      return 0;
    }
  }
}

// Вспомогательная функция для вычисления количества слотов для временного окна
function calculateSlotsForTimeWindow(
  windowMinutes: number,
  desiredSlots: number,
  minGapMinutes: number
): number {
  const maxSlots = Math.floor(windowMinutes / minGapMinutes);
  return Math.min(desiredSlots, maxSlots);
}
```

### 2.3. Детерминированный джиттер ✅ **РЕАЛИЗОВАНО**

**Проблема:** `Math.random()` может давать одинаковые значения при множественных вызовах

**Решение:**

**Файлы:**

- `server/application/notifications/slot-times.service.ts` (строки 22-40)
- `server/application/notifications/global-orchestration.service.ts` (строки 51-71)

```typescript
// server/application/notifications/slot-times.service.ts

function generateDeterministicJitter(
  userId: number,
  slotDate: Date,
  slotIndex: number,
  jitterMinutes: number
): number {
  // Простой хеш для детерминированности
  // Используем дату без времени для стабильности при регенерации
  const dateStr = slotDate.toISOString().split('T')[0]; // YYYY-MM-DD
  const seed = `${userId}-${dateStr}-${slotIndex}`;
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    const char = seed.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  // Преобразуем в диапазон [-jitterMinutes, +jitterMinutes]
  return (Math.abs(hash) % (jitterMinutes * 2 + 1)) - jitterMinutes;
}
```

**Важно:** userId нужно передавать в `generateSlotTimes()`. Добавить параметр `userId: number`. ✅ **РЕАЛИЗОВАНО**

### 2.4. Улучшенный анти-оверлап ✅ **РЕАЛИЗОВАНО**

**Проблема:** Текущий алгоритм `preventSimultaneousNotifications()` сдвигает только вперёд и упирается в границу окна

**Решение:**

**Файл:** `server/application/notifications/prevent-overlap.service.ts` (строки 74-112)

1. **Улучшить `preventSimultaneousNotifications()`:**

   - Искать свободное время в обе стороны (не только вперёд)
   - Если упёрлись в границу окна - искать ближайшее свободное время внутри окна
   - Для ручных времён (`customSlotTimes`) - не сдвигать, только предупреждать

2. **Проверка пересечений перед созданием слота (опционально, для дополнительной защиты):**
   - Можно добавить проверку в `global-orchestration.service.ts` перед `insertSlot()`
   - Но основная защита должна быть в `preventSimultaneousNotifications()`

```typescript
// server/application/notifications/prevent-overlap.service.ts

export async function preventSimultaneousNotifications(
  userId: number,
  minGapMinutes: number = 10 // ВАЖНО: Должно совпадать с NOTIFICATION_CONFIG.minGapMinutes
): Promise<void> {
  // ... существующая логика получения слотов ...

  for (let i = 1; i < allSlots.length; i++) {
    const prevSlot = allSlots[i - 1];
    const currentSlot = allSlots[i];
    const gapMinutes = /* ... вычисление gap ... */;

    if (gapMinutes < minGapMinutes) {
      // ВАЖНО: Проверяем, является ли слот ручным (customSlotTimes)
      const isManualSlot = /* проверка через preference */;

      if (isManualSlot) {
        // Ручной слот - не сдвигаем, только логируем предупреждение
        console.warn(
          `[Scheduler] ⚠️ Manual slot ${currentSlot.id} overlaps with previous slot, but not shifting (manual times cannot be changed)`
        );
        continue;
      }

      // Ищем свободное время в обе стороны
      const freeTime = findNearestFreeTimeInBothDirections(
        currentSlot.scheduledAt,
        allSlots.slice(0, i), // Все предыдущие слоты
        minGapMinutes,
        slotRange,
        timezone
      );

      if (freeTime) {
        await updateSlotTime(currentSlot.id, freeTime, timezone, updatedPayload);
        allSlots[i].scheduledAt = freeTime;
      } else {
        // Не удалось найти свободное время - логируем ошибку
        console.error(
          `[Scheduler] ❌ Cannot find free time for slot ${currentSlot.id} within range`
        );
      }
    }
  }
}

// Новая функция для поиска свободного времени в обе стороны
function findNearestFreeTimeInBothDirections(
  baseTime: Date,
  existingSlots: Array<{ scheduledAt: Date }>,
  minGapMinutes: number,
  range: { start: number; end: number; crossesMidnight: boolean },
  timezone: string
): Date | null {
  const baseLocal = toLocalTime(baseTime, timezone);
  const minGapMs = minGapMinutes * 60 * 1000;

  // Ищем вперёд
  for (let offset = minGapMs; offset < 60 * 60 * 1000; offset += 5 * 60 * 1000) { // Ищем до 1 часа вперёд
    const candidateTime = new Date(baseLocal.getTime() + offset);
    const candidateUTC = toUTC(candidateTime, timezone);

    if (isTimeFree(candidateUTC, existingSlots, minGapMs) &&
        isWithinRange(candidateTime, range, timezone)) {
      return candidateUTC;
    }
  }

  // Ищем назад
  for (let offset = minGapMs; offset < 60 * 60 * 1000; offset += 5 * 60 * 1000) {
    const candidateTime = new Date(baseLocal.getTime() - offset);
    const candidateUTC = toUTC(candidateTime, timezone);

    if (isTimeFree(candidateUTC, existingSlots, minGapMs) &&
        isWithinRange(candidateTime, range, timezone)) {
      return candidateUTC;
    }
  }

  return null;
}
```

### 2.5. DB-ограничения как safety net ❌ **НЕ РЕАЛИЗОВАНО**

**ВАЖНО: Добавляем partial unique index для предотвращения дублей**

**Решение:** Используем unique index + обработку ошибок при вставке:

```sql
-- Предотвращает дубли слотов в одну и ту же минуту
CREATE UNIQUE INDEX idx_notification_slots_user_scheduled_unique
ON notification_slots (user_id, scheduled_at)
WHERE status IN ('planned', 'queued');
```

**Текущее состояние:** Индекс не создан, обработка конфликтов при вставке отсутствует

**Обработка конфликтов при вставке:**

```typescript
// server/application/notifications/repositories/notification-slots.repository.ts

export async function insertSlot(
  slot: NotificationSlotInsert,
  timezone: string,
  minGapMinutes: number = 10
): Promise<void> {
  const maxRetries = 5;
  let retryCount = 0;
  let currentScheduledAt = slot.scheduledAt;
  const isManualSlot = slot.customSlotTime !== null; // Ручной слот

  while (retryCount < maxRetries) {
    try {
      // ВАЖНО: Используем транзакцию с SELECT FOR UPDATE для защиты от гонок
      await db.transaction(async (tx) => {
        // Проверяем конфликты с блокировкой строк
        const conflictingSlots = await tx
          .select()
          .from(notificationSlots)
          .where(
            and(
              eq(notificationSlots.userId, slot.userId),
              sql`${notificationSlots.status} IN ('planned', 'queued')`,
              // Проверяем слоты в окне ±minGapMinutes
              gte(
                notificationSlots.scheduledAt,
                new Date(
                  currentScheduledAt.getTime() - minGapMinutes * 60 * 1000
                )
              ),
              lte(
                notificationSlots.scheduledAt,
                new Date(
                  currentScheduledAt.getTime() + minGapMinutes * 60 * 1000
                )
              )
            )
          )
          .for('update'); // Блокируем строки для защиты от параллельных инсертов

        if (conflictingSlots.length > 0 && !isManualSlot) {
          // Есть конфликт и это не ручной слот - ищем свободное время
          const freeTime = await findNearestFreeTimeInWindow(
            currentScheduledAt,
            slot.userId,
            minGapMinutes,
            timezone,
            tx
          );

          if (freeTime) {
            currentScheduledAt = freeTime;
            console.warn(
              `[Slots] Time conflict for user ${slot.userId}, shifted to ${freeTime.toISOString()}`
            );
          } else {
            // Не удалось найти свободное время - сдвигаем на minGapMinutes
            currentScheduledAt = new Date(
              currentScheduledAt.getTime() + minGapMinutes * 60 * 1000
            );
            console.warn(
              `[Slots] No free time found, shifting by ${minGapMinutes} minutes for user ${slot.userId}`
            );
          }
        }

        // Вставляем слот
        await tx.insert(notificationSlots).values({
          ...slot,
          scheduledAt: currentScheduledAt,
          scheduledAtLocal: toLocalTime(currentScheduledAt, timezone),
        });
      });

      return; // Успешно вставлено
    } catch (error: any) {
      // Проверяем, это ли конфликт unique index
      if (
        error?.code === '23505' &&
        error?.constraint === 'idx_notification_slots_user_scheduled_unique'
      ) {
        retryCount++;

        if (isManualSlot) {
          // Ручной слот - не сдвигаем, логируем и пропускаем
          console.warn(
            `[Slots] ⚠️ Manual slot conflict for user ${slot.userId} at ${currentScheduledAt.toISOString()}. Skipping (manual times cannot be changed).`
          );
          return; // Пропускаем ручной слот при конфликте
        }

        // Ищем ближайшую свободную минуту
        const freeTime = await findNearestFreeTimeInWindow(
          currentScheduledAt,
          slot.userId,
          minGapMinutes,
          timezone
        );

        if (freeTime) {
          currentScheduledAt = freeTime;
          console.warn(
            `[Slots] Unique constraint violation, retrying with time ${freeTime.toISOString()} (attempt ${retryCount}/${maxRetries})`
          );
        } else {
          // Сдвигаем на minGapMinutes
          currentScheduledAt = new Date(
            currentScheduledAt.getTime() + minGapMinutes * 60 * 1000
          );
          console.warn(
            `[Slots] Unique constraint violation, shifting by ${minGapMinutes} minutes (attempt ${retryCount}/${maxRetries})`
          );
        }
      } else {
        // Другая ошибка - пробрасываем
        throw error;
      }
    }
  }

  // Если не удалось после всех попыток - логируем и пропускаем слот
  console.error(
    `[Slots] ❌ Failed to insert slot after ${maxRetries} retries for user ${slot.userId}, scheduledAt: ${slot.scheduledAt.toISOString()}`
  );
  // НЕ бросаем ошибку, чтобы не падала вся регенерация
}

// Вспомогательная функция для поиска свободного времени
async function findNearestFreeTimeInWindow(
  baseTime: Date,
  userId: number,
  minGapMinutes: number,
  timezone: string,
  tx?: any // Опциональная транзакция
): Promise<Date | null> {
  const dbInstance = tx || db;
  const minGapMs = minGapMinutes * 60 * 1000;
  const maxSearchRange = 60 * 60 * 1000; // Ищем до 1 часа в обе стороны

  // Ищем вперёд
  for (let offset = minGapMs; offset < maxSearchRange; offset += minGapMs) {
    const candidateTime = new Date(baseTime.getTime() + offset);
    const conflicting = await checkTimeConflict(
      candidateTime,
      userId,
      minGapMinutes,
      dbInstance
    );
    if (!conflicting) {
      return candidateTime;
    }
  }

  // Ищем назад
  for (let offset = minGapMs; offset < maxSearchRange; offset += minGapMs) {
    const candidateTime = new Date(baseTime.getTime() - offset);
    const conflicting = await checkTimeConflict(
      candidateTime,
      userId,
      minGapMinutes,
      dbInstance
    );
    if (!conflicting) {
      return candidateTime;
    }
  }

  return null;
}

async function checkTimeConflict(
  time: Date,
  userId: number,
  minGapMinutes: number,
  dbInstance: any
): Promise<boolean> {
  const conflicting = await dbInstance
    .select()
    .from(notificationSlots)
    .where(
      and(
        eq(notificationSlots.userId, userId),
        sql`${notificationSlots.status} IN ('planned', 'queued')`,
        gte(
          notificationSlots.scheduledAt,
          new Date(time.getTime() - minGapMinutes * 60 * 1000)
        ),
        lte(
          notificationSlots.scheduledAt,
          new Date(time.getTime() + minGapMinutes * 60 * 1000)
        )
      )
    )
    .limit(1);

  return conflicting.length > 0;
}
```

**ВАЖНО:**

- **Ручные времена (`customSlotTimes`):** При конфликте unique index (код 23505) слот **пропускается** (не вставляется) с предупреждением в логах. Это означает, что если пользователь задал два ручных времени на одну и ту же минуту, второй слот не будет создан.
- **Обычные слоты:** При конфликте unique index ищется ближайшая свободная минута в пределах окна и слот вставляется с новым временем.
- Используется транзакция с `SELECT FOR UPDATE` для защиты от гонок при параллельных инсертах.

### 2.6. Регенерация: удалять queued тоже ✅ **РЕАЛИЗОВАНО**

**Проблема:** `deletePlannedFutureSlotsForSource()` удаляет только `planned`

**Решение:**

**Файл:** `server/application/notifications/repositories/notification-slots.repository.ts`

```typescript
// server/application/notifications/repositories/notification-slots.repository.ts

export async function deletePlannedFutureSlotsForSource(
  userId: number,
  kind: NotificationKind,
  entityKey: string | null,
  nowUTC: Date
): Promise<number> {
  // Удалять и planned, и queued
  return await db
    .delete(notificationSlots)
    .where(
      and(
        eq(notificationSlots.userId, userId),
        eq(notificationSlots.kind, kind),
        entityKey
          ? eq(notificationSlots.entityKey, entityKey)
          : isNull(notificationSlots.entityKey),
        sql`${notificationSlots.status} IN ('planned', 'queued')`,
        gte(notificationSlots.scheduledAt, nowUTC)
      )
    );
}
```

### 2.7. Ручные времена (customSlotTimes) ⚠️ **ЧАСТИЧНО РЕАЛИЗОВАНО**

**Важно:** Если пользователь задал `customSlotTimes`, их нельзя сдвигать анти-оверлапом или при конфликте unique index.

**Решение:**

1. **В UI/API при сохранении:** ❓ **ТРЕБУЕТ ПРОВЕРКИ**

   - Проверять пересечения между ручными временами
   - Показывать warning, но разрешать сохранение
   - Пользователь может сохранить пересекающиеся времена, но предупреждён

2. **При генерации слотов:** ⚠️ **ЧАСТИЧНО**

   - Ручные времена вставляются как есть (без проверки конфликтов перед вставкой) ✅
   - Если при вставке возникает конфликт unique index (код 23505) - слот **пропускается** (не вставляется) с предупреждением в логах ❌ (нет unique index)
   - Это означает: если два ручных времени попадают на одну минуту, второй не будет создан

3. **В `preventSimultaneousNotifications()`:** ✅ **РЕАЛИЗОВАНО**
   - Пропускать ручные слоты (не сдвигать) ✅

```typescript
// server/api/notifications/prefs/[kind].put.ts

// При сохранении customSlotTimes проверяем пересечения
if (body.customSlotTimes) {
  const warnings: string[] = [];
  const sortedTimes = body.customSlotTimes
    .filter((t) => t !== null && t !== undefined)
    .sort((a, b) => a - b);

  for (let i = 1; i < sortedTimes.length; i++) {
    const gap = sortedTimes[i] - sortedTimes[i - 1];
    if (gap < minGapMinutes) {
      warnings.push(
        `Времена ${formatMinutes(sortedTimes[i - 1])} и ${formatMinutes(sortedTimes[i])} слишком близки (интервал ${gap} мин, минимум ${minGapMinutes} мин)`
      );
    }
  }

  if (warnings.length > 0) {
    // Возвращаем warning, но не блокируем сохранение
    response.warnings = warnings;
  }
}
```

---

## ✅ Уточнения (получены ответы)

1. **Grace-period:** 7 дней ✅
2. **Минимальный интервал:** Динамический - если уведомлений много → 10 минут, если мало (≤10/день) → максимально отдалить, но равномерно распределить. Важно: уведомления внутри одной группы должны быть равномерно разнесены по дню (первое около начала окна, последнее около конца, остальные равномерно).
3. **Горизонт планирования:** Использовать `horizonDays: 2` (сегодня + завтра). Воркер запускается раз в час, так что БД не раздуется. `needs-regeneration` и очистка старых слотов предотвратят раздувание БД. Это обеспечивает, что при включении уведомлений вечером "завтра" будет заполнено сразу.
4. **Ручные времена:** Warning-режим (разрешить, но предупредить) ✅
5. **Платежи:** На усмотрение разработчика, главное по закону и проще. Предлагаю: `user_id = NULL` + поле `anonymized_at` для аудита.
6. **Приоритет:** Вариант A - сначала слоты (критично для пользователей) ✅

---

## ✅ Критерии приемки

### Удаление пользователя:

- [ ] ❌ После удаления аккаунта ни один пуш больше не уходит (даже если job уже был enqueued) - **НЕ РЕАЛИЗОВАНО** (нет проверки в sendToUser)
- [x] ✅ Удаление возвращает ответ быстро (<300ms, без ожидания каскада) - **РЕАЛИЗОВАНО**
- [x] ✅ Повторный вызов удаления идемпотентен - **РЕАЛИЗОВАНО** (через jobId)
- [ ] ❌ Grace-period работает (можно восстановить в течение N дней) - **НЕ РЕАЛИЗОВАНО** (нет API восстановления)
- [ ] ❌ Финансовые данные обезличиваются, а не удаляются - **НЕ РЕАЛИЗОВАНО** (нет worker'а)
- [ ] ❌ Все user-owned данные удаляются каскадом - **НЕ РЕАЛИЗОВАНО** (нет миграций)

### Генерация слотов:

- [x] ✅ Сценарий "включил в 18:00, 5/день": сегодня планируется "сколько влезет до конца окна", завтра планируется ровно 5 - **РЕАЛИЗОВАНО**
- [ ] ❌ Нет >1 pending слота в одну и ту же минуту у пользователя (unique index предотвращает дубли) - **НЕ РЕАЛИЗОВАНО** (нет unique index)
- [ ] ⚠️ Ручные времена (`customSlotTimes`): при конфликте unique index слот пропускается (не вставляется) с предупреждением в логах. В UI показывается warning при сохранении пересекающихся времён, но сохранение разрешено. - **ЧАСТИЧНО** (нет unique index, но есть защита от сдвига)
- [ ] ❌ Unique index предотвращает дубли при параллельных инсертах - **НЕ РЕАЛИЗОВАНО**
- [x] ✅ При большом количестве уведомлений нет "кучи в 22:30" - **РЕАЛИЗОВАНО** (равномерное распределение)
- [x] ✅ Минимальный интервал между слотами соблюдается (динамически: для малого количества - максимально отдалить, для большого - минимум 10 минут) - **РЕАЛИЗОВАНО**
- [x] ✅ Уведомления внутри одной группы равномерно распределены по дню (первое около начала окна, последнее около конца, остальные равномерно) - **РЕАЛИЗОВАНО**
- [x] ✅ Джиттер детерминирован (одинаковые входные данные → одинаковый результат) - **РЕАЛИЗОВАНО**

---

## 📝 Порядок реализации

1. **Приоритет 1 (критично):** Исправление генерации слотов

   - [x] ✅ Распределение по дням (сегодня частично, завтра полностью) - **РЕАЛИЗОВАНО**
   - [x] ✅ Равномерное распределение внутри дня (первое около начала, последнее около конца) - **РЕАЛИЗОВАНО**
   - [x] ✅ Динамический интервал (для малого количества - максимально отдалить, для большого - минимум 10 минут) - **РЕАЛИЗОВАНО**
   - [x] ✅ Детерминированный джиттер - **РЕАЛИЗОВАНО**
   - [x] ✅ Улучшенный анти-оверлап (поиск в обе стороны) - **РЕАЛИЗОВАНО**
   - [ ] ❌ DB-ограничения (partial unique index) - **НЕ РЕАЛИЗОВАНО**
   - [ ] ⚠️ Warning для ручных пересекающихся времён - **ТРЕБУЕТ ПРОВЕРКИ**

2. **Приоритет 2 (важно):** Удаление пользователя

   - [ ] ❌ Схема БД (поля + каскады) - **НЕ РЕАЛИЗОВАНО**
   - [x] ⚠️ 2-фазное удаление - **ЧАСТИЧНО** (Фаза A реализована, Фаза B нет)
   - [ ] ❌ Защита от пушей - **НЕ РЕАЛИЗОВАНО**
   - [ ] ❌ Grace-period - **НЕ РЕАЛИЗОВАНО** (нет API восстановления)

3. **Приоритет 3 (желательно):** Восстановление аккаунта
   - [ ] ❌ API восстановления - **НЕ РЕАЛИЗОВАНО**
   - [ ] ❌ Логика восстановления - **НЕ РЕАЛИЗОВАНО**

---

## 🔧 Технические детали

### Миграции БД:

1. **Добавление полей для удаления:** ❌ **НЕ РЕАЛИЗОВАНО**

   - `users.deletion_requested_at`, `users.deleted_at`
   - `payments.anonymized_at`
   - `subscription_events.anonymized_at`

2. **Каскадное удаление:** ❌ **НЕ РЕАЛИЗОВАНО**

   - Добавить `ON DELETE CASCADE` для всех user-owned таблиц
   - Добавить `ON DELETE SET NULL` для финансовых и аудит-таблиц

3. **Partial unique index:** ❌ **НЕ РЕАЛИЗОВАНО**
   - `idx_notification_slots_user_scheduled_unique` для предотвращения дублей
   - Создать индекс: `CREATE UNIQUE INDEX idx_notification_slots_user_scheduled_unique ON notification_slots (user_id, scheduled_at) WHERE status IN ('planned', 'queued');`
   - **ВАЖНО:** Перед созданием индекса нужно дедуплицировать существующие дубли (см. шаг "почистить мусор" выше)

### BullMQ очереди:

- [x] ✅ Добавить очередь `user-deletion` - **РЕАЛИЗОВАНО** (`server/application/users/queues/userDeletion.queue.ts`)
- [ ] ❌ Добавить worker для обработки удаления - **НЕ РЕАЛИЗОВАНО**
- [ ] ❌ Зарегистрировать `user-deletion-sweeper` в планировщике (cron ежедневно в 00:00 UTC) - **НЕ РЕАЛИЗОВАНО**

### Тесты:

**Юнит-тесты:**

- `generateSlotTimes()` - разные сценарии:
  - Включение утром (полный день)
  - Включение вечером (частичный сегодня + полный завтра)
  - Малое количество уведомлений (равномерное распределение)
  - Большое количество уведомлений (интервал 10 минут)
  - Ручные времена (не сдвигаются)
- `preventSimultaneousNotifications()` - поиск в обе стороны
- `generateDeterministicJitter()` - детерминированность

**Интеграционные тесты:**

- Удаление пользователя (2-фазное)
- Grace-period восстановление
- Обезличивание финансовых данных

**E2E тесты:**

- Сценарий: включил уведомления в 18:00, 5/день → проверка распределения
- Сценарий: большое количество уведомлений → нет "кучи в 22:30"
- Сценарий: удаление аккаунта → пуши не приходят

---

## 📝 Важные замечания по реализации

### Изменения в сигнатурах функций:

1. **`generateSlotTimes()`** - добавить параметр `userId: number`

   - Обновить все вызовы в `global-orchestration.service.ts`
   - Обновить вызовы в `scheduler.service.ts` (если есть)

2. **`regenerateSlotsForSourceInternal()`** - передавать `userId` в `generateSlotTimes()`

### Порядок реализации (рекомендуемый):

1. **День 1-2:** Исправление генерации слотов

   - Распределение по дням
   - Равномерное распределение внутри дня
   - Динамический интервал
   - Детерминированный джиттер
   - DB-ограничения

2. **День 3:** Улучшенный анти-оверлап

   - Поиск в обе стороны
   - Обработка ручных времён

3. **День 4-5:** Удаление пользователя

   - Миграции БД
   - 2-фазное удаление
   - Защита от пушей
   - Grace-period

4. **День 6:** Тестирование и фиксы
