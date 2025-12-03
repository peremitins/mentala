# Анализ и техническое задание: AI Buffer Pool для генерации уведомлений

## 📋 Оглавление

1. [Анализ текущей ситуации](#анализ-текущей-ситуации)
2. [Анализ предложения: Buffer Pool (50 текстов)](#анализ-предложения-buffer-pool)
3. [Плюсы и минусы подхода](#плюсы-и-минусы-подхода)
4. [Оптимальное количество текстов](#оптимальное-количество-текстов)
5. [Техническое задание](#техническое-задание)
   - [1. Изменение количества генерируемых текстов](#1-изменение-количества-генерируемых-текстов)
   - [2. Отслеживание отправленных текстов](#2-отслеживание-отправленных-текстов)
   - [3. Защита от ошибок при генерации](#3-защита-от-ошибок-при-генерации)
   - [4. Автоматическое пополнение пула](#4-автоматическое-пополнение-пула)
     - [4.4. Защита от конкурентных операций догенерации](#44-защита-от-конкурентных-операций-догенерации)
   - [5. Перегенерация при изменении настроек](#5-перегенерация-при-изменении-настроек)
   - [6. Предотвращение повторений](#6-предотвращение-повторений)
6. [Архитектура решения](#архитектура-решения)

---

## Анализ текущей ситуации

### Текущая реализация

- **Количество текстов**: 50 текстов по умолчанию (параметр `count`, настраивается через `AI_NOTIFICATIONS_DEFAULT_COUNT`)
- **Частота генерации**: При создании/изменении настроек уведомлений
- **Хранение**: Таблица `ai_generated_notification_texts` в поле `texts` (JSON массив)
- **Использование**: Случайный выбор из пула при создании слотов
- **Отслеживание**: Только в рамках одной генерации слотов (in-memory Set)

### Проблемы текущего подхода

1. ✅ **Исправлено**: Увеличено до 50 текстов, хватает на 10-14 дней (при 3-5 уведомлениях в день)
2. ❌ **Повторения**: После исчерпания пула тексты повторяются, теряется ощущение "живости"
3. ❌ **Нет автоматической догенерации**: Нужно вручную изменять настройки для новой генерации
4. ❌ **Нет отслеживания отправленных**: Тексты могут повторяться между разными генерациями слотов
5. ❌ **Риск ошибок**: Ежедневная генерация увеличивает риск отказа API в критический момент

---

## Анализ предложения: Buffer Pool

### Суть предложения

Генерировать сразу большую пачку текстов (например, 50), которая будет использоваться постепенно, с автоматическим пополнением при приближении к концу.

### Рекомендация из анализа

**"AI Buffer Pool"** — оптимальная модель, которая сочетает:

- ✅ Ощущение новизны для пользователя
- ✅ Низкую стоимость генерации
- ✅ Надежность (нет ежедневных запросов)
- ✅ Масштабируемость

---

## Плюсы и минусы подхода

### ✅ Плюсы

#### 1. Экономическая эффективность

- **Разовая генерация** вместо ежедневной = меньше запросов к API
- **Пачковая генерация** может быть дешевле (лучшая эффективность API)
- **Предсказуемые затраты**: можно точно рассчитать стоимость на пользователя

**Расчет стоимости (для примера):**

- 50 текстов × 1k токенов = 50k токенов
- gpt-4o-mini: ~$0.15 / 1M tokens
- Стоимость одной генерации: ~$0.0075
- На 2 недели (14 дней × 3 уведомления = 42 текста) = хватает с запасом

#### 2. Надежность

- ❌ **Минус ежедневных запросов**: Если запрос не сработает в конкретный день, пользователь остается без новых текстов
- ✅ **Запас прочности**: Большой пул = больше времени для решения проблем
- ✅ **Fallback безопасность**: При ошибке генерации есть запас текстов

#### 3. UX и терапевтическая эффективность

- ✅ **Ощущение новизны**: Больше разнообразия текстов
- ✅ **Нет "застрявшего бота"**: Пользователь не видит одни и те же тексты часто
- ✅ **Стабильность**: Нет "плохих" дней с неудачными генерациями

#### 4. Масштабируемость

- ✅ **Предсказуемая нагрузка**: Генерация происходит реже, нагрузка на API распределена
- ✅ **Легче мониторить**: Меньше точек отказа
- ✅ **Масштабирование**: Для 1000 пользователей = ~100 генераций раз в 2 недели, а не 3000 ежедневно

#### 5. Управление качеством

- ✅ **Единая генерация = единое качество**: Все тексты из одной генерации более консистентны
- ✅ **Легче контролировать**: Можно проверить качество пачки перед использованием

### ❌ Минусы

#### 1. Сложность реализации

- ❌ **Отслеживание использованных текстов**: Нужна система меток отправленных текстов
- ❌ **Логика пополнения**: Когда и как генерировать новую пачку
- ❌ **Хранение метаданных**: Информация о том, какие тексты уже отправлены

#### 2. Риск однородности

- ❌ **Одна генерация = один стиль**: Все 50 текстов будут из одной генерации, могут быть похожи
- ✅ **Решение**: Генерировать пачки с перекрытием, миксовать тексты из разных генераций

#### 3. Управление состоянием

- ❌ **Сложнее откаты**: Если нужно изменить настройки, придется регенерировать весь пул
- ❌ **Консистентность**: Нужно следить, чтобы хеш конфигурации совпадал

#### 4. Начальная задержка

- ❌ **Первый запуск**: Генерация 50 текстов может занять больше времени, чем 5-15
- ✅ **Решение**: Асинхронная генерация, использование старых текстов пока генерируются новые

---

## Оптимальное количество текстов

### Расчет на основе использования

**Предположения:**

- Максимально 5 уведомлений в день на одну привычку/терапию
- Оптимальный период без повторов: 10-14 дней
- Запас на ошибки и задержки: 20-30% дополнительно

**Расчет:**

```
5 уведомлений/день × 14 дней = 70 текстов (базовый минимум)
+ 20% запас = 84 текста
+ Округление = 80-90 текстов
```

### Рекомендация: **50-60 текстов**

**Почему не больше:**

- Больше токенов на одну генерацию = выше риск при ошибке
- Тексты могут устаревать (если меняются настройки пользователя)
- Сложнее управлять консистентностью

**Почему не меньше:**

- Меньше 50 = недостаточно для 10 дней при 5 уведомлениях
- Чаще придется генерировать = больше запросов

### Финальная рекомендация

**Оптимальное количество: 50 текстов**

**Обоснование:**

- ✅ Хватает на 10-14 дней (при 3-5 уведомлениях/день)
- ✅ Размер пачки управляемый (50k токенов)
- ✅ Баланс между новизной и стоимостью
- ✅ Соответствует рекомендации из анализа ("AI buffer pool")

---

## Техническое задание

### 1. Изменение количества генерируемых текстов

#### 1.1. Обновить дефолтное значение

**Файл**: `server/application/notifications/ai-generation.service.ts`

**✅ Реализовано:**

```typescript
const DEFAULT_TEXT_COUNT =
  Number(process.env.AI_NOTIFICATIONS_DEFAULT_COUNT) || 50;
const count = params.count || DEFAULT_TEXT_COUNT;
```

**✅ Выполнено:**

- ✅ Добавлена константа `DEFAULT_TEXT_COUNT = 50` в начало файла
- ✅ Добавлен конфиг для настройки через env: `AI_NOTIFICATIONS_DEFAULT_COUNT`
- ✅ Динамический расчет `maxOutputTokens`: `count * 200 + 5000` (для гарантии получения всех 50 текстов)
- ✅ Усилен системный промпт с требованием точного количества текстов
- ✅ Добавлен retry механизм `generateWithRetry()` с exponential backoff для надежности

---

### 2. Отслеживание отправленных текстов

#### 2.1. Расширение схемы БД

**Файл**: `server/infrastructure/db/schema.ts`

**Добавить таблицу `ai_notification_text_usage`:**

```sql
CREATE TABLE ai_notification_text_usage (
  id SERIAL PRIMARY KEY,
  ai_text_id INTEGER NOT NULL REFERENCES ai_generated_notification_texts(id) ON DELETE CASCADE,
  slot_id TEXT NOT NULL REFERENCES notification_slots(id) ON DELETE CASCADE,
  text_index INTEGER NOT NULL, -- Индекс текста в массиве texts
  text_hash TEXT NOT NULL, -- Хеш текста для проверки уникальности
  sent_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),

  -- Индексы для быстрого поиска
  CONSTRAINT fk_ai_text FOREIGN KEY (ai_text_id) REFERENCES ai_generated_notification_texts(id),
  CONSTRAINT fk_slot FOREIGN KEY (slot_id) REFERENCES notification_slots(id),
  UNIQUE(ai_text_id, text_index, slot_id) -- Один текст не может быть использован дважды в одном слоте
);

CREATE INDEX idx_usage_ai_text ON ai_notification_text_usage(ai_text_id);
CREATE INDEX idx_usage_sent_at ON ai_notification_text_usage(sent_at);
CREATE INDEX idx_usage_text_hash ON ai_notification_text_usage(text_hash);
```

**Альтернативный подход (без отдельной таблицы):**
Добавить поле `usedTextIndices` в таблицу `ai_generated_notification_texts`:

```typescript
usedTextIndices: jsonb('used_text_indices').$type<number[]>().default([]), // Индексы использованных текстов
lastUsedAt: timestamp('last_used_at', { withTimezone: true }), // Когда последний раз использовался
```

**Рекомендация: Отдельная таблица**

- ✅ Чище архитектура (разделение ответственности)
- ✅ Легче анализировать историю использования
- ✅ Не засоряет основную таблицу

#### 2.2. Сохранение информации об использовании

**Файл**: `server/application/notifications/scheduler.service.ts`

**Изменения:**

1. При выборе AI-текста для слота:

   - Вычислять хеш текста
   - Сохранять в `ai_notification_text_usage`
   - Проверять использованные тексты перед выбором

2. При создании слота:
   - Сохранять `textIndex` в метаданных слота (payload.meta)
   - Сохранять `aiTextId` в метаданных слота

#### 2.3. Проверка уже отправленных текстов

**Новая функция**: `getUsedTextIndices()`

```typescript
async function getUsedTextIndices(
  aiTextId: number,
  excludeAfterDate?: Date
): Promise<Set<number>> {
  // Возвращает Set с индексами уже использованных текстов
  // excludeAfterDate - исключить тексты, использованные после даты (для обновления пула)
}
```

---

### 3. Защита от ошибок при генерации

#### 3.1. Retry механизм с exponential backoff

**Файл**: `server/application/notifications/ai-generation.service.ts`

**Реализовать функцию `generateWithRetry()`:**

```typescript
interface RetryConfig {
  maxRetries: number; // Максимум 3 попытки
  initialDelay: number; // 1000ms
  maxDelay: number; // 30000ms (30 секунд)
  exponentialBase: number; // 2
  retryableErrors: string[]; // ['rate_limit', 'timeout', 'server_error']
}

async function generateWithRetry(
  params: GenerateNotificationTextsParams,
  config: RetryConfig = DEFAULT_RETRY_CONFIG
): Promise<GenerationResult> {
  let lastError: Error | null = null;
  let delay = config.initialDelay;

  for (let attempt = 0; attempt <= config.maxRetries; attempt++) {
    try {
      // Основная логика генерации
      return await generateNotificationTextsInternal(params);
    } catch (error) {
      lastError = error as Error;

      // Проверка, стоит ли повторять
      if (!isRetryableError(error, config.retryableErrors)) {
        throw error; // Неретрируемая ошибка - выбрасываем сразу
      }

      // Проверка лимита попыток
      if (attempt === config.maxRetries) {
        throw new Error(
          `Failed to generate texts after ${config.maxRetries + 1} attempts: ${lastError.message}`
        );
      }

      // Логирование
      console.warn(
        `[AI Generation] Attempt ${attempt + 1}/${config.maxRetries + 1} failed, retrying in ${delay}ms:`,
        error
      );

      // Задержка перед следующей попыткой
      await sleep(delay);
      delay = Math.min(delay * config.exponentialBase, config.maxDelay);
    }
  }

  throw lastError!;
}
```

**Дополнительные проверки:**

1. **Валидация бюджета**: Проверять лимит `config.llm.limits.dailyUSD` перед генерацией
2. **Мониторинг стоимости**: Логировать стоимость каждой генерации
3. **Circuit Breaker**: Если 3 попытки подряд неудачны - блокировать генерацию на час

#### 3.2. Обработка ошибок

**Стратегии:**

- ✅ **Retry**: Для временных ошибок (429, 500-599, timeout)
- ✅ **Fallback**: Использовать старые тексты, если генерация не удалась
- ✅ **Graceful degradation**: Уменьшить количество текстов (50 → 30 → 15)
- ❌ **Не ретраить**: Ошибки валидации, неверные параметры, превышение бюджета

---

### 4. Автоматическое пополнение пула (догенерация)

#### 4.1. Проверка остатка текстов

**Новая функция**: `checkAndRefillTextPool()`

```typescript
interface PoolStatus {
  totalTexts: number; // Всего текстов в пуле
  usedTexts: number; // Использовано текстов
  availableTexts: number; // Доступно текстов
  daysRemaining: number; // Дней осталось (при текущем расходе)
  needsRefill: boolean; // Нужно ли пополнение
}

async function checkAndRefillTextPool(
  userId: number,
  preferenceId: string,
  configHash: string
): Promise<PoolStatus> {
  // 1. Загрузить текущий пул текстов
  const aiTexts = await loadAiGeneratedTexts(userId, preferenceId, configHash);
  if (!aiTexts) {
    throw new Error('Text pool not found');
  }

  // 2. Определить использованные тексты
  const usedIndices = await getUsedTextIndices(/* ... */);
  const availableTexts = aiTexts.length - usedIndices.size;

  // 3. Рассчитать расход (уведомлений в день)
  const preference = await loadPreference(preferenceId);
  const textsPerDay = preference.timesPerDay || 3;

  // 4. Рассчитать дней осталось
  const daysRemaining = Math.floor(availableTexts / textsPerDay);

  // 5. Проверить, нужно ли пополнение (если осталось < 2 дней)
  const needsRefill = daysRemaining < 2;

  return {
    totalTexts: aiTexts.length,
    usedTexts: usedIndices.size,
    availableTexts,
    daysRemaining,
    needsRefill,
  };
}
```

#### 4.2. Триггеры для проверки

**Места проверки:**

1. **При создании слотов** (`regenerateSlotsForSource`):

   - Проверять остаток перед генерацией слотов
   - Если осталось < 2 дней - запустить догенерацию асинхронно

2. **Периодический воркер** (раз в час):

   - Проверять все активные preferences
   - Догенерировать тексты для тех, у кого осталось < 2 дней

3. **После отправки уведомления** (опционально):
   - Проверять остаток после каждого отправленного уведомления
   - Если осталось < 1 дня - срочно догенерировать

#### 4.3. Догенерация текстов

**Функция**: `refillTextPool()`

```typescript
async function refillTextPool(
  userId: number,
  preferenceId: string,
  kind: 'habits' | 'therapy',
  entityKey: string,
  currentTexts: string[],
  usedIndices: Set<number>
): Promise<GenerationResult> {
  // 1. Определить, сколько текстов нужно догенерировать
  const targetCount = 50; // Целевой размер пула
  const usedCount = usedIndices.size;
  const toGenerate = Math.max(
    0,
    targetCount - (currentTexts.length - usedCount)
  );

  if (toGenerate === 0) {
    console.log('[AI Generation] Pool is full, no need to refill');
    return { texts: [], provider: '', model: '', tokensUsed: 0, costUsd: 0 };
  }

  // 2. Загрузить параметры для генерации
  const params = await prepareGenerationParams(
    userId,
    preferenceId,
    kind,
    entityKey
  );

  // 3. Сгенерировать новые тексты
  const result = await generateWithRetry({
    ...params,
    count: toGenerate,
  });

  // 4. Объединить с существующими (исключая использованные)
  const unusedTexts = currentTexts.filter(
    (_, index) => !usedIndices.has(index)
  );
  const mergedTexts = [...unusedTexts, ...result.texts];

  // 5. Обновить запись в БД
  await updateAiGeneratedTexts(userId, preferenceId, configHash, mergedTexts);

  return result;
}
```

**Важно:**

- ✅ Догенерация должна быть **асинхронной** (не блокировать создание слотов)
- ✅ При ошибке догенерации использовать существующие тексты
- ✅ Логировать все попытки догенерации

#### 4.4. Защита от конкурентных операций догенерации

**Проблема: Race Condition**

Существует риск одновременного запуска догенерации несколькими процессами:

1. **Воркер** (раз в час) проверяет все preferences и может запустить догенерацию
2. **При создании слотов** (`regenerateSlotsForSource`) также может запуститься догенерация
3. **После отправки уведомления** (опционально) может быть проверка и догенерация

**Возможные проблемы:**

- ❌ Двойная догенерация → лишние расходы на API
- ❌ Перезапись данных → потеря части текстов
- ❌ Нарушение консистентности данных

**Решения:**

**Вариант 1: Распределение ответственности (рекомендуется)**

**Принцип**: Догенерация запускается только в одном месте - в периодическом воркере.

- ✅ При создании слотов (`regenerateSlotsForSource`) - только проверка, без запуска догенерации
- ✅ Периодический воркер - единственный источник догенерации
- ✅ Простая логика, легко отслеживать

**Реализация:**

```typescript
// В regenerateSlotsForSource - только проверка и логирование
const poolStatus = await checkAndRefillTextPool(...);
if (poolStatus.needsRefill) {
  console.warn(
    `[Scheduler] Pool needs refill (${poolStatus.daysRemaining} days left), but skipping auto-refill. Worker will handle it.`
  );
  // НЕ запускаем догенерацию здесь
}

// В воркере - запускаем догенерацию
if (poolStatus.needsRefill) {
  await refillTextPool(...);
}
```

**Вариант 2: Optimistic locking с проверкой версии**

**Принцип**: Использовать проверку текущего состояния перед обновлением.

**Реализация:**

```typescript
async function refillTextPoolWithLock(
  userId: number,
  preferenceId: string,
  configHash: string,
  currentTexts: string[],
  usedIndices: Set<number>
): Promise<GenerationResult> {
  // 1. Блокировка на уровне БД (SELECT FOR UPDATE)
  const [currentRecord] = await db
    .select()
    .from(aiGeneratedNotificationTexts)
    .where(
      and(
        eq(aiGeneratedNotificationTexts.userId, userId),
        eq(aiGeneratedNotificationTexts.preferenceId, preferenceId),
        eq(aiGeneratedNotificationTexts.generationConfigHash, configHash)
      )
    )
    .for('update'); // Блокируем строку для обновления

  if (!currentRecord) {
    throw new Error('Text pool not found');
  }

  // 2. Проверяем, не обновился ли пул за время генерации
  const currentTextsFromDb = currentRecord.texts as string[];
  if (currentTextsFromDb.length !== currentTexts.length) {
    console.warn(
      `[AI Generation] Pool was updated by another process, skipping refill. Current: ${currentTextsFromDb.length}, Expected: ${currentTexts.length}`
    );
    return { texts: [], provider: '', model: '', tokensUsed: 0, costUsd: 0 };
  }

  // 3. Пересчитываем, сколько нужно догенерировать
  const usedIndicesNow = await getUsedTextIndices(currentRecord.id);
  const availableTexts = currentTextsFromDb.length - usedIndicesNow.size;
  const targetCount = 50;
  const toGenerate = Math.max(0, targetCount - availableTexts);

  if (toGenerate === 0) {
    console.log('[AI Generation] Pool is full, no need to refill');
    return { texts: [], provider: '', model: '', tokensUsed: 0, costUsd: 0 };
  }

  // 4. Генерируем новые тексты
  const result = await generateWithRetry({
    ...params,
    count: toGenerate,
  });

  // 5. Обновляем с проверкой версии (WHERE texts = currentTextsFromDb)
  const unusedTexts = currentTextsFromDb.filter(
    (_, index) => !usedIndicesNow.has(index)
  );
  const mergedTexts = [...unusedTexts, ...result.texts];

  // 6. Обновление с проверкой, что данные не изменились
  const updateResult = await db
    .update(aiGeneratedNotificationTexts)
    .set({
      texts: mergedTexts,
      updatedAt: sql`NOW()`,
    })
    .where(
      and(
        eq(aiGeneratedNotificationTexts.id, currentRecord.id),
        // Проверяем, что тексты не изменились с момента блокировки
        eq(
          aiGeneratedNotificationTexts.texts,
          JSON.stringify(currentTextsFromDb)
        )
      )
    )
    .returning();

  if (updateResult.length === 0) {
    // Кто-то другой обновил данные - пропускаем
    console.warn(
      '[AI Generation] Pool was updated by another process during generation, skipping update'
    );
    return { texts: [], provider: '', model: '', tokensUsed: 0, costUsd: 0 };
  }

  return result;
}
```

**Вариант 3: Использование флага "generating" в БД**

**Принцип**: Добавить поле `isGenerating` в таблицу `ai_generated_notification_texts`.

**Реализация:**

```typescript
// Добавить в схему:
isGenerating: boolean('is_generating').default(false).notNull(),

// В refillTextPool:
async function refillTextPoolWithFlag(...) {
  // 1. Пытаемся установить флаг генерации
  const lockResult = await db
    .update(aiGeneratedNotificationTexts)
    .set({ isGenerating: true })
    .where(
      and(
        eq(aiGeneratedNotificationTexts.userId, userId),
        eq(aiGeneratedNotificationTexts.preferenceId, preferenceId),
        eq(aiGeneratedNotificationTexts.generationConfigHash, configHash),
        eq(aiGeneratedNotificationTexts.isGenerating, false) // Только если не генерируется
      )
    )
    .returning();

  if (lockResult.length === 0) {
    // Кто-то другой уже начал генерацию
    console.log('[AI Generation] Pool is being refilled by another process, skipping');
    return { texts: [], provider: '', model: '', tokensUsed: 0, costUsd: 0 };
  }

  try {
    // 2. Выполняем генерацию
    const result = await generateWithRetry(...);

    // 3. Обновляем тексты и сбрасываем флаг
    await db
      .update(aiGeneratedNotificationTexts)
      .set({
        texts: mergedTexts,
        isGenerating: false,
        updatedAt: sql`NOW()`,
      })
      .where(eq(aiGeneratedNotificationTexts.id, lockResult[0].id));

    return result;
  } catch (error) {
    // 4. При ошибке сбрасываем флаг
    await db
      .update(aiGeneratedNotificationTexts)
      .set({ isGenerating: false })
      .where(eq(aiGeneratedNotificationTexts.id, lockResult[0].id));
    throw error;
  }
}
```

**Рекомендация:**

**Использовать Вариант 1 (Распределение ответственности)** + **Вариант 2 (Optimistic locking)** как дополнительную защиту.

**Причины:**

- ✅ Простота реализации
- ✅ Низкие накладные расходы
- ✅ Надежная защита от race condition
- ✅ Легко отлаживать и мониторить

**Итоговая стратегия:**

1. **В `regenerateSlotsForSource`**: только проверка статуса пула, логирование предупреждения, без запуска догенерации
2. **В периодическом воркере**: запуск догенерации для всех preferences, которым это нужно
3. **В `refillTextPool`**: использовать optimistic locking с проверкой версии данных перед обновлением

---

### 5. Перегенерация при изменении настроек

#### 5.1. Триггеры полной перегенерации

**ВАЖНО**: При изменении любых настроек, влияющих на генерацию текстов, необходимо полностью перегенерировать все 50 текстов.

**Изменения, требующие перегенерации:**

1. **Глобальные настройки пользователя (userPreferences)**:

   - ✅ Изменение `tone` (delicate, neutral, uplifting, resolute, demanding)
   - ✅ Изменение `addressing` (formal, informal)

2. **Настройки уведомлений (notificationPreferences)**:

   - ✅ Изменение `directness` (soft, moderate, hard)
   - ✅ Изменение `subtype` (для шаблонов: reminder, informational, motivational, mixed)

3. **Промпт или описание сущности**:

   - ✅ Изменение названия привычки/терапии (`entityName`)
   - ✅ Изменение описания привычки/терапии (`entityDescription`)

4. **Режим генерации**:
   - ✅ Переключение `textSource` между 'ai' и 'hybrid' (требует перегенерации)

**Как это работает:**

- Все перечисленные параметры входят в `generationConfigHash`
- При изменении любого из них хеш изменяется
- Изменение хеша = триггер для полной перегенерации всех 50 текстов

#### 5.2. Очистка старых данных при перегенерации

**Файл**: `server/application/notifications/ai-generation.service.ts`

**При перегенерации необходимо:**

1. **Удалить старые тексты с другим хешем**:

   ```typescript
   async function cleanupOldTexts(
     userId: number,
     preferenceId: string,
     newConfigHash: string
   ): Promise<void> {
     // 1. Найти все записи с текстами для этой preference с другим хешем
     const oldTexts = await db
       .select({ id: aiGeneratedNotificationTexts.id })
       .from(aiGeneratedNotificationTexts)
       .where(
         and(
           eq(aiGeneratedNotificationTexts.userId, userId),
           eq(aiGeneratedNotificationTexts.preferenceId, preferenceId),
           sql`${aiGeneratedNotificationTexts.generationConfigHash} != ${newConfigHash}`
         )
       );

     // 2. Удалить записи об использовании старых текстов
     for (const oldText of oldTexts) {
       await db
         .delete(aiNotificationTextUsage)
         .where(eq(aiNotificationTextUsage.aiTextId, oldText.id));
     }

     // 3. Удалить старые тексты
     await db
       .delete(aiGeneratedNotificationTexts)
       .where(
         and(
           eq(aiGeneratedNotificationTexts.userId, userId),
           eq(aiGeneratedNotificationTexts.preferenceId, preferenceId),
           sql`${aiGeneratedNotificationTexts.generationConfigHash} != ${newConfigHash}`
         )
       );

     console.log(
       `[AI Generation] Cleaned up ${oldTexts.length} old text pool(s) with different hash`
     );
   }
   ```

2. **Интеграция в функцию генерации**:

   ```typescript
   export async function generateNotificationTexts(
     params: GenerateNotificationTextsParams
   ): Promise<GenerationResult> {
     // ... существующий код ...

     // ВАЖНО: После вычисления configHash, но ДО генерации
     // Удаляем старые тексты с другим хешем
     await cleanupOldTexts(params.userId, params.preferenceId, configHash);

     // ... продолжение генерации ...
   }
   ```

#### 5.3. Обработка в API endpoint

**Файл**: `server/api/notifications/prefs/[kind].put.ts`

**Текущая логика уже содержит проверку изменения хеша:**

```typescript
// Вычисляем новый хеш
const newConfigHash = computeGenerationConfigHash({
  entityName,
  entityDescription,
  tone,
  addressing,
  directness: nextDirectness,
  subtype: nextSubtypeForHash,
  textSource,
  kind,
});

// Вычисляем старый хеш
const oldConfigHash = computeGenerationConfigHash({
  // ... старые значения ...
});

// Проверяем изменение
const hashChanged = oldConfigHash !== newConfigHash;
const needsAiGeneration =
  hashChanged || !oldConfigHash || nameChanged || descriptionChanged;

if (needsAiGeneration) {
  // ВАЖНО: При вызове generateNotificationTexts() внутри уже происходит:
  // 1. Проверка существующих текстов с новым хешем
  // 2. Если текстов нет - генерация новых
  // 3. Очистка старых текстов (нужно добавить)

  await generateNotificationTexts({
    userId,
    preferenceId: existing.id,
    kind,
    entityKey: finalEntityKey,
    directness: nextDirectness,
    subtype: nextSubtypeForHash,
    textSource,
    count: 50, // ВАЖНО: Всегда 50 текстов при перегенерации
  });
}
```

**Что нужно добавить:**

1. ✅ Явное указание `count: 50` при перегенерации
2. ✅ Очистка старых текстов перед генерацией новых
3. ✅ Удаление записей об использовании старых текстов

#### 5.4. Регенерация слотов после перегенерации текстов

**ВАЖНО**: После перегенерации всех 50 текстов необходимо:

1. **Удалить все старые слоты** с устаревшими текстами
2. **Создать новые слоты** с новыми текстами

**Текущая логика:**

- В `server/api/notifications/prefs/[kind].put.ts` уже есть вызов `regenerateSlotsForSource()` после генерации текстов
- Это корректно, но нужно убедиться, что старые слоты удаляются

**Дополнить функцию `regenerateSlotsForSource()`:**

```typescript
// При регенерации слотов для источника с новым configHash
// 1. Удалить все старые слоты для этого preferenceId
// 2. Создать новые слоты с новыми текстами
```

#### 5.5. Примеры сценариев

**Сценарий 1: Изменение стиля (tone)**

```
1. Пользователь меняет tone: neutral → uplifting
2. Вычисляется новый configHash (отличается от старого)
3. hashChanged = true
4. Запускается generateNotificationTexts() с count: 50
5. Внутри функции:
   - Удаляются старые тексты с другим хешем
   - Удаляются записи об использовании старых текстов
   - Генерируются новые 50 текстов
6. После генерации регенерируются слоты
```

**Сценарий 2: Изменение названия привычки**

```
1. Пользователь меняет название привычки: "Пить воду" → "Гидратация"
2. entityName изменяется
3. Вычисляется новый configHash (отличается от старого)
4. nameChanged = true
5. Запускается generateNotificationTexts() с count: 50
6. Все старые тексты удаляются, генерируются новые
```

**Сценарий 3: Изменение промпта/описания**

```
1. Пользователь меняет описание привычки
2. entityDescription изменяется
3. Вычисляется новый configHash
4. descriptionChanged = true
5. Запускается полная перегенерация всех 50 текстов
```

---

### 6. Предотвращение повторений

#### 5.1. Проверка при выборе текста

**В `scheduler.service.ts` при выборе AI-текста:**

```typescript
async function selectUnusedAiText(
  aiTexts: string[],
  aiTextId: number,
  usedIndices: Set<number>
): Promise<{ text: string; index: number } | null> {
  // 1. Получить список доступных индексов
  const availableIndices = aiTexts
    .map((_, index) => index)
    .filter((index) => !usedIndices.has(index));

  if (availableIndices.length === 0) {
    // Все тексты использованы - нужно догенерировать
    return null;
  }

  // 2. Случайный выбор из доступных
  const randomIndex =
    availableIndices[Math.floor(Math.random() * availableIndices.length)];

  return {
    text: aiTexts[randomIndex],
    index: randomIndex,
  };
}
```

#### 5.2. Маркировка отправленных текстов

**При создании слота:**

```typescript
// После выбора текста и создания слота
await db.insert(aiNotificationTextUsage).values({
  aiTextId: aiTextId,
  slotId: slot.id,
  textIndex: selectedText.index,
  textHash: hashText(selectedText.text),
  sentAt: new Date(),
});
```

---

## Архитектура решения

### Схема потока данных

```
┌─────────────────────────────────────────────────────────────┐
│ 1. Создание/изменение настройки уведомлений                 │
│    - Проверка изменения configHash                          │
│    - Если хеш изменился → триггер перегенерации             │
└─────────────────┬───────────────────────────────────────────┘
                  │
                  ▼
┌─────────────────────────────────────────────────────────────┐
│ 2. Перегенерация (если настройки изменились)                │
│    - cleanupOldTexts() - удаление старых текстов            │
│    - Удаление записей об использовании старых текстов       │
└─────────────────┬───────────────────────────────────────────┘
                  │
                  ▼
┌─────────────────────────────────────────────────────────────┐
│ 3. Генерация начального/нового пула (50 текстов)            │
│    - generateNotificationTexts()                            │
│    - generateWithRetry() [3 попытки, exponential backoff]   │
│    - Сохранение в ai_generated_notification_texts           │
└─────────────────┬───────────────────────────────────────────┘
                  │
                  ▼
┌─────────────────────────────────────────────────────────────┐
│ 4. Создание слотов уведомлений                              │
│    - regenerateSlotsForSource()                             │
│    - Удаление старых слотов (если была перегенерация)       │
│    - Проверка остатка текстов: checkAndRefillTextPool()     │
│    - Выбор неиспользованных текстов: selectUnusedAiText()   │
│    - Создание слотов с метаданными (textIndex, aiTextId)    │
└─────────────────┬───────────────────────────────────────────┘
                  │
                  ▼
┌─────────────────────────────────────────────────────────────┐
│ 5. Отправка уведомления                                     │
│    - processDueSlots()                                      │
│    - Маркировка текста как использованного                  │
│    - Сохранение в ai_notification_text_usage                │
└─────────────────┬───────────────────────────────────────────┘
                  │
                  ▼
┌─────────────────────────────────────────────────────────────┐
│ 6. Периодическая проверка (воркер, раз в час)              │
│    - checkAndRefillTextPool() для всех активных preferences │
│    - Если осталось < 2 дней → refillTextPool()              │
└─────────────────────────────────────────────────────────────┘
```

### Структура данных

**Таблица `ai_generated_notification_texts`:**

- `id` - ID записи
- `texts` - JSON массив текстов (до 100 элементов)
- `generationConfigHash` - Хеш конфигурации
- `createdAt`, `updatedAt` - Временные метки

**Таблица `ai_notification_text_usage` (новая):**

- `id` - ID записи
- `ai_text_id` - FK к ai_generated_notification_texts
- `slot_id` - FK к notification_slots
- `text_index` - Индекс текста в массиве
- `text_hash` - Хеш текста
- `sent_at` - Когда был отправлен

**Слот `notification_slots`:**

- `payload.meta.textIndex` - Индекс использованного текста
- `payload.meta.aiTextId` - ID записи с текстами

---

## План реализации

### Этап 1: Базовая функциональность (1-2 дня)

1. ✅ Увеличить дефолтное количество текстов до 50
2. ✅ Создать миграцию для таблицы `ai_notification_text_usage`
3. ✅ Реализовать функцию `getUsedTextIndices()`
4. ✅ Обновить логику выбора текстов в `scheduler.service.ts`

### Этап 2: Защита от ошибок (1 день)

1. ✅ Реализовать `generateWithRetry()` с exponential backoff
2. ✅ Добавить валидацию бюджета перед генерацией
3. ✅ Добавить логирование стоимости

### Этап 3: Автоматическое пополнение (2 дня)

1. ✅ Реализовать `checkAndRefillTextPool()`
2. ✅ Реализовать `refillTextPool()` с защитой от race condition
3. ✅ Интегрировать проверку в `regenerateSlotsForSource()` (только проверка, без запуска догенерации)
4. ✅ Создать периодический воркер для проверки и догенерации
5. ✅ Реализовать optimistic locking при обновлении пула текстов

### Этап 4: Перегенерация при изменении настроек (1 день)

1. ✅ Реализовать функцию `cleanupOldTexts()` для удаления старых текстов
2. ✅ Добавить очистку записей об использовании старых текстов
3. ✅ Интегрировать очистку в `generateNotificationTexts()`
4. ✅ Убедиться, что при изменении настроек всегда генерируется 50 текстов
5. ✅ Обновить логику в `server/api/notifications/prefs/[kind].put.ts` для явного указания `count: 50`

### Этап 5: Тестирование и оптимизация (1 день)

1. ✅ Написать тесты для retry логики
2. ✅ Проверить производительность запросов
3. ✅ Настроить мониторинг и алерты

**Итого: 6-7 дней разработки**

---

## Метрики успеха

1. **Надежность**: < 1% ошибок генерации (после retry)
2. **Стоимость**: < $0.02 на пользователя в месяц
3. **UX**: Повторения текстов < 5% в течение 14 дней
4. **Производительность**: Генерация 50 текстов < 10 секунд

---

## Риски и митигация

| Риск                  | Вероятность | Влияние | Митигация                                                         |
| --------------------- | ----------- | ------- | ----------------------------------------------------------------- |
| Ошибка генерации пула | Средняя     | Высокое | Retry механизм, fallback на старые тексты                         |
| Превышение бюджета    | Низкая      | Высокое | Валидация перед генерацией, мониторинг                            |
| Дубликаты текстов     | Низкая      | Среднее | Хеширование, проверка уникальности                                |
| Производительность БД | Низкая      | Среднее | Индексы, оптимизация запросов                                     |
| Race condition при    | Средняя     | Высокое | Распределение ответственности (только воркер), optimistic locking |
| догенерации           |             |         |                                                                   |

---

## Заключение

Предложенный подход **"AI Buffer Pool"** оптимален для решения задач:

- ✅ Экономическая эффективность
- ✅ Надежность
- ✅ UX (ощущение новизны)
- ✅ Масштабируемость

**✅ РЕАЛИЗОВАНО: Подход реализован с количеством 50 текстов**

### Текущее состояние реализации

- ✅ Генерация 50 текстов по умолчанию
- ✅ Отслеживание отправленных текстов через таблицу `ai_notification_text_usage`
- ✅ Retry механизм с exponential backoff
- ✅ Автоматическое пополнение пула при приближении к концу
- ✅ Динамический расчет токенов: `count * 200 + 5000`
- ✅ Перегенерация при изменении настроек с очисткой старых данных
- ✅ Усиленный системный промпт с требованием точного количества текстов
