/**
 * Сервис для генерации AI-текстов уведомлений
 */

import { chatViaProvider } from '@@/server/application/llm.service';
import { config } from '@@/server/config';
import { db } from '@@/server/infrastructure/db/client';
import {
  aiGeneratedNotificationTexts,
  habits,
  therapyTopicsCustom,
  userPreferences,
} from '@@/server/infrastructure/db/schema';
import { computeGenerationConfigHash } from '@@/server/utils/notification-ai-config-hash';
import { eq, and, or, sql } from 'drizzle-orm';
import type {
  Tone,
  Addressing,
  Directness,
  HabitSubtype,
} from '@/shared/dto/notifications';

interface GenerateNotificationTextsParams {
  userId: number;
  preferenceId: string;
  kind: 'habits' | 'therapy';
  entityKey: string; // Единое поле для идентификации источника (может быть ID, slug или ключ шаблона)
  directness: Directness;
  subtype?: HabitSubtype | null;
  textSource: 'ai' | 'hybrid'; // Только для AI-генерации (не может быть 'templates')
  count?: number; // количество текстов для генерации (по умолчанию 15-20)
  provider?: 'openai' | 'deepseek' | 'yandex';
}

interface GenerationResult {
  texts: string[];
  provider: string;
  model: string;
  tokensUsed: number;
  costUsd: number;
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

  if (params.kind === 'habits') {
    // Сначала пробуем найти в кастомных привычках
    const [habit] = await db
      .select()
      .from(habits)
      .where(
        and(
          or(
            eq(habits.id, params.entityKey),
            eq(habits.slug, params.entityKey)
          ),
          eq(habits.userId, params.userId)
        )
      )
      .limit(1);

    if (habit) {
      // Кастомная привычка найдена в БД
      isCustomHabit = true;
      entityName = habit.name;
      entityDescription = habit.description;
      console.log(
        `[AI Generation] Found custom habit: id=${habit.id}, slug=${habit.slug}, name=${habit.name}, entityKey param=${params.entityKey}`
      );
      // ВАЖНО: Проверяем, что entityKey читаемый (slug)
      if (
        habit.slug &&
        params.entityKey !== habit.slug &&
        params.entityKey === habit.id
      ) {
        console.warn(
          `[AI Generation] ⚠️ WARNING: entityKey is not readable (ID instead of slug)! entityKey=${params.entityKey}, slug=${habit.slug}. This will cause issues with URLs.`
        );
      }
    } else {
      // Привычка не найдена в БД - проверяем, является ли это шаблоном
      const { findHabitByKey } = await import('@/app/lib/habitsCatalog');
      const catalogHabit = findHabitByKey(params.entityKey);

      if (catalogHabit) {
        // Это готовый шаблон привычки (water, meditation, training и т.д.)
        isCustomHabit = false;
        entityName = params.entityKey; // Используем entityKey (habitKey) как имя
        entityDescription = null;
        console.log(
          `[AI Generation] Template habit found in catalog: entityKey=${params.entityKey} (using as name)`
        );
      } else {
        // Это не шаблон и не найдено в БД - возможно, кастомная привычка еще не сохранена
        // Или это slug кастомной привычки, которая существует, но поиск не нашел её
        // В этом случае предполагаем, что это кастомная привычка со slug
        isCustomHabit = true; // Предполагаем, что это кастомная привычка
        // Пробуем найти по slug еще раз (возможно, была проблема с поиском)
        const [habitBySlug] = await db
          .select()
          .from(habits)
          .where(
            and(
              eq(habits.slug, params.entityKey),
              eq(habits.userId, params.userId)
            )
          )
          .limit(1);

        if (habitBySlug) {
          // Нашли по slug - используем данные из БД
          entityName = habitBySlug.name;
          entityDescription = habitBySlug.description;
          console.log(
            `[AI Generation] Found custom habit by slug on retry: id=${habitBySlug.id}, slug=${habitBySlug.slug}, name=${habitBySlug.name}`
          );
        } else {
          // Не найдено - используем entityKey как имя (предполагаем, что это slug кастомной привычки)
          entityName = params.entityKey;
          entityDescription = null;
          console.warn(
            `[AI Generation] ⚠️ Habit not found in DB and not in catalog: entityKey=${params.entityKey}. Assuming it's a custom habit slug and using entityKey as name.`
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
          or(
            eq(therapyTopicsCustom.id, params.entityKey),
            eq(therapyTopicsCustom.slug, params.entityKey)
          ),
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
        `[AI Generation] Found custom therapy topic: id=${topic.id}, slug=${topic.slug}, name=${topic.name}, entityKey param=${params.entityKey}`
      );
      // ВАЖНО: Проверяем, что entityKey читаемый (slug)
      if (
        topic.slug &&
        params.entityKey !== topic.slug &&
        params.entityKey === topic.id
      ) {
        console.warn(
          `[AI Generation] ⚠️ WARNING: entityKey is not readable (ID instead of slug)! entityKey=${params.entityKey}, slug=${topic.slug}. This will cause issues with URLs.`
        );
      }
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
  });

  console.log(
    `[AI Generation] Computed config hash: ${configHash.substring(0, 8)}..., entityName: ${entityName}, entityDescription: ${entityDescription || 'null'}, directness: ${params.directness}, subtype: ${params.subtype}, textSource: ${params.textSource}, kind: ${params.kind}`
  );

  // 4. Проверяем, есть ли уже сгенерированные тексты с ТОЧНЫМ хешем
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
  });

  const count = params.count || 15;

  // 6. Вызываем LLM через существующую систему
  const provider = params.provider || config.llm.defaultProvider;
  const model = config.llm.openai.models.notifications;
  const scenarioSettings = config.llm.openai.settings.notifications;

  const result = await chatViaProvider({
    provider,
    model,
    messages: [
      {
        role: 'system',
        content: systemPrompt,
      },
      {
        role: 'user',
        content: `Сгенерируй ${count} вариантов текстов уведомлений в формате JSON массива строк. Каждый текст должен быть не более 178 символов.`,
      },
    ],
    options: {
      scenario: 'notifications', // Использует настройки из конфига
      temperature: scenarioSettings.temperature,
      maxOutputTokens: scenarioSettings.maxOutputTokens,
    },
  });

  // 7. Парсим и валидируем тексты
  // Эмодзи ✨ добавляется автоматически в функции parseAndValidateTexts
  const texts = parseAndValidateTexts(result.content, count);

  if (texts.length === 0) {
    throw new Error('Failed to generate valid notification texts');
  }

  // 8. Сохраняем в БД
  // TODO: Вычислить tokensUsed и costUsd из ответа API (если доступно)
  const tokensUsed = 0; // TODO: получить из ответа
  const costUsd = 0; // TODO: вычислить

  // ВАЖНО: Проверяем, что kind валидный
  if (params.kind !== 'habits' && params.kind !== 'therapy') {
    throw new Error(
      `[AI Generation] Invalid kind: ${params.kind}. Must be 'habits' or 'therapy'`
    );
  }

  // ВАЖНО: entityKey должен быть читаемым (slug для кастомных привычек)
  // Исправляем entityKey для кастомных привычек, если нужно
  let finalEntityKey = params.entityKey;

  if (params.kind === 'habits') {
    // Используем флаг isCustomHabit, установленный выше
    if (isCustomHabit) {
      // Это кастомная привычка - используем slug, если он есть
      const [habitForSlug] = await db
        .select({ slug: habits.slug, id: habits.id })
        .from(habits)
        .where(
          and(
            or(
              eq(habits.id, params.entityKey),
              eq(habits.slug, params.entityKey)
            ),
            eq(habits.userId, params.userId)
          )
        )
        .limit(1);

      if (habitForSlug?.slug && habitForSlug.slug !== habitForSlug.id) {
        // Используем slug, если он отличается от ID
        finalEntityKey = habitForSlug.slug;
        console.log(
          `[AI Generation] ✅ Using slug for custom habit: entityKey=${params.entityKey} -> finalEntityKey=${finalEntityKey}`
        );
      } else {
        // Slug совпадает с ID или отсутствует - используем entityKey как есть (должен быть slug)
        finalEntityKey = params.entityKey;
        console.log(
          `[AI Generation] Using entityKey as finalEntityKey for custom habit: ${finalEntityKey}`
        );
      }
    } else {
      // Это готовый шаблон - используем entityKey как есть (это habitKey)
      finalEntityKey = params.entityKey;
      console.log(
        `[AI Generation] ✅ Template habit - using entityKey as finalEntityKey: ${finalEntityKey}`
      );
    }
  } else if (params.kind === 'therapy') {
    // Для терапии используем флаг isCustomTherapy, установленный выше

    if (isCustomTherapy) {
      // Это кастомная тема - используем slug, если он есть
      const [topicForSlug] = await db
        .select({ slug: therapyTopicsCustom.slug, id: therapyTopicsCustom.id })
        .from(therapyTopicsCustom)
        .where(
          and(
            or(
              eq(therapyTopicsCustom.id, params.entityKey),
              eq(therapyTopicsCustom.slug, params.entityKey)
            ),
            eq(therapyTopicsCustom.userId, params.userId)
          )
        )
        .limit(1);

      if (topicForSlug?.slug && topicForSlug.slug !== topicForSlug.id) {
        // Используем slug, если он отличается от ID
        finalEntityKey = topicForSlug.slug;
        console.log(
          `[AI Generation] ✅ Using slug for custom therapy topic: entityKey=${params.entityKey} -> finalEntityKey=${finalEntityKey}`
        );
      } else {
        // Slug совпадает с ID или отсутствует - используем entityKey как есть (должен быть slug)
        finalEntityKey = params.entityKey;
        console.log(
          `[AI Generation] Using entityKey as finalEntityKey for custom therapy topic: ${finalEntityKey}`
        );
      }
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
      entityKey: finalEntityKey, // Всегда читаемый (slug для кастомных привычек/тем)
      textSource: params.textSource,
      texts,
      generationConfigHash: configHash,
      provider,
      model: result.model || model,
      tokensUsed,
      costUsd: costUsd.toString(),
    })
    .onConflictDoUpdate({
      target: [
        aiGeneratedNotificationTexts.userId,
        aiGeneratedNotificationTexts.preferenceId,
        aiGeneratedNotificationTexts.generationConfigHash,
      ],
      set: {
        texts,
        provider,
        model: result.model || model,
        tokensUsed,
        costUsd: costUsd.toString(),
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
    tokensUsed,
    costUsd,
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
}): string {
  const toneMap: Record<Tone, string> = {
    delicate: 'деликатный, мягкий',
    neutral: 'нейтральный',
    uplifting: 'поддерживающий, вдохновляющий',
    resolute: 'решительный, мотивационный',
    demanding: 'требовательный, директивный',
  };

  const directnessMap: Record<Directness, string> = {
    soft: 'Поддерживающий',
    moderate: 'Сдержанный',
    hard: 'Требовательный',
  };

  const subtypeMap: Record<HabitSubtype, string> = {
    reminder: 'Напоминание о действии',
    informational: 'Полезные факты',
    motivational: 'Поддержка и мотивация',
    mixed: 'Смешанные уведомления',
  };

  // Формируем промпт с использованием описания как части контекста
  const descriptionContext = params.description
    ? `\n\nОписание и контекст (используй это как основу для генерации текстов):\n${params.description}\n\nЭто описание является промптом для генерации уведомлений. Используй его для создания релевантных и персонализированных текстов.`
    : '';

  return `Ты помощник для генерации текстов уведомлений для мобильного приложения MentAI.

Контекст:
- Тип: ${params.kind === 'habits' ? 'привычка' : 'тема поддержки'}
- Название: ${params.entityName}${descriptionContext}

Стиль:
- Тон: ${toneMap[params.tone]}
- Обращение: ${params.addressing === 'formal' ? 'на Вы' : 'на ты'}
- Прямота: ${directnessMap[params.directness]}
${params.subtype ? `- Фокус уведомления: ${subtypeMap[params.subtype]}` : ''}

Требования:
- Каждый текст должен быть не более 178 символов
- Можно использовать плейсхолдер {name} для имени пользователя
- Тексты должны быть разнообразными, но в едином стиле
- Для привычек: фокус на действии
- Для терапии: фокус на поддержке и рефлексии
${params.subtype === 'reminder' ? '- Простые напоминания о действии' : ''}
${params.subtype === 'informational' ? '- Факты и полезная информация' : ''}
${params.subtype === 'motivational' ? '- Поддержка и мотивация' : ''}
${params.description ? '- Используй описание выше как основу для генерации персонализированных текстов' : ''}

Сгенерируй тексты в формате JSON массива строк.`;
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
  } catch {
    // Fallback: пытаемся извлечь тексты через regex
    const matches = content.match(/"([^"]{1,178})"/g);
    if (matches) {
      texts = matches.map((m) => m.slice(1, -1));
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
