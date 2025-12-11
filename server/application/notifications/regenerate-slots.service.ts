/**
 * Сервис для регенерации слотов уведомлений для конкретного источника
 * Внутренняя реализация логики регенерации слотов
 */

import { eq, and, isNull, count } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import { db } from '@/server/infrastructure/db/client';
import { getTimezoneFromPrefs, toLocalTime } from './timezone.utils';
import {
  userPreferences,
  habits,
  therapyTopicsCustom,
  users,
  aiNotificationTextUsage,
  aiGeneratedNotificationTexts,
} from '@/server/infrastructure/db/schema';
import type { NotificationKind } from '@/shared/dto/notifications';
import {
  resolveEntityKeyForSlots,
  type ResolvedEntityKey,
} from '@/server/application/notifications/entity-key.service';
import { generateSlotTimes } from '@/server/application/notifications/slot-times.service';
import {
  loadTextsForPreference,
  type LoadedTexts,
} from '@/server/application/notifications/notification-texts.service';
import type {
  NotificationPayload,
  NotificationPreferenceMeta,
  NotificationSubtype,
} from '@/shared/dto/notifications';
import {
  loadAiGeneratedTexts,
  loadAiGeneratedTextsWithId,
  getUsedTextIndices,
  getUsedTextHashes,
  hashNotificationText,
  checkAndRefillTextPool,
} from '@/server/application/notifications/ai-generation.service';
import { computeGenerationConfigHash } from '@/server/utils/notification-ai-config-hash';
import { findHabitByKey } from '@/app/lib/habitsCatalog';
import {
  findPreferenceForSource,
  findEnabledPreferencesByUser,
} from './repositories/notification-preferences.repository';
import {
  deletePlannedFutureSlotsForSource,
  insertSlot,
} from './repositories/notification-slots.repository';
import {
  pickTextForSlot,
  type TextSelectionState,
  type PickTextParams,
} from './text-selection.service';

const DEBUG_NOTIFICATIONS = process.env.DEBUG_NOTIFICATIONS === 'true';

// Конфигурация планировщика (используется из scheduler.service.ts)
const SCHEDULE_CONFIG = {
  horizonDays: 1,
  jitterMinutes: 15,
};

/**
 * Вычисляет день года для детерминированного выбора subtype
 * @param date - дата для вычисления
 * @returns день года (1-366)
 */
export function computeDayOfYear(date: Date): number {
  return Math.floor(
    (date.getTime() - new Date(date.getFullYear(), 0, 0).getTime()) /
      (1000 * 60 * 60 * 24)
  );
}

/**
 * Внутренняя функция для регенерации слотов для конкретного источника
 * @param userId - ID пользователя
 * @param kind - тип уведомлений
 * @param options - параметры источника (entityKey для идентификации)
 */
export async function regenerateSlotsForSourceInternal(
  userId: number,
  kind: NotificationKind,
  options?: {
    entityKey?: string;
  }
): Promise<void> {
  const { entityKey } = options || {};

  try {
    if (DEBUG_NOTIFICATIONS) {
      console.log(`[RegenerateSlots] ========== REGENERATING SLOTS ==========`);
    }
    console.log(
      `[RegenerateSlots] Regenerating slots for source: user ${userId}, kind: ${kind}, entityKey: ${entityKey || 'none'} (should be readable)`
    );

    // Один вызов вместо четырёх - убираем 3 лишних запроса к БД
    const entityKeyInfo = await resolveEntityKeyForSlots(
      userId,
      kind,
      entityKey
    );
    const isCustomEntity = entityKeyInfo.isCustom;
    const normalizedEntityKeyForSlot = entityKeyInfo.normalized;

    // Проверяем, что источник существует через репозиторий
    const sourcePref = await findPreferenceForSource(
      userId,
      kind,
      entityKeyInfo.normalized
    );

    if (!sourcePref) {
      console.warn(
        `[RegenerateSlots] ❌ Source not found for user ${userId}, kind: ${kind}, entityKey: ${entityKey || 'none'}, normalizedKey: ${entityKeyInfo.normalized || 'none'}`
      );
      return;
    }

    console.log(
      `[RegenerateSlots] ✅ Found source preference: id=${sourcePref.id}, entityKey=${sourcePref.entityKey || 'none'}, enabled=${sourcePref.enabled}, meta=${JSON.stringify(sourcePref.meta)}`
    );

    // ВАЖНО: Отслеживаем использованные ТЕКСТЫ (raw-тексты) для предотвращения дублирования
    // Используем хеши и raw-тексты для единообразной проверки
    const usedTextsInCurrentGeneration = new Set<string>();

    // Получаем timezone и преобразуем текущее время в локальное
    // ВАЖНО: Если timezone не указан, используем Europe/Moscow как fallback для российского приложения
    const timezone = sourcePref.timezone || 'Europe/Moscow';
    const nowUTC = new Date();
    const nowLocal = toLocalTime(nowUTC, timezone);

    // Удаляем только слоты для этого источника через репозиторий
    // КРИТИЧЕСКИ ВАЖНО: Удаляем ТОЛЬКО слоты со статусом 'planned' и scheduledAt > now
    // Отправленные слоты (status: 'sent') НИКОГДА не должны удаляться или изменяться
    // В репозиторий передаём UTC время (так как в БД хранится UTC)
    const deletedCount = await deletePlannedFutureSlotsForSource(
      userId,
      kind,
      entityKeyInfo.normalized,
      nowUTC
    );

    console.log(
      `[RegenerateSlots] Removed ${deletedCount} old PLANNED slots for source: user ${userId}, kind: ${kind}, entityKey: ${entityKey || 'none'}, timezone: ${timezone}, current time: UTC=${nowUTC.toISOString()}, Local=${nowLocal.toISOString()}`
    );

    // Если источник отключен, просто удаляем его слоты (уже удалили выше)
    if (!sourcePref.enabled) {
      console.log(
        `[RegenerateSlots] Source disabled, no new slots created: user ${userId}, kind: ${kind}`
      );
      return;
    }

    // Получаем все активные preferences для расчета общего количества уведомлений через репозиторий
    const allPrefs = await findEnabledPreferencesByUser(userId);

    if (allPrefs.length === 0) {
      console.log(`[RegenerateSlots] No active preferences for user ${userId}`);
      return;
    }

    // Получаем глобальные настройки пользователя
    const [globalPrefs] = await db
      .select()
      .from(userPreferences)
      .where(eq(userPreferences.userId, userId))
      .limit(1);

    const addressing = globalPrefs?.addressing || 'informal';
    const [userRecord] = await db
      .select({ name: users.name })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);
    const userName = userRecord?.name ?? null;

    // Получаем intent для этого источника
    let intent: 'build' | 'quit' | undefined;
    if (kind === 'habits' && entityKey) {
      if (isCustomEntity) {
        // Кастомная привычка - получаем intent из БД
        const [customHabit] = await db
          .select()
          .from(habits)
          .where(and(eq(habits.id, entityKey), eq(habits.userId, userId)))
          .limit(1);
        if (customHabit) {
          intent =
            customHabit.intent === 'build' || customHabit.intent === 'quit'
              ? customHabit.intent
              : 'build';
          if (DEBUG_NOTIFICATIONS) {
            console.log(
              `[RegenerateSlots] ✅ Found custom habit: entityKey="${entityKey}", intent=${intent} (name: "${customHabit.name}")`
            );
          }
        }
      } else {
        // Готовый шаблон - получаем intent из каталога
        const catalogHabit = findHabitByKey(entityKey);
        if (catalogHabit) {
          intent = catalogHabit.intent;
          if (DEBUG_NOTIFICATIONS) {
            console.log(
              `[RegenerateSlots] ✅ Found in catalog: entityKey="${entityKey}", intent=${intent} (name: "${catalogHabit.name}")`
            );
          }
        }
      }
    }

    // Генерируем временные метки для нового источника
    // timezone уже получен выше
    const activeDays = (sourcePref.activeDays as number[]) ?? [
      0, 1, 2, 3, 4, 5, 6,
    ];
    const timeRangeStart = sourcePref.timeRangeStart ?? 540; // 09:00
    const timeRangeEnd = sourcePref.timeRangeEnd ?? 1350; // 22:30
    const customSlotTimes =
      (sourcePref.customSlotTimes as (number | null)[] | null) ?? null;
    let newSlotTimes = generateSlotTimes(
      sourcePref.timesPerDay,
      timezone,
      SCHEDULE_CONFIG.horizonDays,
      activeDays,
      timeRangeStart,
      timeRangeEnd,
      customSlotTimes,
      SCHEDULE_CONFIG.jitterMinutes
    );

    // ВАЖНО: Сортируем слоты по времени для детерминированного порядка
    // Это обеспечит одинаковый slotIndex для одного и того же времени при каждой регенерации
    newSlotTimes.sort((a, b) => a.getTime() - b.getTime());

    if (DEBUG_NOTIFICATIONS) {
      console.log(
        `[RegenerateSlots] Generated ${newSlotTimes.length} time slots for regeneration: user ${userId}, kind: ${kind}, timesPerDay: ${sourcePref.timesPerDay}, timezone: ${timezone}, activeDays: ${activeDays.join(',')}, timeRange: ${timeRangeStart}-${timeRangeEnd}`
      );
    }

    if (newSlotTimes.length === 0) {
      console.warn(
        `[RegenerateSlots] ⚠️ No time slots generated! This might be due to invalid time range or active days. user ${userId}, kind: ${kind}`
      );
      return;
    }

    // Определяем фактический subtype
    // Для кастомных привычек subtype всегда null, не обрабатываем его
    let actualSubtype = sourcePref.subtype;

    console.log(
      `[RegenerateSlots] 🔍 Subtype determination: sourcePref.subtype=${sourcePref.subtype}, initial actualSubtype=${actualSubtype}, kind=${kind}, entityKey=${entityKey || 'none'}`
    );

    // ВАЖНО: Для детерминированного выбора subtype при 'mixed' используем дату и userId
    // Это обеспечит одинаковый выбор при каждой регенерации для одного пользователя
    if (!isCustomEntity) {
      // Для готовых шаблонов обрабатываем 'mixed' и fallback для quit-привычек
      if (sourcePref.subtype === 'mixed') {
        const subtypes: Array<'reminder' | 'informational' | 'motivational'> = [
          'reminder',
          'informational',
          'motivational',
        ];
        // Детерминированный выбор на основе userId и даты (для стабильности)
        // Используем UTC дату для детерминированности (не зависит от timezone)
        const dayOfYear = computeDayOfYear(nowUTC);
        const deterministicIndex = (userId + dayOfYear) % subtypes.length;
        actualSubtype = subtypes[deterministicIndex];
        console.log(
          `[RegenerateSlots] 🔍 Deterministic subtype selection for 'mixed': userId=${userId}, dayOfYear=${dayOfYear}, selected=${actualSubtype}, kind=${kind}, entityKey=${entityKey || 'none'}`
        );
      }

      if (
        kind === 'habits' &&
        intent === 'quit' &&
        actualSubtype === 'reminder'
      ) {
        // Детерминированный выбор для quit-привычек
        // Используем UTC дату для детерминированности (не зависит от timezone)
        const dayOfYear = computeDayOfYear(nowUTC);
        const deterministicChoice = (userId + dayOfYear) % 2;
        actualSubtype =
          deterministicChoice === 0 ? 'informational' : 'motivational';
        console.log(
          `[RegenerateSlots] Deterministic subtype selection for quit habit: userId=${userId}, dayOfYear=${dayOfYear}, selected=${actualSubtype}`
        );
      }
    }
    // Для кастомных привычек actualSubtype остается null

    // Загружаем глобальные настройки пользователя для хеширования
    const [userPrefs] = await db
      .select()
      .from(userPreferences)
      .where(eq(userPreferences.userId, userId))
      .limit(1);

    const tone = (userPrefs?.tone as any) || 'neutral';
    const addressingForHash = (userPrefs?.addressing as any) || 'informal';

    // Загружаем данные о сущности для хеширования (если нужно)
    let entityName = '';
    let entityDescription: string | null = null;

    if (kind === 'habits' && entityKey) {
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
        // Кастомная привычка
        entityName = habit.name;
        entityDescription = habit.description;
        console.log(
          `[RegenerateSlots] Found custom habit for entityName: id=${habit.id}, name="${habit.name}", entityKey param=${entityKey}`
        );
      } else {
        // Готовый шаблон привычки (water, meditation, training и т.д.)
        // ВАЖНО: Используем читаемое название из каталога, чтобы хеш совпадал с генерацией
        const catalogHabit = findHabitByKey(entityKey);
        if (catalogHabit) {
          entityName = catalogHabit.name;
          entityDescription = catalogHabit.description || null;
          console.log(
            `[RegenerateSlots] Template habit: entityKey=${entityKey}, name="${catalogHabit.name}" (from catalog)`
          );
        } else {
          // Fallback: если не найден в каталоге, используем entityKey
          entityName = entityKey;
          entityDescription = null;
          console.log(
            `[RegenerateSlots] Template habit: entityKey=${entityKey} (not found in catalog, using as entityName)`
          );
        }
      }
    } else if (kind === 'therapy' && entityKey) {
      // Для терапии загружаем из therapyTopicsCustom если это кастомная тема
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
        // Для готовых шаблонов используем entityKey как имя
        entityName = entityKey;
      }
    }

    // Определяем режим генерации
    const prefMeta =
      (sourcePref.meta as NotificationPreferenceMeta | null) ?? null;
    // isCustomEntity уже определен выше

    // Проверяем, что prefMeta существует и содержит нужные поля
    let textSource: 'templates' | 'ai' | 'hybrid' | undefined = undefined;

    if (prefMeta && typeof prefMeta === 'object' && 'textSource' in prefMeta) {
      textSource = prefMeta.textSource as
        | 'templates'
        | 'ai'
        | 'hybrid'
        | undefined;
    }

    // Если textSource не определен, используем 'templates' по умолчанию
    if (!textSource) {
      textSource = 'templates';
    }

    // ВАЖНО: Логируем для диагностики
    console.log(
      `[RegenerateSlots] Meta extraction: prefMeta=${JSON.stringify(prefMeta)}, prefMeta type=${typeof prefMeta}, isCustomEntity=${isCustomEntity}, textSource=${textSource}`
    );

    // ВАЖНО: Дополнительная проверка - если prefMeta не распарсился, логируем предупреждение
    if (
      !prefMeta &&
      (isCustomEntity ||
        (kind === 'habits' && entityKey) ||
        (kind === 'therapy' && entityKey))
    ) {
      console.warn(
        `[RegenerateSlots] ⚠️ WARNING: prefMeta is null/undefined but entity might need it! user ${userId}, kind: ${kind}, isCustomEntity: ${isCustomEntity}, sourcePref.meta raw: ${JSON.stringify(sourcePref.meta)}`
      );
    }

    // Логируем для отладки
    if (DEBUG_NOTIFICATIONS) {
      console.log(`[RegenerateSlots] ========== REGENERATING SLOTS ==========`);
    }
    console.log(
      `[RegenerateSlots] Regenerating slots: user ${userId}, kind: ${kind}, isCustomEntity: ${isCustomEntity}, intent: ${intent}, textSource: ${textSource}, entityKey: ${entityKey || 'none'} (should be readable), meta: ${JSON.stringify(prefMeta)}`
    );

    // Загружаем AI-тексты если нужно (один раз для всех слотов)
    let aiTexts: string[] | null = null;
    let configHash: string | null = null; // Объявляем configHash вне блока для доступности
    console.log(
      `[RegenerateSlots] 🔍 Checking if AI texts should be loaded: textSource=${textSource}, entityName="${entityName}", isCustomEntity=${isCustomEntity}`
    );

    if ((textSource === 'ai' || textSource === 'hybrid') && entityName) {
      const effectiveTextSource: 'ai' | 'hybrid' =
        textSource === 'ai' ? 'ai' : 'hybrid';

      console.log(
        `[RegenerateSlots] 🔍 AI texts loading condition met: effectiveTextSource=${effectiveTextSource}, entityName="${entityName}"`
      );

      // Для хеша используем subtype из настроек
      // Для кастомных привычек subtype всегда null
      // Для готовых шаблонов может быть 'mixed', 'reminder', 'informational', 'motivational'
      // Это важно, чтобы хеш был стабильным и совпадал с хешем в API endpoint
      // actualSubtype используется только для выбора шаблонов, но не для хеша
      const subtypeForHash = isCustomEntity
        ? null
        : (sourcePref.subtype as
            | 'reminder'
            | 'informational'
            | 'motivational'
            | 'mixed'
            | null);

      configHash = computeGenerationConfigHash({
        entityName,
        entityDescription,
        tone,
        addressing: addressingForHash,
        directness: sourcePref.directness as 'soft' | 'moderate' | 'hard',
        subtype: subtypeForHash,
        textSource: effectiveTextSource,
        kind: kind as 'habits' | 'therapy',
        habitIntent: kind === 'habits' ? intent || null : null, // Включаем intent только для habits
      });

      console.log(
        `[RegenerateSlots] 🔍 Computed config hash: ${configHash.substring(0, 8)}..., entityName: ${entityName}, entityDescription: ${entityDescription || 'null'}, directness: ${sourcePref.directness}, subtypeForHash: ${subtypeForHash}, actualSubtype: ${actualSubtype}, textSource: ${effectiveTextSource}, kind: ${kind}, preferenceId: ${sourcePref.id}, isCustomEntity: ${isCustomEntity}`
      );

      console.log(
        `[RegenerateSlots] 🔍 Loading AI texts: userId=${userId}, preferenceId=${sourcePref.id}, configHash=${configHash.substring(0, 8)}..., entityName="${entityName}", entityDescription="${entityDescription || 'null'}"`
      );

      // ВАЖНО: Проверяем, что все параметры правильные перед загрузкой
      if (!entityName) {
        console.error(
          `[RegenerateSlots] ❌ ERROR: entityName is empty! Cannot load AI texts. userId=${userId}, preferenceId=${sourcePref.id}, kind=${kind}, entityKey=${entityKey || 'none'}, isCustomEntity=${isCustomEntity}`
        );
      }

      aiTexts = await loadAiGeneratedTexts(userId, sourcePref.id, configHash);

      // ВАЖНО: Если AI-тексты не найдены, проверяем, может ли быть проблема с configHash
      if (!aiTexts || aiTexts.length === 0) {
        console.warn(
          `[RegenerateSlots] ⚠️ AI texts not found. Checking if there are any AI texts for this preference with different hash...`
        );
        // Проверяем, есть ли вообще AI-тексты для этого preferenceId
        const allAiTexts = await db
          .select()
          .from(aiGeneratedNotificationTexts)
          .where(
            and(
              eq(aiGeneratedNotificationTexts.userId, userId),
              eq(aiGeneratedNotificationTexts.preferenceId, sourcePref.id)
            )
          );
        if (allAiTexts.length > 0) {
          console.warn(
            `[RegenerateSlots] ⚠️ Found ${allAiTexts.length} AI text record(s) for this preference, but with different hash(es): ${allAiTexts.map((r) => r.generationConfigHash?.substring(0, 8) || 'no hash').join(', ')}. Current hash: ${configHash.substring(0, 8)}...`
          );
          console.warn(
            `[RegenerateSlots] ⚠️ This suggests that configHash mismatch! Check entityName, entityDescription, directness, subtype, textSource, kind.`
          );
        } else {
          console.warn(
            `[RegenerateSlots] ⚠️ No AI texts found at all for this preference. AI texts may not have been generated yet.`
          );
        }
      }

      // Логируем для отладки
      if (aiTexts && aiTexts.length > 0) {
        console.log(
          `[RegenerateSlots] ✅ Loaded ${aiTexts.length} AI texts for user ${userId}, preferenceId: ${sourcePref.id}, configHash: ${configHash.substring(0, 8)}..., kind: ${kind}, entityName: ${entityName}`
        );
        console.log(
          `[RegenerateSlots] ✅ First 3 AI texts: ${aiTexts
            .slice(0, 3)
            .map((t) => `"${t.substring(0, 30)}..."`)
            .join(', ')}`
        );

        // Проверяем статус пула текстов (только логирование, без запуска догенерации)
        try {
          const textsPerDay = sourcePref.timesPerDay || 3;
          const poolStatus = await checkAndRefillTextPool(
            userId,
            sourcePref.id,
            configHash,
            textsPerDay
          );

          console.log(
            `[RegenerateSlots] 📊 Pool status: ${poolStatus.availableTexts}/${poolStatus.totalTexts} available, ${poolStatus.daysRemaining} days remaining, used: ${poolStatus.usedTexts}`
          );

          if (poolStatus.needsRefill) {
            console.warn(
              `[RegenerateSlots] ⚠️ Pool needs refill (${poolStatus.daysRemaining} days left), but skipping auto-refill. Worker will handle it.`
            );
          }
        } catch (error) {
          console.error(
            `[RegenerateSlots] ❌ Error checking pool status:`,
            error
          );
          // Не прерываем выполнение, так как это только проверка
        }
      } else {
        console.warn(
          `[RegenerateSlots] ⚠️ No AI texts found for user ${userId}, preferenceId: ${sourcePref.id}, configHash: ${configHash.substring(0, 8)}..., textSource: ${textSource}, entityName: ${entityName}, kind: ${kind}, entityKey: ${entityKey || 'none'}`
        );
        console.warn(
          `[RegenerateSlots] ⚠️ This might mean AI texts were not generated yet. Check if generateNotificationTexts was called.`
        );
      }
    } else {
      console.log(
        `[RegenerateSlots] 🔍 AI texts NOT loaded: textSource=${textSource}, entityName="${entityName}", condition check: textSource in ['ai','hybrid']=${textSource === 'ai' || textSource === 'hybrid'}, entityName exists=${!!entityName}`
      );
    }

    // Создаём новые слоты для этого источника
    // ВАЖНО: Отслеживаем использованные тексты как в БД, так и в рамках текущей генерации
    let slotsCreated = 0;
    let slotsSkipped = 0;
    let slotIndex = 0; // Индекс слота для детерминированного чередования в гибридном режиме

    // Загружаем использованные индексы и хеши из БД (для предотвращения повторений между генерациями)
    let aiTextRecordId: number | null = null;
    let usedAiTextIndicesFromDb = new Set<number>();
    let usedAiTextHashesFromDb = new Set<string>();
    if (
      aiTexts &&
      aiTexts.length > 0 &&
      (textSource === 'ai' || textSource === 'hybrid') &&
      configHash
    ) {
      const aiTextRecord = await loadAiGeneratedTextsWithId(
        userId,
        sourcePref.id,
        configHash
      );
      if (aiTextRecord) {
        aiTextRecordId = aiTextRecord.id;
        usedAiTextIndicesFromDb = await getUsedTextIndices(aiTextRecord.id);
        usedAiTextHashesFromDb = await getUsedTextHashes(aiTextRecord.id);
        console.log(
          `[RegenerateSlots] 📊 Loaded ${usedAiTextIndicesFromDb.size} used text indices and ${usedAiTextHashesFromDb.size} used text hashes from DB for aiTextId=${aiTextRecord.id}`
        );
      }
    }

    // Загружаем тексты из notification_texts через сервис
    // Используем нормализованный entityKey из entityKeyInfo
    const normalizedEntityKey = normalizedEntityKeyForSlot;
    const directnessForFilter = sourcePref.directness as
      | 'soft'
      | 'moderate'
      | 'hard';
    const addressingForFilter = addressingForHash as 'informal' | 'formal';

    let loadedTexts: LoadedTexts;
    if (!normalizedEntityKey) {
      console.warn(
        `[RegenerateSlots] ⚠️ normalizedEntityKey is null/undefined, skipping template texts load`
      );
      loadedTexts = {
        texts: [],
        hasUserTexts: false,
        hasDefaultTexts: false,
      };
    } else {
      // Загружаем тексты через сервис (объединяет дефолтные и кастомные)
      loadedTexts = await loadTextsForPreference({
        userId,
        kind,
        entityKey: normalizedEntityKey,
        directness: directnessForFilter,
        addressing: addressingForFilter,
        intent: intent || null,
        subtype: (actualSubtype as NotificationSubtype | null) || null,
      });
    }

    const templateTexts = loadedTexts.texts;

    if (DEBUG_NOTIFICATIONS) {
      console.log(
        `[RegenerateSlots] 📝 Loaded ${templateTexts.length} template texts from DB for kind=${kind}, entityKey=${normalizedEntityKey || 'none'}, directness=${directnessForFilter}, addressing=${addressingForFilter}, actualSubtype=${actualSubtype || 'null'}, userId=${userId}, userTextsCount=${loadedTexts.texts.filter((t) => t.source === 'user').length}, defaultTextsCount=${loadedTexts.texts.filter((t) => t.source === 'default').length}`
      );

      // Детальное логирование для отладки
      if (templateTexts.length > 0) {
        console.log(
          `[RegenerateSlots] 📊 Texts breakdown: ${loadedTexts.texts.filter((t) => t.source === 'default').length} default + ${loadedTexts.texts.filter((t) => t.source === 'user').length} user texts (unified)`
        );
        console.log(
          `[RegenerateSlots] 📋 Sample texts:`,
          templateTexts.slice(0, 5).map((t) => ({
            id: t.id.substring(0, 8),
            source: t.source,
            text: t.text.substring(0, 30) + '...',
          }))
        );
      }
    }

    if (templateTexts.length === 0) {
      console.warn(
        `[RegenerateSlots] ⚠️ No texts found! Filters: entityKey=${normalizedEntityKey}, directness=${directnessForFilter}, addressing=${addressingForFilter}, actualSubtype=${actualSubtype || 'null'}, userId=${userId}. Slot will be skipped.`
      );
    }

    // Отслеживаем использованные AI-тексты и templateTexts в рамках текущей генерации
    // Это предотвращает повторение текстов, пока не будут использованы все доступные
    // Объединяем с индексами и хешами из БД
    // УНИФИЦИРОВАННАЯ ЛОГИКА: для всех типов текстов используем хеш + индекс + Set текстов
    const usedAiTextIndices = new Set<number>(usedAiTextIndicesFromDb);
    const usedAiTextHashes = new Set<string>(usedAiTextHashesFromDb); // Хеши для проверки дубликатов по содержимому
    const usedTemplateTextIndices = new Set<number>();
    const usedTemplateTextHashes = new Set<string>(); // Хеши для шаблонов (унифицированная логика)

    // Инициализируем состояние для выбора текста
    const textSelectionState: TextSelectionState = {
      usedTexts: usedTextsInCurrentGeneration,
      usedTemplateIndices: usedTemplateTextIndices,
      usedTemplateHashes: usedTemplateTextHashes,
      usedAiIndices: usedAiTextIndices,
      usedAiHashes: usedAiTextHashes,
    };

    if (DEBUG_NOTIFICATIONS) {
      console.log(
        `[RegenerateSlots] ========== STARTING SLOT CREATION ==========`
      );
      console.log(
        `[RegenerateSlots] Starting slot creation loop: ${newSlotTimes.length} time slots, isCustomEntity: ${isCustomEntity}, textSource: ${textSource}, templateTexts count: ${templateTexts.length}, aiTexts count: ${aiTexts?.length || 0}`
      );
      console.log(
        `[RegenerateSlots] 🔍 AI texts status: ${aiTexts ? `LOADED [${aiTexts.length} texts]` : 'NOT LOADED (null)'}`
      );
      console.log(
        `[RegenerateSlots] 🔍 Template texts: ${templateTexts.length} texts available`
      );
    }

    // Создаём слоты используя text-selection.service.ts
    for (const scheduledAt of newSlotTimes) {
      slotIndex += 1;
      if (DEBUG_NOTIFICATIONS) {
        console.log(
          `[RegenerateSlots] ========== PROCESSING SLOT ${slotIndex}/${newSlotTimes.length} ==========`
        );
      }

      // Используем pickTextForSlot для выбора текста
      const pickParams: PickTextParams = {
        slotIndex,
        textSource,
        isCustomEntity,
        templateTexts: templateTexts.map((t) => ({ id: t.id, text: t.text })),
        aiTexts,
        userName,
      };

      const pickResult = pickTextForSlot(textSelectionState, pickParams);

      if (!pickResult) {
        console.warn(
          `[RegenerateSlots] ❌ No text found for slot ${slotIndex}, skipping`
        );
        slotsSkipped += 1;
        continue;
      }

      const { text, templateIdForSlot, selectedAiTextIndex, templateIndex } =
        pickResult;

      const isDevelopment = process.env.NODE_ENV !== 'production';
      let devPrefix = '';
      // Используем entityDisplayName для кастомных сущностей, entityKey для шаблонов
      const displayNameForPrefix = isCustomEntity
        ? entityName
        : entityKey || 'unknown';
      if (isDevelopment) {
        const habitLabel = displayNameForPrefix || 'unknown';
        // Кастомная привычка определяется по isCustomEntity (найдена в БД)
        const subtypeLabel = actualSubtype
          ? actualSubtype.toUpperCase()
          : isCustomEntity
            ? 'CUSTOM'
            : 'N/A';
        devPrefix = `[${habitLabel}|${subtypeLabel}|${sourcePref.directness.toUpperCase()}] `;
      }

      // Определяем, является ли текст AI-сгенерированным
      const isAiGenerated = templateIdForSlot === 'ai_generated';

      // ВАЖНО: Используем одно и то же значение для колонки БД и payload JSON
      // Для кастомных сущностей = ID, для шаблонных = ключ шаблона
      const finalEntityKey = normalizedEntityKeyForSlot ?? entityKey ?? null;

      const payload: NotificationPayload = {
        title: 'Mentai: время паузы',
        body: `${devPrefix}${text}`,
        templateId: templateIdForSlot,
        action: 'open',
        deepLink: kind === 'therapy' ? '/support' : '/habits',
        data: {
          kind: kind as NotificationKind,
          entityKey: finalEntityKey ?? undefined, // Используем то же значение, что и в колонке БД
          entityDisplayName: entityName || undefined, // Читаемое название для удобства разработчиков
          slotId: '',
          isAiGenerated,
          ...(isDevelopment && {
            subtype: actualSubtype,
            directness: sourcePref.directness,
          }),
        },
      };

      const slotId = nanoid();
      payload.data!.slotId = slotId;

      // Финальный лог перед созданием слота
      if (DEBUG_NOTIFICATIONS) {
        console.log(
          `[RegenerateSlots] 🎯 FINAL SLOT CREATION - Slot ${slotIndex}: templateId="${templateIdForSlot}", isAiGenerated=${templateIdForSlot === 'ai_generated'}, text="${text ? text.substring(0, 60) : 'null'}...", scheduledAt=${scheduledAt.toISOString()}`
        );
      }

      // ВАЖНО: Используем то же значение, что и в payload.data.entityKey
      // Передаем timezone в insertSlot для правильного преобразования UTC в локальное время
      await insertSlot(
        {
          id: slotId,
          userId,
          kind: sourcePref.kind as NotificationKind,
          entityKey: finalEntityKey,
          entityDisplayName: entityName || null, // Читаемое название для удобства разработчиков
          scheduledAt, // UTC время для логики
          payload,
          templateId: templateIdForSlot,
          status: 'planned',
        },
        timezone
      );

      // Сохраняем информацию об использовании AI-текста в БД
      if (
        templateIdForSlot === 'ai_generated' &&
        selectedAiTextIndex !== null &&
        aiTextRecordId !== null &&
        aiTexts &&
        aiTexts[selectedAiTextIndex]
      ) {
        try {
          // ВАЖНО: Хеш вычисляем от исходного текста, а не от отформатированного
          // Имя пользователя - переменная часть, не должна влиять на проверку дубликатов
          const rawText = aiTexts[selectedAiTextIndex];
          await db.insert(aiNotificationTextUsage).values({
            aiTextId: aiTextRecordId,
            slotId,
            textIndex: selectedAiTextIndex,
            textHash: hashNotificationText(rawText),
          });
          if (DEBUG_NOTIFICATIONS) {
            console.log(
              `[RegenerateSlots] ✅ Saved text usage: aiTextId=${aiTextRecordId}, slotId=${slotId}, index=${selectedAiTextIndex}`
            );
          }
        } catch (error) {
          console.error(
            `[RegenerateSlots] ❌ Failed to save text usage:`,
            error
          );
          // Не прерываем выполнение, так как слот уже создан
        }
      }

      slotsCreated += 1;
      if (DEBUG_NOTIFICATIONS) {
        console.log(
          `[RegenerateSlots] ✅ Created slot ${slotsCreated}: id=${slotId}, entityKey=${normalizedEntityKeyForSlot || entityKey || 'null'}, templateId=${templateIdForSlot}, scheduledAt=${scheduledAt.toISOString()}`
        );
      }
    }

    if (DEBUG_NOTIFICATIONS) {
      console.log(
        `[RegenerateSlots] ========== SLOT CREATION SUMMARY ==========`
      );
      console.log(
        `[RegenerateSlots] 📊 Statistics: isCustomEntity=${isCustomEntity}, textSource=${textSource}, aiTexts loaded=${aiTexts ? aiTexts.length : 0}, templateTexts count=${templateTexts.length}`
      );
      console.log(
        `[RegenerateSlots] ========== END SLOT REGENERATION ==========`
      );
    }

    console.log(
      `[RegenerateSlots] ✅ Regenerated slots for source: user ${userId}, kind: ${kind}, created: ${slotsCreated}, skipped: ${slotsSkipped}, total time slots: ${newSlotTimes.length}`
    );
  } catch (error) {
    console.error(
      `[RegenerateSlots] ❌ Error during slot regeneration: user ${userId}, kind: ${kind}, entityKey: ${entityKey || 'none'}`,
      error
    );
    throw error;
  }
}
