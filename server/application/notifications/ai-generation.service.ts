/**
 * Сервис для генерации AI-текстов уведомлений
 */

import {
  chatViaProvider,
  estimateCostUSD,
} from '@@/server/application/llm.service';
import { config } from '@@/server/config';
import { db } from '@@/server/infrastructure/db/client';
import {
  aiGeneratedNotificationTexts,
  aiNotificationTextUsage,
  habits,
  therapyTopicsCustom,
  userPreferences,
} from '@@/server/infrastructure/db/schema';
import { computeGenerationConfigHash } from '@@/server/utils/notification-ai-config-hash';
import { eq, and, or, sql, lte } from 'drizzle-orm';
import { createHash } from 'node:crypto';
import type {
  Tone,
  Addressing,
  Directness,
  HabitSubtype,
} from '@/shared/dto/notifications';

// Константы для генерации текстов уведомлений
const DEFAULT_TEXT_COUNT =
  Number(
    process.env.NUXT_AI_NOTIFICATIONS_DEFAULT_COUNT ||
      process.env.AI_NOTIFICATIONS_DEFAULT_COUNT
  ) || 50;

interface GenerateNotificationTextsParams {
  userId: number;
  preferenceId: string;
  kind: 'habits' | 'therapy';
  entityKey: string; // ID для кастомных сущностей, ключ шаблона для шаблонных
  directness: Directness;
  subtype?: HabitSubtype | null;
  textSource: 'ai' | 'hybrid'; // Только для AI-генерации (не может быть 'templates')
  count?: number; // количество текстов для генерации (по умолчанию 50)
  provider?: 'openai' | 'deepseek' | 'yandex';
  habitIntent?: 'quit' | 'build' | null; // Intent привычки: отказ (quit) или приобретение (build). Передается явно, не угадывается.
}

interface GenerationResult {
  texts: string[];
  provider: string;
  model: string;
  tokensUsed: number;
  costUsd: number;
}

/**
 * Fallback функция для определения intent по названию (только для обратной совместимости)
 * Используется только если intent не передан явно
 */
function inferHabitIntentFromName(name: string): 'quit' | 'build' {
  const nameLower = name.toLowerCase();
  if (
    nameLower.includes('отказ') ||
    nameLower.includes('меньше') ||
    nameLower.includes('бросить')
  ) {
    return 'quit';
  }
  return 'build'; // По умолчанию считаем приобретением
}

/**
 * Загружает AI-сгенерированные тексты из БД
 */
export async function loadAiGeneratedTexts(
  userId: number,
  preferenceId: string,
  configHash: string
): Promise<string[] | null> {
  const [existing] = await db
    .select()
    .from(aiGeneratedNotificationTexts)
    .where(
      and(
        eq(aiGeneratedNotificationTexts.userId, userId),
        eq(aiGeneratedNotificationTexts.preferenceId, preferenceId),
        eq(aiGeneratedNotificationTexts.generationConfigHash, configHash)
      )
    )
    .limit(1);

  if (existing && existing.texts) {
    return existing.texts as string[];
  }

  return null;
}

/**
 * Загружает AI-сгенерированные тексты вместе с ID записи
 * Используется для получения ID при отслеживании использования
 */
export async function loadAiGeneratedTextsWithId(
  userId: number,
  preferenceId: string,
  configHash: string
): Promise<{ id: number; texts: string[] } | null> {
  const [existing] = await db
    .select()
    .from(aiGeneratedNotificationTexts)
    .where(
      and(
        eq(aiGeneratedNotificationTexts.userId, userId),
        eq(aiGeneratedNotificationTexts.preferenceId, preferenceId),
        eq(aiGeneratedNotificationTexts.generationConfigHash, configHash)
      )
    )
    .limit(1);

  if (existing && existing.texts) {
    return {
      id: existing.id,
      texts: existing.texts as string[],
    };
  }

  return null;
}

/**
 * Получает Set с индексами уже использованных текстов для конкретного пула
 * @param aiTextId - ID записи с текстами в ai_generated_notification_texts
 * @param excludeAfterDate - опционально: исключить тексты, использованные после этой даты
 * @returns Set с индексами использованных текстов
 */
export async function getUsedTextIndices(
  aiTextId: number,
  excludeAfterDate?: Date
): Promise<Set<number>> {
  const conditions = [eq(aiNotificationTextUsage.aiTextId, aiTextId)];

  if (excludeAfterDate) {
    conditions.push(lte(aiNotificationTextUsage.sentAt, excludeAfterDate));
  }

  const usedRecords = await db
    .select({ textIndex: aiNotificationTextUsage.textIndex })
    .from(aiNotificationTextUsage)
    .where(and(...conditions));

  return new Set(usedRecords.map((record) => record.textIndex));
}

/**
 * Получает Set с хешами уже использованных текстов для конкретного пула
 * Используется для более надежной проверки дубликатов по содержимому, а не только по индексу
 * @param aiTextId - ID записи с текстами в ai_generated_notification_texts
 * @param excludeAfterDate - опционально: исключить тексты, использованные после этой даты
 * @returns Set с хешами использованных текстов
 */
export async function getUsedTextHashes(
  aiTextId: number,
  excludeAfterDate?: Date
): Promise<Set<string>> {
  const conditions = [eq(aiNotificationTextUsage.aiTextId, aiTextId)];

  if (excludeAfterDate) {
    conditions.push(lte(aiNotificationTextUsage.sentAt, excludeAfterDate));
  }

  const usedRecords = await db
    .select({ textHash: aiNotificationTextUsage.textHash })
    .from(aiNotificationTextUsage)
    .where(and(...conditions));

  return new Set(usedRecords.map((record) => record.textHash));
}

/**
 * Нормализует текст для семантического сравнения:
 * - игнорирует регистр
 * - игнорирует пунктуацию
 * - игнорирует порядок слов
 * - убирает лишние пробелы
 * @param text - текст для нормализации
 * @returns нормализованный текст
 */
export function normalizeTextForSemanticHash(text: string): string {
  return (
    text
      // приведение к нормальной юникод-форме (на всякий случай)
      .normalize('NFKC')
      // в нижний регистр
      .toLowerCase()
      // заменяем знаки препинания и лишние символы на пробел
      .replace(/[.,!?;:()[\]"«»„""—\-]/g, ' ')
      // все виды пробелов/переносов → один пробел
      .replace(/\s+/g, ' ')
      // обрезаем пробелы по краям
      .trim()
      // разбиваем на слова
      .split(' ')
      // выкидываем пустые (на случай двух пробелов подряд)
      .filter(Boolean)
      // сортируем слова по алфавиту, чтобы порядок не влиял
      .sort()
      // собираем обратно в строку
      .join(' ')
  );
}

/**
 * Вычисляет SHA-256 хеш текста для проверки уникальности
 * Использует семантическую нормализацию для более надежного обнаружения дубликатов
 * @param text - текст для хеширования
 * @returns SHA-256 хеш в hex формате
 */
export function hashNotificationText(text: string): string {
  const normalized = normalizeTextForSemanticHash(text);
  return createHash('sha256').update(normalized).digest('hex');
}

/**
 * Удаляет старые тексты с другим хешем конфигурации
 * Используется при перегенерации после изменения настроек
 */
async function cleanupOldTexts(
  userId: number,
  preferenceId: string,
  newConfigHash: string
): Promise<void> {
  try {
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

    if (oldTexts.length === 0) {
      return; // Нет старых текстов для удаления
    }

    console.log(
      `[AI Generation] 🧹 Cleaning up ${oldTexts.length} old text pool(s) with different hash for userId=${userId}, preferenceId=${preferenceId}`
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
      `[AI Generation] ✅ Cleaned up ${oldTexts.length} old text pool(s) and their usage records`
    );
  } catch (error) {
    console.error(`[AI Generation] ❌ Error cleaning up old texts:`, error);
    // Не прерываем выполнение, так как очистка не критична
  }
}

/**
 * Конфигурация для retry механизма
 */
interface RetryConfig {
  maxRetries: number; // Максимум попыток (включая первую)
  initialDelay: number; // Начальная задержка в миллисекундах
  maxDelay: number; // Максимальная задержка в миллисекундах
  exponentialBase: number; // База для exponential backoff
  retryableErrorCodes: string[]; // Коды ошибок, при которых нужно повторять
}

const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxRetries: 3, // 3 попытки = первая + 2 повтора
  initialDelay: 1000, // 1 секунда
  maxDelay: 30000, // 30 секунд
  exponentialBase: 2,
  retryableErrorCodes: [
    'rate_limit',
    'rate_limit_error',
    'timeout',
    'server_error',
    'internal_error',
    'service_unavailable',
  ],
};

/**
 * Проверяет, является ли ошибка ретрируемой
 */
function isRetryableError(error: any, retryableCodes: string[]): boolean {
  const errorMessage = (error?.message || '').toLowerCase();
  const errorCode = (error?.code || error?.statusCode || '').toString();

  // Проверяем коды ошибок
  if (retryableCodes.some((code) => errorMessage.includes(code))) {
    return true;
  }

  // Проверяем HTTP статусы
  const status = error?.status || error?.response?.status;
  if (status === 429) return true; // Rate limit
  if (status >= 500 && status < 600) return true; // Server errors

  return false;
}

/**
 * Задержка выполнения
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Оценивает стоимость генерации текстов
 */
function estimateGenerationCost(
  count: number,
  model: string = 'gpt-4o-mini'
): number {
  // Примерная оценка: ~700 токенов на один текст (prompt + completion)
  const tokensPerText = 700;
  const totalTokens = count * tokensPerText;
  // Примерно 50% input, 50% output
  const tokensIn = Math.floor(totalTokens * 0.5);
  const tokensOut = Math.floor(totalTokens * 0.5);

  return estimateCostUSD({
    provider: 'openai',
    model,
    tokensIn,
    tokensOut,
  });
}

/**
 * Выполняет функцию с retry механизмом (exponential backoff)
 */
async function generateWithRetry<T>(
  fn: () => Promise<T>,
  config: RetryConfig = DEFAULT_RETRY_CONFIG
): Promise<T> {
  let lastError: Error | null = null;
  let delay = config.initialDelay;

  for (let attempt = 0; attempt < config.maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error as Error;

      // Проверка, стоит ли повторять
      if (!isRetryableError(error, config.retryableErrorCodes)) {
        // Неретрируемая ошибка - выбрасываем сразу
        console.error(
          `[AI Generation] ❌ Non-retryable error on attempt ${attempt + 1}:`,
          error
        );
        throw error;
      }

      // Проверка лимита попыток
      if (attempt === config.maxRetries - 1) {
        // Это была последняя попытка
        console.error(
          `[AI Generation] ❌ Failed after ${config.maxRetries} attempts:`,
          lastError
        );
        throw new Error(
          `Failed to generate texts after ${config.maxRetries} attempts: ${lastError.message}`
        );
      }

      // Логирование и задержка перед следующей попыткой
      console.warn(
        `[AI Generation] ⚠️ Attempt ${attempt + 1}/${config.maxRetries} failed, retrying in ${delay}ms:`,
        error
      );

      await sleep(delay);
      delay = Math.min(delay * config.exponentialBase, config.maxDelay);
    }
  }

  throw lastError || new Error('Failed to generate texts');
}

/**
 * Генерирует тексты уведомлений через AI
 */
export async function generateNotificationTexts(
  params: GenerateNotificationTextsParams
): Promise<GenerationResult> {
  // 1. Загружаем данные о сущности (привычка или терапия)
  let entityName = '';
  let entityDescription: string | null = null;
  let isCustomHabit = false; // Флаг: найдена ли кастомная привычка в БД
  let isCustomTherapy = false; // Флаг: найдена ли кастомная тема в БД
  // Используем переданный intent, если он есть, иначе будем определять из БД/каталога
  let habitIntent: 'quit' | 'build' | null = params.habitIntent ?? null;

  if (params.kind === 'habits') {
    // Для кастомных сущностей entityKey = ID
    const [habit] = await db
      .select()
      .from(habits)
      .where(
        and(
          eq(habits.id, params.entityKey), // Для кастомных сущностей entityKey = ID
          eq(habits.userId, params.userId)
        )
      )
      .limit(1);

    if (habit) {
      // Кастомная привычка найдена в БД
      isCustomHabit = true;
      entityName = habit.name;
      entityDescription = habit.description;
      // Используем переданный intent, если он есть, иначе берем из БД
      if (!habitIntent) {
        habitIntent = habit.intent as 'quit' | 'build' | null;
      }
      console.log(
        `[AI Generation] Found custom habit: id=${habit.id}, name=${habit.name}, entityKey param=${params.entityKey}, intent=${habitIntent} (from params: ${params.habitIntent ?? 'not provided'}, from DB: ${habit.intent})`
      );
    } else {
      // Привычка не найдена в БД - проверяем, является ли это шаблоном
      const { findHabitByKey } = await import('@/app/lib/habitsCatalog');
      const catalogHabit = findHabitByKey(params.entityKey);

      if (catalogHabit) {
        // Это готовый шаблон привычки (water, meditation, training и т.д.)
        isCustomHabit = false;
        // Используем читаемое название из каталога вместо ключа
        entityName = catalogHabit.name;
        entityDescription = catalogHabit.description || null;
        // Используем intent из каталога, если не передан явно
        if (!habitIntent) {
          habitIntent = catalogHabit.intent;
        }
        console.log(
          `[AI Generation] Template habit found in catalog: entityKey=${params.entityKey}, name=${catalogHabit.name}, intent=${habitIntent} (from params: ${params.habitIntent ?? 'not provided'}, from catalog: ${catalogHabit.intent})`
        );
      } else {
        // Не найдено ни в БД, ни в каталоге - используем entityKey как имя
        entityName = params.entityKey;
        entityDescription = null;
        // Если intent не передан, используем fallback (только для обратной совместимости)
        if (!habitIntent) {
          habitIntent = inferHabitIntentFromName(entityName);
          console.warn(
            `[AI Generation] ⚠️ Habit not found in DB and not in catalog: entityKey=${params.entityKey}. Using fallback intent inference: ${habitIntent}`
          );
        }
      }
    }
  } else {
    // therapy
    // Сначала пробуем найти в кастомных темах
    const [topic] = await db
      .select()
      .from(therapyTopicsCustom)
      .where(
        and(
          eq(therapyTopicsCustom.id, params.entityKey),
          eq(therapyTopicsCustom.userId, params.userId)
        )
      )
      .limit(1);

    if (topic) {
      // Кастомная тема найдена в БД
      isCustomTherapy = true;
      entityName = topic.name;
      entityDescription = topic.description;
      console.log(
        `[AI Generation] Found custom therapy topic: id=${topic.id}, name=${topic.name}, entityKey param=${params.entityKey}`
      );
    } else {
      // Тема не найдена в БД - предполагаем, что это готовый шаблон
      // (для терапии нет каталога, как для привычек, поэтому просто используем entityKey)
      isCustomTherapy = false;
      entityName = params.entityKey;
      entityDescription = null;
      console.log(
        `[AI Generation] Template therapy topic: entityKey=${params.entityKey} (using as name)`
      );
    }
  }

  // 2. Загружаем глобальные настройки пользователя (tone, addressing)
  const [userPrefs] = await db
    .select()
    .from(userPreferences)
    .where(eq(userPreferences.userId, params.userId))
    .limit(1);

  const tone: Tone = (userPrefs?.tone as Tone) || 'neutral';
  const addressing: Addressing =
    (userPrefs?.addressing as Addressing) || 'informal';

  // 3. Вычисляем хеш конфигурации
  // КРИТИЧНО: habitIntent должен быть включен в хеш, чтобы при изменении intent генерировался новый пул текстов
  const configHash = computeGenerationConfigHash({
    entityName,
    entityDescription,
    tone,
    addressing,
    directness: params.directness as 'soft' | 'moderate' | 'hard',
    subtype: params.subtype as
      | 'reminder'
      | 'informational'
      | 'motivational'
      | 'mixed'
      | null,
    textSource: params.textSource,
    kind: params.kind,
    habitIntent: params.kind === 'habits' ? habitIntent : null, // Включаем intent только для habits
  });

  console.log(
    `[AI Generation] Computed config hash: ${configHash.substring(0, 8)}..., entityName: ${entityName}, entityDescription: ${entityDescription || 'null'}, directness: ${params.directness}, subtype: ${params.subtype}, textSource: ${params.textSource}, kind: ${params.kind}`
  );

  // 4. Очищаем старые тексты с другим хешем (если настройки изменились)
  await cleanupOldTexts(params.userId, params.preferenceId, configHash);

  // 4.1. Проверяем, есть ли уже сгенерированные тексты с ТОЧНЫМ хешем
  // ВАЖНО: Проверяем только по точному хешу, чтобы избежать несоответствий
  const existingTexts = await loadAiGeneratedTexts(
    params.userId,
    params.preferenceId,
    configHash
  );

  if (existingTexts && existingTexts.length > 0) {
    // Используем существующие тексты
    const [existing] = await db
      .select()
      .from(aiGeneratedNotificationTexts)
      .where(
        and(
          eq(aiGeneratedNotificationTexts.userId, params.userId),
          eq(aiGeneratedNotificationTexts.preferenceId, params.preferenceId),
          eq(aiGeneratedNotificationTexts.generationConfigHash, configHash)
        )
      )
      .limit(1);

    // Добавляем эмодзи ✨ в начало каждого текста, если его еще нет
    const textsWithEmoji = existingTexts.map((text) => {
      if (!text.startsWith('✨')) {
        return `✨ ${text}`;
      }
      return text;
    });

    console.log(
      `[AI Generation] ✅ Using existing AI texts: userId: ${params.userId}, preferenceId: ${params.preferenceId}, configHash: ${configHash.substring(0, 8)}..., textsCount: ${textsWithEmoji.length}`
    );

    return {
      texts: textsWithEmoji,
      provider: existing?.provider || 'openai',
      model: existing?.model || '',
      tokensUsed: existing?.tokensUsed || 0,
      costUsd: Number(existing?.costUsd || 0),
    };
  }

  console.log(
    `[AI Generation] No existing texts found, generating new ones: userId: ${params.userId}, preferenceId: ${params.preferenceId}, configHash: ${configHash.substring(0, 8)}...`
  );

  // 5. Строим промпт
  const systemPrompt = buildNotificationSystemPrompt({
    entityName,
    description: entityDescription,
    tone,
    addressing,
    directness: params.directness,
    subtype: params.subtype,
    kind: params.kind,
    habitIntent, // Передаем intent для формирования правильных инструкций
  });

  const count = params.count || DEFAULT_TEXT_COUNT;

  // ВАЖНО: Логируем count для отладки
  console.log(
    `[AI Generation] 🎯 Generating texts with count: ${count} (DEFAULT_TEXT_COUNT: ${DEFAULT_TEXT_COUNT}, params.count: ${params.count ?? 'undefined'})`
  );

  // Гарантируем, что count не меньше DEFAULT_TEXT_COUNT для первой генерации
  if (count < DEFAULT_TEXT_COUNT) {
    console.warn(
      `[AI Generation] ⚠️ WARNING: count (${count}) is less than DEFAULT_TEXT_COUNT (${DEFAULT_TEXT_COUNT}). This may cause insufficient texts.`
    );
  }

  // 5.1. Валидация бюджета перед генерацией
  const provider = params.provider || config.llm.defaultProvider;
  const model = config.llm.openai.models.notifications;
  const estimatedCost = estimateGenerationCost(count, model);

  if (estimatedCost > config.llm.limits.maxRequestUSD) {
    throw new Error(
      `[AI Generation] Estimated cost ($${estimatedCost.toFixed(6)}) exceeds max request limit ($${config.llm.limits.maxRequestUSD}). Cannot generate ${count} texts.`
    );
  }

  console.log(
    `[AI Generation] 💰 Estimated cost for ${count} texts: $${estimatedCost.toFixed(6)} (model: ${model})`
  );

  // 6. Вызываем LLM через существующую систему с retry механизмом
  const scenarioSettings = config.llm.openai.settings.notifications;

  // Вычисляем динамический maxOutputTokens на основе количества текстов
  // Формула: каждый текст ~178 символов (русский текст) = ~90-100 токенов (кириллица кодируется менее эффективно)
  // Плюс JSON форматирование ~30-40 токенов на текст (кавычки, запятые, скобки, переносы строк, эмодзи ✨, пробелы)
  // Итого: ~130-150 токенов на текст, используем очень консервативный расчет
  // Плюс очень большой запас 3000 токенов для JSON структуры, форматирования и гарантии получения всех текстов
  // Для 50 текстов: 50 * 150 + 3000 = 10500 токенов (максимально консервативный расчет с огромным запасом)
  // Увеличиваем расчет еще больше: 200 токенов на текст + 5000 запас для гарантии получения всех текстов
  // Для 50 текстов: 50 * 200 + 5000 = 15000 токенов (максимальный запас)
  const dynamicMaxOutputTokens = count * 200 + 5000; // 200 токенов на текст + 5000 запас (максимальный запас для гарантии)
  // Используем только динамическое значение - конфиг уже рассчитан на основе DEFAULT_COUNT
  const maxOutputTokens = dynamicMaxOutputTokens;

  console.log(
    `[AI Generation] 📊 Dynamic maxOutputTokens: ${maxOutputTokens} (calculated: ${dynamicMaxOutputTokens} for ${count} texts)`
  );

  // Генерируем с retry механизмом
  const result = await generateWithRetry(async () => {
    return await chatViaProvider({
      provider,
      model,
      messages: [
        {
          role: 'system',
          content: systemPrompt,
        },
        {
          role: 'user',
          content: `Сгенерируй РОВНО ${count} вариантов текстов уведомлений в формате JSON массива строк. Верни массив с РОВНО ${count} элементами - не меньше, не больше!`,
        },
      ],
      options: {
        scenario: 'notifications', // Использует настройки из конфига
        temperature: scenarioSettings.temperature,
        maxOutputTokens, // Используем динамически вычисленное значение
      },
    });
  });

  // 7. Парсим и валидируем тексты
  // Эмодзи ✨ добавляется автоматически в функции parseAndValidateTexts

  // ВАЖНО: Логируем исходный ответ для отладки
  const responsePreview = result.content.substring(0, 500);
  console.log(
    `[AI Generation] 📝 Raw LLM response length: ${result.content.length} characters, preview: ${responsePreview}...`
  );

  const texts = parseAndValidateTexts(result.content, count);

  // ВАЖНО: Логируем количество полученных текстов
  console.log(
    `[AI Generation] 📊 Parsed texts count: ${texts.length} (expected: ${count}, difference: ${count - texts.length})`
  );

  if (texts.length === 0) {
    throw new Error('Failed to generate valid notification texts');
  }

  // ВАЖНО: Если получили меньше текстов, чем запрашивали, это проблема
  if (texts.length < count) {
    console.error(
      `[AI Generation] ❌ ERROR: Generated only ${texts.length} texts instead of ${count} (missing ${count - texts.length} texts). This may indicate insufficient maxOutputTokens (current: ${maxOutputTokens}) or model limitations.`
    );
  }

  // 8. Вычисляем реальную стоимость на основе длин текстов
  // Примерная оценка токенов: ~4 символа на токен
  const promptText =
    systemPrompt +
    `\nСгенерируй ${count} вариантов текстов уведомлений в формате JSON массива строк. Каждый текст должен быть не более 178 символов.`;
  const tokensIn = Math.ceil(promptText.length / 4);
  const tokensOut = Math.ceil(
    texts.reduce((sum, text) => sum + text.length, 0) / 4
  );
  const actualTokensUsed = tokensIn + tokensOut;
  const actualCostUsd = estimateCostUSD({
    provider: 'openai',
    model: result.model || model,
    tokensIn,
    tokensOut,
  });

  console.log(
    `[AI Generation] 💰 Actual cost: $${actualCostUsd.toFixed(6)} (tokens: ${actualTokensUsed}, in: ${tokensIn}, out: ${tokensOut}, model: ${result.model || model})`
  );

  // ВАЖНО: Проверяем, что kind валидный
  if (params.kind !== 'habits' && params.kind !== 'therapy') {
    throw new Error(
      `[AI Generation] Invalid kind: ${params.kind}. Must be 'habits' or 'therapy'`
    );
  }

  // Используем entityKey как есть
  let finalEntityKey = params.entityKey;

  if (params.kind === 'habits') {
    // Используем флаг isCustomHabit, установленный выше
    if (isCustomHabit) {
      // Это кастомная привычка - используем ID
      finalEntityKey = params.entityKey; // ID для кастомных сущностей
      console.log(
        `[AI Generation] ✅ Using ID for custom habit: entityKey=${params.entityKey}`
      );
    } else {
      // Это готовый шаблон - используем entityKey как есть
      finalEntityKey = params.entityKey;
      console.log(
        `[AI Generation] ✅ Template habit - using entityKey as finalEntityKey: ${finalEntityKey}`
      );
    }
  } else if (params.kind === 'therapy') {
    // Для терапии используем флаг isCustomTherapy, установленный выше
    if (isCustomTherapy) {
      // Это кастомная тема - используем ID
      finalEntityKey = params.entityKey; // ID для кастомных сущностей
      console.log(
        `[AI Generation] ✅ Using ID for custom therapy topic: entityKey=${params.entityKey}`
      );
    } else {
      // Это готовый шаблон - используем entityKey как есть
      finalEntityKey = params.entityKey;
      console.log(
        `[AI Generation] ✅ Template therapy topic - using entityKey as finalEntityKey: ${finalEntityKey}`
      );
    }
  }

  console.log(
    `[AI Generation] Saving AI texts to DB: userId: ${params.userId}, preferenceId: ${params.preferenceId}, kind: ${params.kind}, entityKey: ${finalEntityKey} (READABLE), textSource: ${params.textSource}, configHash: ${configHash.substring(0, 8)}..., textsCount: ${texts.length}`
  );

  // ВАЖНО: Используем upsert для обновления существующих записей с тем же хешем
  // Это предотвращает дубликаты и обновляет тексты, если хеш совпадает
  await db
    .insert(aiGeneratedNotificationTexts)
    .values({
      userId: params.userId,
      preferenceId: params.preferenceId,
      kind: params.kind,
      entityKey: finalEntityKey, // ID для кастомных, ключ шаблона для шаблонных
      entityDisplayName: entityName || null, // Читаемое название для удобства разработчиков
      textSource: params.textSource,
      texts,
      generationConfigHash: configHash,
      provider,
      model: result.model || model,
      tokensUsed: actualTokensUsed,
      costUsd: actualCostUsd.toString(),
    })
    .onConflictDoUpdate({
      target: [
        aiGeneratedNotificationTexts.userId,
        aiGeneratedNotificationTexts.preferenceId,
        aiGeneratedNotificationTexts.generationConfigHash,
      ],
      set: {
        texts,
        entityDisplayName: entityName || null, // Обновляем display name при обновлении записи
        provider,
        model: result.model || model,
        tokensUsed: actualTokensUsed,
        costUsd: actualCostUsd.toString(),
        updatedAt: sql`NOW()`,
      },
    });

  console.log(
    `[AI Generation] ✅ AI texts saved to DB: userId: ${params.userId}, preferenceId: ${params.preferenceId}, configHash: ${configHash.substring(0, 8)}...`
  );

  return {
    texts,
    provider,
    model: result.model || model,
    tokensUsed: actualTokensUsed,
    costUsd: actualCostUsd,
  };
}

/**
 * Строит системный промпт для генерации уведомлений
 */
function buildNotificationSystemPrompt(params: {
  entityName: string;
  description?: string | null;
  tone: Tone;
  addressing: Addressing;
  directness: Directness;
  subtype?: HabitSubtype | null;
  kind: 'habits' | 'therapy';
  habitIntent?: 'quit' | 'build' | null; // Intent привычки: отказ (quit) или приобретение (build)
}): string {
  const toneMap: Record<Tone, string> = {
    delicate: 'деликатный, мягкий',
    neutral: 'нейтральный',
    uplifting: 'поддерживающий, вдохновляющий',
    resolute: 'решительный, мотивационный',
    demanding: 'требовательный, директивный',
  };

  const directnessMap: Record<Directness, string> = {
    soft: 'Мягкий',
    moderate: 'Сдержанный',
    hard: 'Жесткий',
  };

  const subtypeMap: Record<HabitSubtype, string> = {
    reminder: 'Напоминание о действии',
    informational: 'Полезные факты',
    motivational: 'Поддержка и мотивация',
    mixed: 'Смешанные уведомления',
  };

  // Формируем промпт с использованием описания как основной основы
  const descriptionContext = params.description
    ? `\n\nОписание и контекст (это ОСНОВА для генерации текстов, используй именно это):\n${params.description}\n\nКРИТИЧЕСКИ ВАЖНО: Все инструкции из описания (обращение, стиль, особые указания) должны применяться к КАЖДОМУ из всех текстов, а не только к первому.`
    : '';
  // Формируем инструкции для разных типов уведомлений
  let subtypeInstructions = '';

  if (params.kind === 'habits' && params.subtype) {
    // Базовые инструкции
    const habitContext = `Все тексты должны быть релевантны этой привычке. Используй смысл названия только как подсказку для понимания поведения, но НЕ копируй название дословно в тексты, особенно если оно звучит как кодовое слово или шутка.`;

    switch (params.subtype) {
      case 'reminder':
        subtypeInstructions = `${habitContext}
- Простые напоминания о действии, связанном с этой привычкой
${params.description ? '- Используй описание как основу для понимания, какое действие нужно напомнить' : ''}`;
        break;
      case 'informational':
        if (params.habitIntent === 'quit') {
          const baseHeader = `${habitContext}
- Факты и полезная информация, связанные с этой привычкой
- Используй разнообразные научные формулировки для начала текстов - чередуй популярные формулировки, используй синонимы и вариации, но НЕ повторяй одни и те же формулировки подряд
- КРИТИЧЕСКИ ВАЖНО: Каждый текст должен иметь уникальное начало! Избегай повторения одинаковых шаблонных фраз в нескольких текстах подряд
- Важно: используй проверенную информацию и статистику. Не выдумывай и не придумывай факты.`;

          if (params.directness === 'soft') {
            subtypeInstructions = `${baseHeader}
- Фокус на мягких формулировках без запугивания
- НЕ упоминай смерть, смертность, смертельные заболевания, рак, онкологию, инфаркт, инсульт и подобные формулировки
- Описывай влияние этой привычки на самочувствие, энергию, настроение, качество жизни, работоспособность
- Используй мягкие формулировки о влиянии на здоровье и самочувствие
- Цель: мягко показать реальные последствия и помочь заметить долгосрочный вред без шок-контента`;
          } else if (params.directness === 'moderate') {
            subtypeInstructions = `${baseHeader}
- Честно описывай медицинские риски, связанные с этой привычкой
- Акцент на механизмах вреда: атеросклероз, снижение эластичности сосудов, повышение артериального давления, воспаление тканей, ухудшение функции печени, снижение иммунитета
- Можешь упоминать серьезные заболевания (болезни сердца, легких, печени), но не в каждом тексте (примерно 1-2 на 10 текстов в рамках одной генерации)
- Допустимы редкие упоминания тяжёлых последствий (инфаркт, инсульт, онкологические заболевания), но без нагнетания и драматизации (10-20% текстов)
- При генерации одного текста: используй вероятностный выбор (10-20% шанс тяжелых исходов)
- Используй нейтральные, фактические, клинически точные формулировки
- Упор на спокойные, фактические формулировки без эмоциональных оценок
- Избегай постоянных упоминаний смертности и смертельных исходов
- Цель: трезво показать серьёзность последствий через понимание механизмов вреда, без нагнетания и драматизации`;
          } else {
            subtypeInstructions = `${baseHeader}
- ИСПОЛЬЗУЙ ЖЕСТКИЕ ФАКТЫ о негативных последствиях: смертность, сокращение продолжительности жизни, тяжёлые заболевания (рак, инфаркт, инсульт и т.п.)
- Прямо показывай, как эта привычка увеличивает риск этих исходов, опираясь на реальные данные и статистику
- Упоминай статистику смертности, риск развития тяжёлых заболеваний, реальные проценты и оценки, если они известны
- Формулировки могут быть строгими и прямыми, но БЕЗ преувеличений и выдуманных цифр
- НЕ используй формулировки типа "умрёшь раньше" - это неэтично и не клинически корректно
- Частота упоминаний: можешь упоминать смертность и тяжелые исходы, но с разнообразием (примерно 3-4 текста на 10 про смерть/рак в рамках одной генерации, НЕ в каждом!)
- При генерации одного текста: используй вероятностный выбор (30-40% шанс тяжелых исходов)
- При генерации партии из 50 текстов: соблюдай распределение тем в рамках одной генерации:
  * 30-40% - смертность и тяжелые исходы
  * 30-40% - серьезные заболевания (без смерти)
  * 20-30% - общие медицинские риски
- КРИТИЧЕСКИ ВАЖНО: Избегай повторения одной и той же болезни в нескольких текстах подряд. Меняй темы: сердце, сосуды, легкие, печень, когнитивные функции, метаболизм, иммунитет
- НЕ делай все тексты про смерть - это надоест и перестанет работать
- Цель: резко отрезвить пользователя и показать цену сохранения привычки в долгосрочной перспективе`;
          }
        } else if (params.habitIntent === 'build') {
          const baseHeader = `${habitContext}
- Факты и полезная информация о пользе этой привычки
- Используй разнообразные научные формулировки для начала текстов - чередуй популярные формулировки, используй синонимы и вариации, но НЕ повторяй одни и те же формулировки подряд
- КРИТИЧЕСКИ ВАЖНО: Каждый текст должен иметь уникальное начало! Избегай повторения одинаковых шаблонных фраз в нескольких текстах подряд
- НЕ упоминай смерть, смертность, смертельные заболевания, рак, онкологию, инфаркт, инсульт - это НЕ относится к полезным привычкам
- Фокус ТОЛЬКО на позитивных изменениях и пользе
- Важно: используй проверенную информацию и статистику. Не выдумывай и не придумывай факты.`;

          if (params.directness === 'soft') {
            subtypeInstructions = `${baseHeader}
- Более эмоциональные формулировки, акцент на чувствах и ощущениях
- Фокус на субъективном опыте и улучшении самочувствия`;
          } else if (params.directness === 'moderate') {
            subtypeInstructions = `${baseHeader}
- Сухие, фактические формулировки с данными
- Фокус на объективных показателях и научных данных`;
          } else {
            subtypeInstructions = `${baseHeader}
- Прямолинейная, конкретная польза с прямыми формулировками
- Фокус на конкретных выгодах и снижении рисков`;
          }
        } else {
          subtypeInstructions = `${habitContext}
- Факты и полезная информация, связанные с этой привычкой
- Используй разнообразные научные формулировки для начала текстов, чередуй их
- КРИТИЧЕСКИ ВАЖНО: НЕ повторяй одни и те же формулировки подряд!`;
        }
        break;
      case 'motivational':
        subtypeInstructions = `${habitContext}
- Поддержка и мотивация в контексте работы с этой привычкой`;
        break;
      case 'mixed':
        subtypeInstructions = `${habitContext}
- Смешанные уведомления, релевантные этой привычке
- Чередуй напоминания, факты и мотивацию`;
        break;
    }
  } else if (params.kind === 'therapy') {
    const therapyContext = params.description
      ? `- Все тексты должны быть релевантны теме из описания выше. Используй описание как основу.`
      : `- Все тексты должны быть релевантны этой теме поддержки.`;

    subtypeInstructions =
      params.subtype === 'motivational'
        ? `${therapyContext}\n- Поддержка и мотивация в контексте этой темы`
        : therapyContext;
  }

  return `Ты помощник для генерации текстов уведомлений для мобильного приложения MentAI.

Контекст:
- Тип: ${params.kind === 'habits' ? 'привычка' : 'тема поддержки'}
- Название (используй только как внутренний контекст): ${params.entityName}${descriptionContext}

Стиль:
- Тон: ${toneMap[params.tone]}
- Обращение: ${params.addressing === 'formal' ? 'на Вы' : 'на ты'}
- Прямота: ${directnessMap[params.directness]}
${params.subtype ? `- Фокус уведомления: ${subtypeMap[params.subtype]}` : ''}

КРИТИЧЕСКИ ВАЖНО - применяется ко ВСЕМ текстам без исключения:
- ВСЕ параметры выше (название, описание, тон, обращение, прямота, фокус) должны учитываться в КАЖДОМ тексте
- Каждый из всех текстов должен соответствовать всем указанным параметрам и инструкциям из описания

Требования:
- Каждый текст должен быть не более 178 символов
- Можно использовать плейсхолдер {name} для имени пользователя
- Тексты должны быть разнообразными
${
  params.kind === 'habits'
    ? `- Все тексты должны быть релевантны сути привычки. Название "${params.entityName}" используй только как внутренний контекст.
- НЕ пиши фразы вида «привычка "${params.entityName}"», «делать "${params.entityName}"» и не ставь название в кавычки.
- Если название звучит естественно как действие или состояние (например, "пить воду"), можно использовать его в тексте, но без кавычек и без слова "привычка".`
    : `- Для терапии: фокус на поддержке и рефлексии. Название темы "${params.entityName}" используй только как контекст, избегай странных фраз с названием в кавычках.
- Если название звучит как нормальное состояние ("тревога", "усталость"), можно использовать его естественно.`
}
${subtypeInstructions}

ВАЖНО - запрещено использовать:
- НЕ используй приветствия с упоминанием времени дня (например: "Доброе утро", "Добрый день", "Добрый вечер", "Спокойной ночи"), ЕСЛИ в описании нет явных инструкций об обращении
- НЕ создавай тексты с вопросами к пользователю (например: "Что ты хочешь обсудить?", "Как я могу помочь?", "О чем ты хочешь спросить?")
- НЕ предлагай обсудить что-либо - уведомления должны быть информативными, напоминающими или мотивирующими, но не призывающими к диалогу
- Уведомления - это одностороннее сообщение, а не начало разговора
- НЕ упоминай название привычки или темы напрямую в текстах, если это не является естественным (например, если название - это общее понятие типа "пить воду", можно использовать, но если название - это специфическое слово типа "Здарова", НЕ используй его)


Формат ответа: JSON массив строк, например: ["текст 1", "текст 2", ..., "текст N"], где N - это РОВНО запрошенное количество.`;
}

/**
 * Парсит и валидирует тексты из ответа AI
 */
function parseAndValidateTexts(
  content: string,
  expectedCount: number
): string[] {
  // Парсим JSON массив
  let texts: string[] = [];
  try {
    // Убираем markdown code fences если есть
    const cleaned = content
      .replace(/```json\n?/g, '')
      .replace(/```\n?/g, '')
      .trim();
    texts = JSON.parse(cleaned);
    console.log(
      `[AI Generation] ✅ Successfully parsed JSON: ${texts.length} texts found (expected: ${expectedCount})`
    );
  } catch (error: any) {
    console.warn(
      `[AI Generation] ⚠️ JSON parse failed, trying regex fallback: ${error.message}`
    );
    // Fallback: пытаемся извлечь тексты через regex
    const matches = content.match(/"([^"]{1,178})"/g);
    if (matches) {
      texts = matches.map((m) => m.slice(1, -1));
      console.log(
        `[AI Generation] ✅ Regex fallback found ${texts.length} texts (expected: ${expectedCount})`
      );
    } else {
      console.error(
        `[AI Generation] ❌ Failed to extract texts from LLM response`
      );
    }
  }

  // Валидация и добавление эмодзи
  return texts
    .filter((text): text is string => typeof text === 'string')
    .map((text) => text.trim())
    .filter((text) => text.length > 0)
    .map((text) => {
      // Добавляем эмодзи ✨ в начало, если его еще нет
      if (!text.startsWith('✨')) {
        // Эмодзи "✨ " занимает 2 символа, поэтому проверяем длину с учетом эмодзи
        const emojiPrefix = '✨ ';
        const maxTextLength = 178 - emojiPrefix.length; // 176 символов для текста

        // Если текст уже с эмодзи превышает лимит, обрезаем его
        if (text.length > maxTextLength) {
          return `${emojiPrefix}${text.slice(0, maxTextLength)}`;
        }
        return `${emojiPrefix}${text}`;
      }
      // Если эмодзи уже есть, проверяем общую длину
      if (text.length > 178) {
        // Если текст с эмодзи превышает лимит, обрезаем его
        return text.slice(0, 178);
      }
      return text;
    })
    .filter((text) => text.length > 0 && text.length <= 178)
    .slice(0, expectedCount);
}

/**
 * Статус пула текстов для догенерации
 */
export interface PoolStatus {
  totalTexts: number; // Всего текстов в пуле
  usedTexts: number; // Использовано текстов
  availableTexts: number; // Доступно текстов
  daysRemaining: number; // Дней осталось (при текущем расходе)
  needsRefill: boolean; // Нужно ли пополнение
}

/**
 * Проверяет статус пула текстов и необходимость догенерации
 */
export async function checkAndRefillTextPool(
  userId: number,
  preferenceId: string,
  configHash: string,
  textsPerDay: number
): Promise<PoolStatus> {
  // 1. Загрузить текущий пул текстов
  const aiTextRecord = await loadAiGeneratedTextsWithId(
    userId,
    preferenceId,
    configHash
  );

  if (!aiTextRecord) {
    throw new Error('Text pool not found');
  }

  // 2. Определить использованные тексты
  const usedIndices = await getUsedTextIndices(aiTextRecord.id);
  const availableTexts = aiTextRecord.texts.length - usedIndices.size;

  // 3. Рассчитать дней осталось
  const daysRemaining =
    textsPerDay > 0 ? Math.floor(availableTexts / textsPerDay) : 0;

  // 4. Проверить, нужно ли пополнение (если осталось < 2 дней)
  const needsRefill = daysRemaining < 2;

  return {
    totalTexts: aiTextRecord.texts.length,
    usedTexts: usedIndices.size,
    availableTexts,
    daysRemaining,
    needsRefill,
  };
}

/**
 * Догенерирует тексты для пула с защитой от race condition (optimistic locking)
 */
export async function refillTextPool(
  userId: number,
  preferenceId: string,
  kind: 'habits' | 'therapy',
  entityKey: string,
  configHash: string,
  directness: Directness,
  subtype: HabitSubtype | null,
  textSource: 'ai' | 'hybrid',
  habitIntent?: 'quit' | 'build' | null // Intent привычки, переданный явно
): Promise<GenerationResult | null> {
  try {
    // 1. Загружаем текущую запись с блокировкой (SELECT FOR UPDATE)
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
      .limit(1);

    if (!currentRecord) {
      console.warn(
        `[AI Generation] ⚠️ Text pool not found for refill: userId=${userId}, preferenceId=${preferenceId}, configHash=${configHash.substring(0, 8)}...`
      );
      return null;
    }

    // 2. Проверяем использованные тексты
    const usedIndicesNow = await getUsedTextIndices(currentRecord.id);
    const currentTexts = currentRecord.texts as string[];
    const availableTexts = currentTexts.length - usedIndicesNow.size;

    // 3. Определяем, сколько нужно догенерировать
    const targetCount = DEFAULT_TEXT_COUNT; // 50 текстов
    const toGenerate = Math.max(0, targetCount - availableTexts);

    if (toGenerate === 0) {
      console.log(
        `[AI Generation] ✅ Pool is full (${availableTexts}/${targetCount} available), no need to refill`
      );
      return null;
    }

    console.log(
      `[AI Generation] 🔄 Refilling pool: ${availableTexts}/${targetCount} available, need to generate ${toGenerate} texts`
    );

    // 4. Генерируем новые тексты
    // ВАЖНО: для догенерации нужно создавать только новые тексты, даже если старые есть
    // Поэтому загружаем данные о сущности и генерируем напрямую через LLM
    // (generateNotificationTexts может вернуть существующие, если они есть)

    // 4.1. Загружаем данные о сущности для промпта
    let entityName = '';
    let entityDescription: string | null = null;
    // Используем переданный intent, если он есть, иначе определяем из БД/каталога
    let currentHabitIntent: 'quit' | 'build' | null = habitIntent ?? null;

    if (kind === 'habits') {
      // Для кастомных сущностей entityKey = ID
      const [habit] = await db
        .select()
        .from(habits)
        .where(
          and(
            eq(habits.id, entityKey), // Для кастомных сущностей entityKey = ID
            eq(habits.userId, userId)
          )
        )
        .limit(1);

      if (habit) {
        entityName = habit.name;
        entityDescription = habit.description;
        // Используем переданный intent, если он есть, иначе берем из БД
        if (!currentHabitIntent) {
          currentHabitIntent = habit.intent as 'quit' | 'build' | null;
        }
      } else {
        const { findHabitByKey } = await import('@/app/lib/habitsCatalog');
        const catalogHabit = findHabitByKey(entityKey);
        // Используем читаемое название из каталога для готовых шаблонов
        entityName = catalogHabit ? catalogHabit.name : entityKey;
        // Используем intent из каталога, если не передан явно
        if (!currentHabitIntent) {
          currentHabitIntent = catalogHabit ? catalogHabit.intent : null;
        }
        // Fallback только если intent не определен нигде
        if (!currentHabitIntent) {
          currentHabitIntent = inferHabitIntentFromName(entityName);
        }
      }
    } else {
      const [topic] = await db
        .select()
        .from(therapyTopicsCustom)
        .where(
          and(
            eq(therapyTopicsCustom.id, entityKey),
            eq(therapyTopicsCustom.userId, userId)
          )
        )
        .limit(1);

      if (topic) {
        entityName = topic.name;
        entityDescription = topic.description;
      } else {
        entityName = entityKey;
      }
    }

    // 4.2. Загружаем настройки пользователя
    const [userPrefs] = await db
      .select()
      .from(userPreferences)
      .where(eq(userPreferences.userId, userId))
      .limit(1);

    const tone: Tone = (userPrefs?.tone as Tone) || 'neutral';
    const addressing: Addressing =
      (userPrefs?.addressing as Addressing) || 'informal';

    // 4.3. Строим промпт и генерируем только новые тексты через LLM
    const systemPrompt = buildNotificationSystemPrompt({
      entityName,
      description: entityDescription,
      tone,
      addressing,
      directness,
      subtype,
      kind,
      habitIntent: currentHabitIntent, // Передаем intent для формирования правильных инструкций
    });

    const provider = config.llm.defaultProvider;
    const model = config.llm.openai.models.notifications;
    const scenarioSettings = config.llm.openai.settings.notifications;
    const estimatedCost = estimateGenerationCost(toGenerate, model);

    if (estimatedCost > config.llm.limits.maxRequestUSD) {
      console.warn(
        `[AI Generation] ⚠️ Estimated cost ($${estimatedCost.toFixed(6)}) exceeds limit, skipping refill`
      );
      return null;
    }

    console.log(
      `[AI Generation] 💰 Refill estimated cost: $${estimatedCost.toFixed(6)} for ${toGenerate} texts`
    );

    // Вычисляем динамический maxOutputTokens на основе количества текстов
    // Формула такая же, как в основной генерации: count * 200 + 5000
    const dynamicMaxOutputTokens = toGenerate * 200 + 5000; // 200 токенов на текст + 5000 запас (максимальный запас для гарантии)
    // Используем только динамическое значение
    const maxOutputTokens = dynamicMaxOutputTokens;

    console.log(
      `[AI Generation] 📊 Refill dynamic maxOutputTokens: ${maxOutputTokens} (calculated: ${dynamicMaxOutputTokens} for ${toGenerate} texts)`
    );

    // Генерируем с retry механизмом
    const llmResult = await generateWithRetry(async () => {
      return await chatViaProvider({
        provider,
        model,
        messages: [
          {
            role: 'system',
            content: systemPrompt,
          },
          {
            role: 'user',
            content: `Сгенерируй РОВНО ${toGenerate} вариантов текстов уведомлений в формате JSON массива строк. Верни массив с РОВНО ${toGenerate} элементами - не меньше, не больше!`,
          },
        ],
        options: {
          scenario: 'notifications',
          temperature: scenarioSettings.temperature,
          maxOutputTokens, // Используем динамически вычисленное значение
        },
      });
    });

    // 4.4. Парсим и валидируем тексты
    const newTexts = parseAndValidateTexts(llmResult.content, toGenerate);

    if (newTexts.length === 0) {
      console.warn(
        `[AI Generation] ⚠️ Failed to generate new texts for refill`
      );
      return null;
    }

    // 4.5. Вычисляем стоимость
    const promptText =
      systemPrompt +
      `\nСгенерируй ${toGenerate} вариантов текстов уведомлений в формате JSON массива строк. Каждый текст должен быть не более 178 символов.`;
    const tokensIn = Math.ceil(promptText.length / 4);
    const tokensOut = Math.ceil(
      newTexts.reduce((sum, text) => sum + text.length, 0) / 4
    );
    const actualTokensUsed = tokensIn + tokensOut;
    const actualCostUsd = estimateCostUSD({
      provider: 'openai',
      model: llmResult.model || model,
      tokensIn,
      tokensOut,
    });

    const result: GenerationResult = {
      texts: newTexts,
      provider,
      model: llmResult.model || model,
      tokensUsed: actualTokensUsed,
      costUsd: actualCostUsd,
    };

    // 5. Обновляем запись с проверкой, что тексты не изменились
    // Используем optimistic locking: проверяем, что текущие тексты совпадают
    // КРИТИЧНО: НЕ удаляем использованные тексты из массива, только дописываем новые в конец
    // Иначе индексы в aiNotificationTextUsage станут невалидными (тексты сдвинутся)
    const updated = await db
      .update(aiGeneratedNotificationTexts)
      .set({
        texts: [...currentTexts, ...result.texts], // Просто дописываем новые тексты в конец
        updatedAt: sql`NOW()`,
      })
      .where(
        and(
          eq(aiGeneratedNotificationTexts.id, currentRecord.id),
          // Проверяем, что количество текстов не изменилось (защита от race condition)
          sql`jsonb_array_length(${aiGeneratedNotificationTexts.texts}) = ${currentTexts.length}`
        )
      )
      .returning();

    if (updated.length === 0) {
      // Кто-то другой обновил данные - пропускаем
      console.warn(
        `[AI Generation] ⚠️ Pool was updated by another process during refill, skipping update`
      );
      return null;
    }

    console.log(
      `[AI Generation] ✅ Pool refilled successfully: generated ${result.texts.length} texts, total now: ${(updated[0].texts as string[]).length}`
    );

    return result;
  } catch (error) {
    console.error(`[AI Generation] ❌ Error refilling text pool:`, error);
    // Не прерываем выполнение при ошибке догенерации
    return null;
  }
}
