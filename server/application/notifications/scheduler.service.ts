/**
 * Сервис планировщика уведомлений
 * Генерирует слоты на 1 день вперёд с глобальной оркестрацией
 *
 * TODO: Установить BullMQ и Redis для продакшена
 * npm install bullmq ioredis
 *
 * В MVP можно использовать простой cron через node-cron или встроенный setInterval
 */

import { eq, and, gt, gte, isNull, desc, asc, count, or } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import { db } from '@/server/infrastructure/db/client';
import {
  notificationPreferences,
  notificationSlots,
  userPreferences,
  habits,
  therapyTopicsCustom,
  users,
  aiNotificationTextUsage,
  aiGeneratedNotificationTexts,
} from '@/server/infrastructure/db/schema';
import {
  findTemplate,
  getTemplateText,
  type NotificationKind,
} from '@/app/lib/notificationTemplates';
import type {
  NotificationPayload,
  NotificationPreferenceMeta,
  NotificationSubtype,
} from '@/shared/dto/notifications';
import {
  pickCustomTextFromMeta,
  formatNotificationTextWithName,
} from '@/shared/utils/notificationText';
import {
  loadAiGeneratedTexts,
  loadAiGeneratedTextsWithId,
  getUsedTextIndices,
  getUsedTextHashes,
  hashNotificationText,
  checkAndRefillTextPool,
  type PoolStatus,
} from '@/server/application/notifications/ai-generation.service';
import { computeGenerationConfigHash } from '@/server/utils/notification-ai-config-hash';
import { findHabitByKey } from '@/app/lib/habitsCatalog';

// ==========================================
// Конфигурация планировщика
// ==========================================

// Флаг для детального логирования (можно включить через DEBUG_NOTIFICATIONS=true)
const DEBUG_NOTIFICATIONS = process.env.DEBUG_NOTIFICATIONS === 'true';

// Защита от одновременных вызовов regenerateSlotsForSource для одного источника
// Ключ: `${userId}:${kind}:${entityKey || 'null'}`
// Значение: Promise<void> - промис выполняющейся операции
const activeRegenerations = new Map<string, Promise<void>>();

/**
 * Получает ключ для отслеживания активных регенераций
 */
function getRegenerationKey(
  userId: number,
  kind: NotificationKind,
  entityKey?: string
): string {
  return `${userId}:${kind}:${entityKey || 'null'}`;
}

const SCHEDULE_CONFIG = {
  horizonDays: 1, // Генерируем слоты на 1 день вперёд
  awakeWindowStart: '09:00', // Начало окна бодрствования (локальное время)
  awakeWindowEnd: '22:30', // Конец окна бодрствования (локальное время)
  jitterMinutes: 15, // Джиттер ±15 минут
  maxDailyCap: 100, // Максимальный лимит уведомлений в день (защита)
  minGapMinutes: 25, // Минимальный шаг между уведомлениями
};

// ==========================================
// УДАЛЕНО: Функция inferHabitKey была костылем
// Теперь используем только универсальные шаблоны для habits
// ==========================================

// ==========================================
// Отслеживание использованных шаблонов
// ==========================================

/**
 * Получает список недавно использованных template IDs для избежания повторений
 * @param userId - ID пользователя
 * @param kind - фокус уведомлений (therapy | habits)
 * @param options - дополнительные параметры фильтрации
 * @param lookbackDays - сколько дней назад проверять (по умолчанию 30)
 * @returns массив template IDs, которые были использованы недавно
 */
async function getRecentlyUsedTemplateIds(
  userId: number,
  kind: string,
  options?: {
    entityKey?: string | null;
  },
  lookbackDays = 30
): Promise<string[]> {
  const lookbackDate = new Date();
  lookbackDate.setDate(lookbackDate.getDate() - lookbackDays);

  // Строим условия для фильтрации
  // Важно: учитываем как 'sent', так и 'planned' слоты
  // 'planned' нужны, чтобы не повторять шаблоны из удалённых слотов
  const conditions = [
    eq(notificationSlots.userId, userId),
    eq(notificationSlots.kind, kind),
    gte(notificationSlots.scheduledAt, lookbackDate),
    or(
      eq(notificationSlots.status, 'sent'),
      eq(notificationSlots.status, 'planned')
    ),
  ];

  // Фильтруем по entityKey для более точного отслеживания
  if (options?.entityKey) {
    conditions.push(eq(notificationSlots.entityKey, options.entityKey));
  }

  // ВАЖНО: Увеличиваем лимит до 500, чтобы учесть все отправленные слоты за период
  // Это предотвращает дублирование текстов, которые уже были отправлены
  const recentSlots = await db
    .select({ templateId: notificationSlots.templateId })
    .from(notificationSlots)
    .where(and(...conditions))
    .orderBy(desc(notificationSlots.scheduledAt))
    .limit(500); // Увеличиваем лимит для более полного отслеживания

  // Возвращаем уникальные template IDs
  const templateIds = recentSlots
    .map((slot) => slot.templateId)
    .filter((id): id is string => id !== null);

  return [...new Set(templateIds)];
}

// ==========================================
// Глобальная оркестрация слотов
// ==========================================

/**
 * Генерирует ВСЕ слоты для пользователя с глобальной оркестрацией
 * Распределяет уведомления равномерно по дню независимо от источника
 * @param userId - ID пользователя
 */
export async function generateAllSlotsForUser(userId: number): Promise<void> {
  console.log(`[Scheduler] Starting global orchestration for user ${userId}`);

  // 1. Получаем ВСЕ активные preferences пользователя
  const allPrefs = await db
    .select()
    .from(notificationPreferences)
    .where(
      and(
        eq(notificationPreferences.userId, userId),
        eq(notificationPreferences.enabled, true)
      )
    );

  if (allPrefs.length === 0) {
    console.log(`[Scheduler] No active preferences for user ${userId}`);
    return;
  }

  // 2. Считаем общее количество уведомлений в день
  const totalPerDay = allPrefs.reduce((sum, p) => sum + p.timesPerDay, 0);

  console.log(
    `[Scheduler] User ${userId}: ${allPrefs.length} sources, ${totalPerDay} notifications/day`
  );

  // 3. Проверяем лимит
  if (totalPerDay > SCHEDULE_CONFIG.maxDailyCap) {
    throw new Error(
      `Too many notifications: ${totalPerDay} exceeds limit of ${SCHEDULE_CONFIG.maxDailyCap}`
    );
  }

  if (totalPerDay === 0) {
    console.log(`[Scheduler] User ${userId} has 0 notifications/day`);
    return;
  }

  // ВАЖНО: Вместо старой логики используем regenerateSlotsForSource для каждого источника
  // Это обеспечивает правильную поддержку AI-текстов и textSource
  // regenerateSlotsForSource сама удалит старые слоты и создаст новые с правильной логикой
  console.log(
    `[Scheduler] Using regenerateSlotsForSource for each source to support AI texts`
  );

  // Группируем preferences по источникам (kind + entityKey)
  const sourceMap = new Map<string, (typeof allPrefs)[0]>();
  for (const pref of allPrefs) {
    const sourceKey = `${pref.kind}:${pref.entityKey || 'null'}`;
    if (!sourceMap.has(sourceKey)) {
      sourceMap.set(sourceKey, pref);
    }
  }

  // Регенерируем слоты для каждого источника отдельно
  for (const pref of sourceMap.values()) {
    try {
      await regenerateSlotsForSource(userId, pref.kind as NotificationKind, {
        entityKey: pref.entityKey ?? undefined,
      });
    } catch (error) {
      console.error(
        `[Scheduler] Failed to regenerate slots for source: user ${userId}, kind: ${pref.kind}, entityKey: ${pref.entityKey || 'none'}`,
        error
      );
    }
  }

  // ВАЖНО: После генерации всех слотов проверяем и исправляем пересечения
  // Это предотвращает ситуацию, когда в одно время прилетает 2+ уведомлений
  await preventSimultaneousNotifications(userId);

  console.log(
    `[Scheduler] ✅ Generated slots for ${sourceMap.size} sources using regenerateSlotsForSource`
  );
}

// ==========================================
// Генерация слотов для конкретного источника (legacy, используется для совместимости)
// ==========================================

/**
 * Генерирует слоты уведомлений для конкретного типа (therapy | habits)
 * ⚠️ Deprecated: используйте generateAllSlotsForUser() для глобальной оркестрации
 * @param userId - ID пользователя
 * @param kind - фокус уведомлений
 * @param options - опциональные параметры (entityKey для идентификации источника)
 */
export async function generateSlotsForUser(
  userId: number,
  kind: NotificationKind,
  options?: {
    entityKey?: string;
  }
): Promise<void> {
  const { entityKey } = options || {};

  console.log(
    `[Scheduler] Generating slots for user ${userId}, kind: ${kind}`,
    entityKey ? `, entityKey: ${entityKey}` : ''
  );

  // 1. Получаем настройки пользователя с учётом entityKey
  // Строим WHERE условие правильно, объединяя все условия через and()
  const conditions = [
    eq(notificationPreferences.userId, userId),
    eq(notificationPreferences.kind, kind),
  ];

  if (entityKey) {
    // Настройки для конкретного источника
    conditions.push(eq(notificationPreferences.entityKey, entityKey));
  } else {
    // Общие настройки (без entityKey)
    conditions.push(isNull(notificationPreferences.entityKey));
  }

  const [prefs] = await db
    .select()
    .from(notificationPreferences)
    .where(and(...conditions))
    .limit(1);

  if (!prefs || !prefs.enabled) {
    console.log(
      `[Scheduler] Notifications disabled for user ${userId}, kind: ${kind}`
    );
    return;
  }

  // 2. Получаем глобальные настройки (addressing, tone)
  const [globalPrefs] = await db
    .select()
    .from(userPreferences)
    .where(eq(userPreferences.userId, userId))
    .limit(1);

  const addressing = globalPrefs?.addressing || 'informal';
  const tone = globalPrefs?.tone || 'neutral';
  const directness = prefs.directness;
  const [userRecord] = await db
    .select({ name: users.name })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  const userName = userRecord?.name ?? null;

  // 3. Удаляем старые запланированные слоты с учётом entityKey
  const now = new Date();
  const deleteConditions = [
    eq(notificationSlots.userId, userId),
    eq(notificationSlots.kind, kind),
    eq(notificationSlots.status, 'planned'),
    gt(notificationSlots.scheduledAt, now),
  ];

  if (entityKey) {
    deleteConditions.push(eq(notificationSlots.entityKey, entityKey));
  } else {
    // Если не указан entityKey, удаляем только слоты без entityKey
    deleteConditions.push(isNull(notificationSlots.entityKey));
  }

  await db.delete(notificationSlots).where(and(...deleteConditions));

  // 4. Получаем intent и entityDisplayName
  let intent: 'build' | 'quit' | undefined;
  let entityDisplayName: string | null = null; // Читаемое название для удобства разработчиков

  if (kind === 'habits' && entityKey) {
    // Проверяем, является ли entityKey кастомной привычкой (ID в БД)
    const [customHabit] = await db
      .select()
      .from(habits)
      .where(
        and(
          eq(habits.id, entityKey), // Для кастомных сущностей entityKey = ID
          eq(habits.userId, userId)
        )
      )
      .limit(1);

    if (customHabit) {
      // Это кастомная привычка пользователя
      intent =
        customHabit.intent === 'build' || customHabit.intent === 'quit'
          ? customHabit.intent
          : 'build'; // Fallback на 'build' если intent неожиданный
      entityDisplayName = customHabit.name;
      console.log(
        `[generateSlotsForUser] ✅ Found custom habit: entityKey="${entityKey}", intent=${intent} (name: "${customHabit.name}")`
      );
    } else {
      // Это готовый шаблон (water, meditation, nutrition и т.д.)
      // Пробуем найти в каталоге привычек (единый источник истины)
      const catalogHabit = findHabitByKey(entityKey);
      if (catalogHabit) {
        intent = catalogHabit.intent;
        entityDisplayName = catalogHabit.name;
        console.log(
          `[generateSlotsForUser] ✅ Found in catalog: entityKey="${entityKey}", intent=${intent} (name: "${catalogHabit.name}")`
        );
      } else {
        // Не найдено в каталоге - это несуществующий шаблон
        // Не устанавливаем intent, чтобы не фильтровать шаблоны
        intent = undefined;
        console.log(
          `[generateSlotsForUser] ⚠️ EntityKey="${entityKey}" not found in catalog, intent will be undefined`
        );
      }
    }
  } else if (kind === 'therapy' && entityKey) {
    // Для терапии также определяем entityDisplayName
    const [customTopic] = await db
      .select()
      .from(therapyTopicsCustom)
      .where(
        and(
          eq(therapyTopicsCustom.id, entityKey),
          eq(therapyTopicsCustom.userId, userId)
        )
      )
      .limit(1);
    if (customTopic) {
      entityDisplayName = customTopic.name;
    }
  }

  // 5. Генерируем новые слоты на horizonDays дней
  const activeDays = (prefs.activeDays as number[]) ?? [0, 1, 2, 3, 4, 5, 6];
  const timeRangeStart = prefs.timeRangeStart ?? 540; // 09:00
  const timeRangeEnd = prefs.timeRangeEnd ?? 1350; // 22:30
  const customSlotTimes =
    (prefs.customSlotTimes as (number | null)[] | null) ?? null;
  const slots = generateSlotTimes(
    prefs.timesPerDay,
    prefs.timezone,
    SCHEDULE_CONFIG.horizonDays,
    activeDays,
    timeRangeStart,
    timeRangeEnd,
    customSlotTimes
  );

  // 6. Создаём слоты в БД
  let customTextIndex = 0;
  for (const scheduledAt of slots) {
    const prefMeta = (prefs.meta as NotificationPreferenceMeta | null) ?? null;
    const customText =
      kind === 'habits' || kind === 'therapy'
        ? pickCustomTextFromMeta(prefMeta, userName, customTextIndex)
        : null;
    if (customText) {
      customTextIndex += 1;
    }

    let templateIdForSlot = 'custom_user_text';
    let text = customText;
    let template: ReturnType<typeof findTemplate> | null = null;

    if (!text) {
      // Подбираем случайный шаблон
      // addressing и tone больше не используются в фильтрации, берутся из БД для выбора текста
      template = findTemplate(kind, {
        entityKey: entityKey, // Универсальный идентификатор
        intent, // Только для habits (build/quit)
        subtype: prefs.subtype as NotificationSubtype | undefined,
      });

      if (!template) {
        console.warn(
          `[Scheduler] ❌ No template found for user ${userId}, kind=${kind}, entityKey=${entityKey || 'none'}, subtype=${prefs.subtype || 'none'}, intent=${intent || 'none'}`
        );
        continue;
      }

      templateIdForSlot = template.id;

      text = getTemplateText(
        template,
        addressing as any,
        directness as any,
        userName ?? undefined
      );
    }

    const payload: NotificationPayload = {
      title: 'Mentai: время паузы',
      body: text,
      templateId: templateIdForSlot,
      action: 'open',
      deepLink: kind === 'therapy' ? '/support' : '/habits',
      data: {
        kind,
        entityKey: entityKey ?? null,
        entityDisplayName: entityDisplayName ?? undefined, // Читаемое название для удобства разработчиков
        slotId: nanoid(), // будет переопределено ниже
      },
    };

    const slotId = nanoid();
    payload.data!.slotId = slotId;

    await db.insert(notificationSlots).values({
      id: slotId,
      userId,
      kind,
      entityKey: entityKey ?? null, // Универсальный идентификатор сущности
      entityDisplayName: entityDisplayName, // Читаемое название для удобства разработчиков
      scheduledAt,
      payload,
      templateId: templateIdForSlot,
      status: 'planned',
    });
  }

  console.log(
    `[Scheduler] Generated ${slots.length} slots for user ${userId}, kind: ${kind}`
  );
}

/**
 * Генерирует временные метки для слотов
 * @param timesPerDay - количество уведомлений в день
 * @param timezone - IANA timezone пользователя
 * @param days - количество дней вперёд
 * @param activeDays - массив активных дней недели (0 = Воскресенье, 1 = Понедельник, ..., 6 = Суббота)
 * @param timeRangeStart - начало временного окна в минутах (по умолчанию 540 = 09:00)
 * @param timeRangeEnd - конец временного окна в минутах (по умолчанию 1350 = 22:30)
 * @returns массив дат (UTC) для слотов
 */
function generateSlotTimes(
  timesPerDay: number,
  timezone: string,
  days: number,
  activeDays: number[] = [0, 1, 2, 3, 4, 5, 6],
  timeRangeStart: number = 540,
  timeRangeEnd: number = 1350,
  customSlotTimes: (number | null)[] | null = null
): Date[] {
  const slots: Date[] = [];
  const now = new Date();
  if (timesPerDay <= 0) {
    return slots;
  }

  for (let d = 0; d < days; d++) {
    const date = new Date(now);
    date.setDate(date.getDate() + d);

    // Проверяем, активен ли этот день недели
    const dayOfWeek = date.getDay(); // 0 = Воскресенье, 1 = Понедельник, ..., 6 = Суббота
    if (!activeDays.includes(dayOfWeek)) {
      continue; // Пропускаем этот день
    }

    // Вычисляем длительность окна
    let windowDuration: number;
    const crossesMidnight = timeRangeStart > timeRangeEnd;

    if (!crossesMidnight) {
      // Обычный диапазон внутри суток
      windowDuration = timeRangeEnd - timeRangeStart;
    } else {
      // Диапазон через полночь
      windowDuration = 1440 - timeRangeStart + timeRangeEnd;
    }

    const manualTimes = Array.isArray(customSlotTimes) ? customSlotTimes : [];

    for (let i = 0; i < timesPerDay; i++) {
      const manualValue = manualTimes[i];
      let slotMinutes: number;

      if (manualValue !== null && manualValue !== undefined) {
        // Приоритет: если задано ручное время, используем его
        slotMinutes = manualValue;
      } else {
        // Автоматическое равномерное распределение времени
        // Равномерно распределяем уведомления по всему диапазону
        // НЕ привязываем первое к началу и последнее к концу
        const step = windowDuration / (timesPerDay + 1); // Шаг между уведомлениями
        // Начинаем с небольшого отступа от начала, чтобы не было навязчивости
        slotMinutes = timeRangeStart + step * (i + 1);

        // Нормализуем для диапазона через полночь
        if (crossesMidnight && slotMinutes >= 1440) {
          slotMinutes = slotMinutes % 1440;
        }

        // Применяем джиттер ко всем уведомлениям (кроме ручных) для естественности
        // Это предотвращает навязчивость и делает распределение более естественным
        const jitter = (Math.random() * 2 - 1) * SCHEDULE_CONFIG.jitterMinutes;
        slotMinutes += jitter;

        // Нормализуем время с учетом перехода через полночь
        slotMinutes = Math.round(slotMinutes);

        // Если диапазон через полночь, нормализуем минуты
        if (slotMinutes >= 1440) {
          slotMinutes = slotMinutes % 1440;
        }
        if (slotMinutes < 0) {
          slotMinutes = (slotMinutes % 1440) + 1440;
        }

        // ВАЖНО: Ограничиваем временным окном - не выходим за границы диапазона
        if (!crossesMidnight) {
          // Обычный диапазон: ограничиваем между start и end
          slotMinutes = Math.max(
            timeRangeStart,
            Math.min(timeRangeEnd, slotMinutes)
          );
        } else {
          // Диапазон через полночь: разрешены значения >= start ИЛИ <= end
          if (slotMinutes < timeRangeStart && slotMinutes > timeRangeEnd) {
            // Попали в запрещенный промежуток - сдвигаем к ближайшей границе
            const distToStart = (timeRangeStart - slotMinutes + 1440) % 1440;
            const distToEnd = (slotMinutes - timeRangeEnd + 1440) % 1440;
            slotMinutes =
              distToStart < distToEnd ? timeRangeStart : timeRangeEnd;
          }
        }
      }

      const slotHour = Math.floor(slotMinutes / 60);
      const slotMin = slotMinutes % 60;

      // Создаём дату в локальном времени пользователя
      // TODO: использовать библиотеку типа date-fns-tz для правильной работы с TZ
      const slot = new Date(date);
      slot.setHours(slotHour, slotMin, 0, 0);

      // Если диапазон через полночь и время раньше timeRangeEnd, добавляем день
      if (crossesMidnight && slotMinutes < timeRangeEnd) {
        slot.setDate(slot.getDate() + 1);
      }

      // Пропускаем слоты в прошлом
      if (slot > now) {
        slots.push(slot);
      }
    }
  }

  return slots;
}

/**
 * Проверяет, нужна ли регенерация слотов для пользователя
 * @param userId - ID пользователя
 * @returns true если нужно регенерировать слоты
 */
export async function needsSlotRegeneration(userId: number): Promise<boolean> {
  const now = new Date();
  const today = new Date(now);
  today.setHours(0, 0, 0, 0); // Начало сегодняшнего дня

  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  tomorrow.setHours(0, 0, 0, 0); // Начало следующего дня

  // Проверяем, есть ли активные настройки
  const activePrefs = await db
    .select()
    .from(notificationPreferences)
    .where(
      and(
        eq(notificationPreferences.userId, userId),
        eq(notificationPreferences.enabled, true)
      )
    );

  // Если нет активных настроек - регенерация не нужна
  if (activePrefs.length === 0) {
    return false;
  }

  // Подсчитываем ожидаемое количество слотов в день
  const expectedSlotsPerDay = activePrefs.reduce(
    (sum, p) => sum + p.timesPerDay,
    0
  );

  if (expectedSlotsPerDay === 0) {
    return false;
  }

  // Проверяем, есть ли у пользователя диапазон через полночь (ночной режим)
  // Для ночного режима генерация должна происходить через час после окончания второго диапазона
  let hasNightMode = false;
  let latestRangeEnd = 0; // Время окончания самого позднего диапазона в минутах

  for (const pref of activePrefs) {
    const timeRangeStart = pref.timeRangeStart ?? 540; // 09:00
    const timeRangeEnd = pref.timeRangeEnd ?? 1350; // 22:30
    const crossesMidnight = timeRangeStart > timeRangeEnd;

    if (crossesMidnight) {
      hasNightMode = true;
      // Для диапазона через полночь timeRangeEnd - это конец второго диапазона (например, 06:00 = 360 минут)
      // Нужно найти самое позднее время окончания
      if (timeRangeEnd > latestRangeEnd) {
        latestRangeEnd = timeRangeEnd;
      }
    } else {
      // Для обычного диапазона timeRangeEnd - это конец диапазона
      if (timeRangeEnd > latestRangeEnd) {
        latestRangeEnd = timeRangeEnd;
      }
    }
  }

  // Если есть ночной режим, проверяем, прошло ли уже час после окончания диапазона
  if (hasNightMode && latestRangeEnd > 0) {
    // TODO: Учесть таймзону пользователя (user.timezone) для корректной работы night mode
    // Сейчас используется локальное время сервера, что может привести к рассинхрону
    const currentMinutes = now.getHours() * 60 + now.getMinutes();
    const generationTime = latestRangeEnd + 60; // Через час после окончания (в минутах)

    // Нормализуем время генерации (может быть больше 1440 минут)
    const generationHour = Math.floor(generationTime / 60) % 24;
    const generationMin = generationTime % 60;

    // Создаем дату времени генерации для сегодня
    const generationDate = new Date(now);
    generationDate.setHours(generationHour, generationMin, 0, 0);

    // Если время генерации уже прошло сегодня, проверяем, нужно ли регенерировать
    if (now >= generationDate) {
      // Время генерации прошло - проверяем наличие слотов
      // Но только если прошло не более 2 часов (чтобы не регенерировать слишком часто)
      const hoursSinceGeneration =
        (now.getTime() - generationDate.getTime()) / (1000 * 60 * 60);
      if (hoursSinceGeneration <= 2) {
        // Проверяем наличие слотов на завтра
        const [result] = await db
          .select({ count: count() })
          .from(notificationSlots)
          .where(
            and(
              eq(notificationSlots.userId, userId),
              eq(notificationSlots.status, 'planned'),
              gte(notificationSlots.scheduledAt, tomorrow)
            )
          );

        const actualSlotsCount = result?.count || 0;

        // ВАЖНО: Не регенерируем если слотов достаточно (больше 80% от ожидаемого)
        // Это предотвращает ненужные регенерации когда слоты были отправлены
        const minRequiredSlots = Math.floor(expectedSlotsPerDay * 0.8);

        if (actualSlotsCount < minRequiredSlots) {
          console.log(
            `[Scheduler] User ${userId} (night mode) has ${actualSlotsCount} planned slots but needs at least ${minRequiredSlots} (expected: ${expectedSlotsPerDay}, generation time: ${generationHour}:${generationMin.toString().padStart(2, '0')}), regeneration needed`
          );
          return true;
        }

        // Если слотов достаточно, но немного меньше ожидаемого - это нормально
        if (actualSlotsCount < expectedSlotsPerDay) {
          console.log(
            `[Scheduler] User ${userId} (night mode) has ${actualSlotsCount} planned slots (expected: ${expectedSlotsPerDay}), but above minimum threshold (${minRequiredSlots}). No regeneration needed.`
          );
        }
      }
    }

    // Если время генерации еще не наступило, не регенерируем
    return false;
  }

  // Для обычного режима (без ночного) используем старую логику
  // Проверяем фактическое количество planned слотов на сегодня (если еще не поздно)
  // и на завтра
  const currentHour = now.getHours();
  const checkToday = currentHour < 22; // Проверяем сегодня только если раньше 22:00

  let checkFromDate = tomorrow;
  if (checkToday) {
    // Если еще рано, проверяем с сегодняшнего дня
    checkFromDate = today;
  }

  // Проверяем фактическое количество planned слотов начиная с checkFromDate
  const [result] = await db
    .select({ count: count() })
    .from(notificationSlots)
    .where(
      and(
        eq(notificationSlots.userId, userId),
        eq(notificationSlots.status, 'planned'),
        gte(notificationSlots.scheduledAt, checkFromDate)
      )
    );

  const actualSlotsCount = result?.count || 0;

  // Ожидаемое количество слотов зависит от того, проверяем ли мы сегодня или только завтра
  const expectedSlots = checkToday
    ? expectedSlotsPerDay * 2 // Сегодня + завтра
    : expectedSlotsPerDay; // Только завтра

  // ВАЖНО: Не регенерируем если слотов достаточно (больше 80% от ожидаемого)
  // Это предотвращает ненужные регенерации когда слоты были отправлены
  // или когда настройки не изменились
  const minRequiredSlots = Math.floor(expectedSlots * 0.8);

  // Если слотов нет или их значительно меньше ожидаемого - нужна регенерация
  if (actualSlotsCount < minRequiredSlots) {
    console.log(
      `[Scheduler] User ${userId} has ${actualSlotsCount} planned slots but needs at least ${minRequiredSlots} (expected: ${expectedSlots}, checking from ${checkToday ? 'today' : 'tomorrow'}), regeneration needed`
    );
    return true;
  }

  // Если слотов достаточно, но немного меньше ожидаемого - это нормально
  // (возможно некоторые слоты были отправлены или удалены)
  if (actualSlotsCount < expectedSlots) {
    console.log(
      `[Scheduler] User ${userId} has ${actualSlotsCount} planned slots (expected: ${expectedSlots}), but above minimum threshold (${minRequiredSlots}). No regeneration needed.`
    );
  }

  return false;
}

/**
 * Предотвращает одновременные уведомления, сдвигая пересекающиеся слоты
 * Проверяет все planned слоты пользователя и сдвигает те, которые находятся слишком близко друг к другу
 * ВАЖНО: Учитывает персональный диапазон для каждого источника и не выходит за его границы
 */
async function preventSimultaneousNotifications(userId: number): Promise<void> {
  const now = new Date();
  const minGap = SCHEDULE_CONFIG.minGapMinutes; // Минимальный интервал между уведомлениями (25 минут)

  // Получаем все planned слоты пользователя, отсортированные по времени
  const allSlots = await db
    .select()
    .from(notificationSlots)
    .where(
      and(
        eq(notificationSlots.userId, userId),
        eq(notificationSlots.status, 'planned'),
        gt(notificationSlots.scheduledAt, now)
      )
    )
    .orderBy(asc(notificationSlots.scheduledAt));

  if (allSlots.length <= 1) {
    return; // Нет пересечений, если слотов 0 или 1
  }

  // Получаем preferences для каждого источника, чтобы знать их диапазоны
  const allPrefs = await db
    .select()
    .from(notificationPreferences)
    .where(
      and(
        eq(notificationPreferences.userId, userId),
        eq(notificationPreferences.enabled, true)
      )
    );

  // Создаем карту диапазонов для быстрого доступа
  // Ключ: kind:entityKey, значение: {start, end, crossesMidnight}
  const rangeMap = new Map<
    string,
    { start: number; end: number; crossesMidnight: boolean }
  >();

  // Получаем все привычки и темы пользователя одним запросом для оптимизации
  const userHabits = await db
    .select({ id: habits.id })
    .from(habits)
    .where(eq(habits.userId, userId));

  const userTopics = await db
    .select({ id: therapyTopicsCustom.id })
    .from(therapyTopicsCustom)
    .where(eq(therapyTopicsCustom.userId, userId));

  // Заполняем карту диапазонов
  for (const pref of allPrefs) {
    const start = pref.timeRangeStart ?? 540;
    const end = pref.timeRangeEnd ?? 1350;
    const range = {
      start,
      end,
      crossesMidnight: start > end,
    };

    // Добавляем основной ключ
    const mainKey = `${pref.kind}:${pref.entityKey || 'null'}`;
    rangeMap.set(mainKey, range);
  }

  let shiftedCount = 0;
  for (let i = 1; i < allSlots.length; i++) {
    const prevSlot = allSlots[i - 1];
    const currentSlot = allSlots[i];

    const prevTime = prevSlot.scheduledAt.getTime();
    const currentTime = currentSlot.scheduledAt.getTime();
    const gapMinutes = (currentTime - prevTime) / (1000 * 60);

    // Если интервал меньше минимального, сдвигаем текущий слот
    if (gapMinutes < minGap) {
      // Получаем диапазон для текущего слота
      const slotKey = `${currentSlot.kind}:${currentSlot.entityKey || 'null'}`;
      const slotRange = rangeMap.get(slotKey) || {
        start: 540,
        end: 1350,
        crossesMidnight: false,
      };
      const timeRangeStart = slotRange.start;
      const timeRangeEnd = slotRange.end;
      const crossesMidnight = slotRange.crossesMidnight;

      console.log(
        `[Scheduler] 🔍 Checking slot ${currentSlot.id.substring(0, 8)}... range: [${timeRangeStart}-${timeRangeEnd}], crossesMidnight: ${crossesMidnight}, current time: ${currentSlot.scheduledAt.toISOString()}`
      );

      // Вычисляем новое время со сдвигом
      const shiftMinutes = minGap - gapMinutes;
      let newTime = new Date(currentTime + shiftMinutes * 60 * 1000);

      // ВАЖНО: Проверяем, не выходит ли новое время за границы диапазона
      // Получаем время слота в минутах от начала дня
      const newSlotDate = new Date(newTime);
      const slotHour = newSlotDate.getHours();
      const slotMin = newSlotDate.getMinutes();
      let newSlotMinutes = slotHour * 60 + slotMin;

      // Проверяем границы диапазона
      let needsAdjustment = false;
      if (!crossesMidnight) {
        // Обычный диапазон: проверяем, что время в пределах [start, end]
        if (newSlotMinutes < timeRangeStart || newSlotMinutes > timeRangeEnd) {
          needsAdjustment = true;
          // Если вышли за границы, сдвигаем к ближайшей границе
          if (newSlotMinutes < timeRangeStart) {
            newSlotMinutes = timeRangeStart;
          } else if (newSlotMinutes > timeRangeEnd) {
            newSlotMinutes = timeRangeEnd;
          }
        }
      } else {
        // Диапазон через полночь: разрешены значения >= start ИЛИ <= end
        // Проверяем, попадает ли время в запрещенный промежуток
        if (newSlotMinutes < timeRangeStart && newSlotMinutes > timeRangeEnd) {
          needsAdjustment = true;
          // Попали в запрещенный промежуток - сдвигаем к ближайшей границе
          const distToStart = (timeRangeStart - newSlotMinutes + 1440) % 1440;
          const distToEnd = (newSlotMinutes - timeRangeEnd + 1440) % 1440;
          newSlotMinutes =
            distToStart < distToEnd ? timeRangeStart : timeRangeEnd;
        }
      }

      // Если нужно корректировать, пересчитываем newTime
      if (needsAdjustment) {
        const normalizedMinutes = newSlotMinutes % 1440;
        const newHour = Math.floor(normalizedMinutes / 60);
        const newMin = normalizedMinutes % 60;
        newTime = new Date(newSlotDate);
        newTime.setHours(newHour, newMin, 0, 0);

        // Если диапазон через полночь и время попадает во второй день
        if (crossesMidnight && normalizedMinutes < timeRangeEnd) {
          newTime.setDate(newTime.getDate() + 1);
        }

        console.log(
          `[Scheduler] ⚠️ Adjusted slot ${currentSlot.id.substring(0, 8)}... to stay within range [${timeRangeStart}-${timeRangeEnd}], new time: ${newTime.toISOString()}`
        );
      }

      await db
        .update(notificationSlots)
        .set({
          scheduledAt: newTime,
          // Обновляем payload с новым временем
          payload: {
            ...(currentSlot.payload as any),
            data: {
              ...((currentSlot.payload as any)?.data || {}),
            },
          },
        })
        .where(eq(notificationSlots.id, currentSlot.id));

      // Обновляем время в локальном массиве для следующей итерации
      allSlots[i].scheduledAt = newTime;
      shiftedCount++;

      console.log(
        `[Scheduler] 🔄 Shifted slot ${currentSlot.id.substring(0, 8)}... by ${shiftMinutes.toFixed(1)} minutes to prevent overlap (gap was ${gapMinutes.toFixed(1)} min, min gap is ${minGap} min), range: [${timeRangeStart}-${timeRangeEnd}]`
      );
    }
  }

  if (shiftedCount > 0) {
    console.log(
      `[Scheduler] ✅ Prevented simultaneous notifications: shifted ${shiftedCount} slot(s) for user ${userId}`
    );
  }
}

/**
 * Проверяет и регенерирует слоты для пользователей, которым это нужно
 * Вызывается периодически (например, каждый час или после обработки due-слотов)
 */
export async function checkAndRegenerateSlotsIfNeeded(): Promise<void> {
  console.log('[Scheduler] Checking if slot regeneration is needed');

  // Получаем уникальные userId с активными preferences
  const activeUsers = await db
    .select({ userId: notificationPreferences.userId })
    .from(notificationPreferences)
    .where(eq(notificationPreferences.enabled, true))
    .groupBy(notificationPreferences.userId);

  console.log(
    `[Scheduler] Checking ${activeUsers.length} users with active notifications`
  );

  let regeneratedCount = 0;
  for (const { userId } of activeUsers) {
    try {
      const needsRegen = await needsSlotRegeneration(userId);
      if (needsRegen) {
        console.log(`[Scheduler] Regenerating slots for user ${userId}`);
        await generateAllSlotsForUser(userId);
        regeneratedCount++;
      }
    } catch (error) {
      console.error(
        `[Scheduler] Failed to check/regenerate slots for user ${userId}:`,
        error
      );
    }
  }

  if (regeneratedCount > 0) {
    console.log(
      `[Scheduler] ✅ Regenerated slots for ${regeneratedCount} user(s)`
    );
  } else {
    console.log('[Scheduler] No regeneration needed for any user');
  }
}

/**
 * Пересоздать слоты для всех пользователей с активными настройками
 * Вызывается по cron (например, каждую ночь в 00:30 UTC)
 * Или используйте checkAndRegenerateSlotsIfNeeded() для более умной проверки
 */
export async function regenerateAllSlots(): Promise<void> {
  console.log('[Scheduler] Regenerating slots for all users');

  // Получаем уникальные userId с активными preferences
  const activeUsers = await db
    .select({ userId: notificationPreferences.userId })
    .from(notificationPreferences)
    .where(eq(notificationPreferences.enabled, true))
    .groupBy(notificationPreferences.userId);

  console.log(
    `[Scheduler] Found ${activeUsers.length} users with active notifications`
  );

  for (const { userId } of activeUsers) {
    try {
      await generateAllSlotsForUser(userId);
    } catch (error) {
      console.error(
        `[Scheduler] Failed to regenerate slots for user ${userId}:`,
        error
      );
    }
  }

  console.log('[Scheduler] Finished regenerating slots');
}

/**
 * Регенерирует слоты только для конкретного источника (entityKey)
 * Удаляет старые слоты для этого источника и пересоздает только их с учетом новых настроек
 * Сохраняет существующие слоты для других источников
 * @param userId - ID пользователя
 * @param kind - фокус уведомлений (therapy | habits)
 * @param options - параметры источника (entityKey для идентификации)
 */
export async function regenerateSlotsForSource(
  userId: number,
  kind: NotificationKind,
  options?: {
    entityKey?: string;
  }
): Promise<void> {
  const { entityKey } = options || {};
  const regenerationKey = getRegenerationKey(userId, kind, entityKey);

  // Проверяем, не выполняется ли уже регенерация для этого источника
  const existingRegeneration = activeRegenerations.get(regenerationKey);
  if (existingRegeneration) {
    console.log(
      `[Scheduler] ⏳ Regeneration already in progress for source: user ${userId}, kind: ${kind}, entityKey: ${entityKey || 'none'}. Waiting for completion...`
    );
    // Ждем завершения существующей операции
    try {
      await existingRegeneration;
      console.log(
        `[Scheduler] ✅ Previous regeneration completed, skipping duplicate call: user ${userId}, kind: ${kind}, entityKey: ${entityKey || 'none'}`
      );
      return;
    } catch (error) {
      // Если предыдущая операция завершилась с ошибкой, продолжаем
      console.warn(
        `[Scheduler] ⚠️ Previous regeneration failed, starting new one: user ${userId}, kind: ${kind}, entityKey: ${entityKey || 'none'}`,
        error
      );
    }
  }

  // Создаем новую операцию регенерации
  const regenerationPromise: Promise<void> = (async () => {
    try {
      if (DEBUG_NOTIFICATIONS) {
        console.log(`[Scheduler] ========== REGENERATING SLOTS ==========`);
      }
      console.log(
        `[Scheduler] Regenerating slots for source: user ${userId}, kind: ${kind}, entityKey: ${entityKey || 'none'} (should be readable)`
      );

      // Проверяем, что источник существует
      const conditions = [
        eq(notificationPreferences.userId, userId),
        eq(notificationPreferences.kind, kind),
      ];

      if (entityKey) {
        // Для кастомных сущностей ищем по ID
        if (kind === 'habits') {
          const [habit] = await db
            .select({ id: habits.id })
            .from(habits)
            .where(
              and(
                eq(habits.id, entityKey), // Для кастомных сущностей entityKey = ID
                eq(habits.userId, userId)
              )
            )
            .limit(1);

          if (habit) {
            // Для кастомных сущностей entityKey = ID
            conditions.push(eq(notificationPreferences.entityKey, habit.id));
          } else {
            // Готовый шаблон - ищем по entityKey как есть
            conditions.push(eq(notificationPreferences.entityKey, entityKey));
          }
        } else if (kind === 'therapy') {
          const [topic] = await db
            .select({
              id: therapyTopicsCustom.id,
            })
            .from(therapyTopicsCustom)
            .where(
              and(
                eq(therapyTopicsCustom.id, entityKey), // Для кастомных сущностей entityKey = ID
                eq(therapyTopicsCustom.userId, userId)
              )
            )
            .limit(1);

          if (topic) {
            // Для кастомных сущностей entityKey = ID
            conditions.push(eq(notificationPreferences.entityKey, topic.id));
          } else {
            // Готовый шаблон - ищем по entityKey как есть
            conditions.push(eq(notificationPreferences.entityKey, entityKey));
          }
        } else {
          // Для других типов ищем по entityKey как есть
          conditions.push(eq(notificationPreferences.entityKey, entityKey));
        }
      } else {
        // Общие настройки (без entityKey)
        conditions.push(isNull(notificationPreferences.entityKey));
      }

      const [sourcePref] = await db
        .select()
        .from(notificationPreferences)
        .where(and(...conditions))
        .limit(1);

      if (!sourcePref) {
        console.warn(
          `[Scheduler] ❌ Source not found for user ${userId}, kind: ${kind}, entityKey: ${entityKey || 'none'}. Conditions: ${JSON.stringify(conditions.map((c) => c.toString()))}`
        );
        return;
      }

      console.log(
        `[Scheduler] ✅ Found source preference: id=${sourcePref.id}, entityKey=${sourcePref.entityKey || 'none'}, enabled=${sourcePref.enabled}, meta=${JSON.stringify(sourcePref.meta)}`
      );

      // Получаем историю использованных шаблонов ДО удаления слотов
      // Это шаблоны, которые уже были использованы в отправленных слотах
      // ВАЖНО: Увеличиваем lookbackDays до 60 дней и limit до 500, чтобы учесть все отправленные слоты
      const recentlyUsedTemplateIds = await getRecentlyUsedTemplateIds(
        userId,
        kind,
        {
          entityKey: entityKey ?? null,
        },
        60 // Увеличиваем период до 60 дней для более полного отслеживания
      );

      // Отслеживаем использованные шаблоны в рамках ТЕКУЩЕЙ генерации слотов
      // Это предотвращает дублирование текстов в соседних слотах
      const usedTemplatesInCurrentGeneration = new Set<string>(
        recentlyUsedTemplateIds
      );

      // ВАЖНО: Также отслеживаем использованные ТЕКСТЫ (не только templateId)
      // Это предотвращает дублирование одинаковых текстов из разных шаблонов
      const usedTextsInCurrentGeneration = new Set<string>();

      console.log(
        `[Scheduler] 📋 Recently used templates: ${recentlyUsedTemplateIds.length} templates, usedTemplatesInCurrentGeneration size: ${usedTemplatesInCurrentGeneration.size}`
      );

      const now = new Date();

      // Удаляем только слоты для этого источника
      // КРИТИЧЕСКИ ВАЖНО: Удаляем ТОЛЬКО слоты со статусом 'planned' и scheduledAt > now
      // Отправленные слоты (status: 'sent') НИКОГДА не должны удаляться или изменяться
      const deleteConditions = [
        eq(notificationSlots.userId, userId),
        eq(notificationSlots.kind, kind),
        eq(notificationSlots.status, 'planned'), // ТОЛЬКО planned, НЕ sent!
        gt(notificationSlots.scheduledAt, now), // ТОЛЬКО будущие слоты
      ];

      if (entityKey) {
        // Для кастомных сущностей ищем по ID
        if (kind === 'habits') {
          const [habit] = await db
            .select({ id: habits.id })
            .from(habits)
            .where(
              and(
                eq(habits.id, entityKey), // Для кастомных сущностей entityKey = ID
                eq(habits.userId, userId)
              )
            )
            .limit(1);

          if (habit) {
            // Для кастомных сущностей entityKey = ID
            deleteConditions.push(eq(notificationSlots.entityKey, habit.id));
          } else {
            // Готовый шаблон - удаляем по entityKey как есть
            deleteConditions.push(eq(notificationSlots.entityKey, entityKey));
          }
        } else if (kind === 'therapy') {
          const [topic] = await db
            .select({
              id: therapyTopicsCustom.id,
            })
            .from(therapyTopicsCustom)
            .where(
              and(
                eq(therapyTopicsCustom.id, entityKey), // Для кастомных сущностей entityKey = ID
                eq(therapyTopicsCustom.userId, userId)
              )
            )
            .limit(1);

          if (topic) {
            // Найдена кастомная тема - удаляем слоты по ID
            deleteConditions.push(eq(notificationSlots.entityKey, topic.id));
          } else {
            // Готовый шаблон - удаляем по entityKey как есть
            deleteConditions.push(eq(notificationSlots.entityKey, entityKey));
          }
        } else {
          // Для других типов удаляем по entityKey как есть
          deleteConditions.push(eq(notificationSlots.entityKey, entityKey));
        }
      } else {
        deleteConditions.push(isNull(notificationSlots.entityKey));
      }

      // ВАЖНО: Проверяем сколько отправленных слотов есть для этого источника (для логирования)
      const sentSlotsCheckConditions = [
        eq(notificationSlots.userId, userId),
        eq(notificationSlots.kind, kind),
        eq(notificationSlots.status, 'sent'),
      ];

      // Добавляем фильтр по entityKey (такой же, как в deleteConditions)
      if (entityKey) {
        if (kind === 'habits') {
          const [habit] = await db
            .select({ id: habits.id })
            .from(habits)
            .where(
              and(
                eq(habits.id, entityKey), // Для кастомных сущностей entityKey = ID
                eq(habits.userId, userId)
              )
            )
            .limit(1);

          if (habit) {
            // Для кастомных сущностей entityKey = ID
            sentSlotsCheckConditions.push(
              eq(notificationSlots.entityKey, habit.id)
            );
          } else {
            // Готовый шаблон - ищем по entityKey как есть
            sentSlotsCheckConditions.push(
              eq(notificationSlots.entityKey, entityKey)
            );
          }
        } else if (kind === 'therapy') {
          const [topic] = await db
            .select({
              id: therapyTopicsCustom.id,
            })
            .from(therapyTopicsCustom)
            .where(
              and(
                eq(therapyTopicsCustom.id, entityKey), // Для кастомных сущностей entityKey = ID
                eq(therapyTopicsCustom.userId, userId)
              )
            )
            .limit(1);

          if (topic) {
            // Ищем только по ID
            sentSlotsCheckConditions.push(
              eq(notificationSlots.entityKey, topic.id)
            );
          } else {
            // Готовый шаблон - ищем по entityKey как есть
            sentSlotsCheckConditions.push(
              eq(notificationSlots.entityKey, entityKey)
            );
          }
        } else {
          // Для других типов ищем по entityKey как есть
          sentSlotsCheckConditions.push(
            eq(notificationSlots.entityKey, entityKey)
          );
        }
      } else {
        sentSlotsCheckConditions.push(isNull(notificationSlots.entityKey));
      }

      const [sentSlotsCheck] = await db
        .select({ count: count() })
        .from(notificationSlots)
        .where(and(...sentSlotsCheckConditions));

      const deletedResult = await db
        .delete(notificationSlots)
        .where(and(...deleteConditions));
      const deletedCount = deletedResult.rowCount || 0;

      console.log(
        `[Scheduler] Removed ${deletedCount} old PLANNED slots for source: user ${userId}, kind: ${kind}, entityKey: ${entityKey || 'none'}`
      );
      console.log(
        `[Scheduler] ✅ Sent slots preserved: ${sentSlotsCheck?.count || 0} sent slots for this source were NOT affected (as expected)`
      );

      // Если источник отключен, просто удаляем его слоты (уже удалили выше)
      if (!sourcePref.enabled) {
        console.log(
          `[Scheduler] Source disabled, no new slots created: user ${userId}, kind: ${kind}`
        );
        return;
      }

      // Получаем все активные preferences для расчета общего количества уведомлений
      const allPrefs = await db
        .select()
        .from(notificationPreferences)
        .where(
          and(
            eq(notificationPreferences.userId, userId),
            eq(notificationPreferences.enabled, true)
          )
        );

      if (allPrefs.length === 0) {
        console.log(`[Scheduler] No active preferences for user ${userId}`);
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

      // Генерируем временные метки для нового источника
      const timezone = sourcePref.timezone || 'Europe/Moscow';
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
        customSlotTimes
      );

      // ВАЖНО: Сортируем слоты по времени для детерминированного порядка
      // Это обеспечит одинаковый slotIndex для одного и того же времени при каждой регенерации
      newSlotTimes.sort((a, b) => a.getTime() - b.getTime());

      console.log(
        `[Scheduler] Generated ${newSlotTimes.length} time slots for regeneration: user ${userId}, kind: ${kind}, timesPerDay: ${sourcePref.timesPerDay}, timezone: ${timezone}, activeDays: ${activeDays.join(',')}, timeRange: ${timeRangeStart}-${timeRangeEnd}`
      );

      if (newSlotTimes.length === 0) {
        console.warn(
          `[Scheduler] ⚠️ No time slots generated! This might be due to invalid time range or active days. user ${userId}, kind: ${kind}`
        );
        return;
      }

      // Получаем intent для этого источника
      // ВАЖНО: entityKey содержит ID для кастомных сущностей, ключ шаблона для шаблонных
      let intent: 'build' | 'quit' | undefined;
      let isCustomEntity = false; // Флаг: найдена ли сущность в БД (кастомная)
      let normalizedEntityKeyForSlot: string | null = null; // Для сохранения в notification_slots (ID для кастомных, ключ для шаблонных)

      if (kind === 'habits' && entityKey) {
        // Для кастомных сущностей entityKey = ID
        const [customHabit] = await db
          .select()
          .from(habits)
          .where(and(eq(habits.id, entityKey), eq(habits.userId, userId)))
          .limit(1);

        if (customHabit) {
          // Это кастомная привычка пользователя
          isCustomEntity = true;
          normalizedEntityKeyForSlot = customHabit.id; // ID для кастомных
          // Кастомные привычки могут иметь intent 'build' или 'quit'
          intent =
            customHabit.intent === 'build' || customHabit.intent === 'quit'
              ? customHabit.intent
              : 'build'; // Fallback на 'build' если intent неожиданный
          console.log(
            `[regenerateSlotsForSource] ✅ Found custom habit: entityKey="${entityKey}", intent=${intent} (name: "${customHabit.name}")`
          );
        } else {
          // Это готовый шаблон (water, meditation, nutrition и т.д.)
          isCustomEntity = false;
          normalizedEntityKeyForSlot = entityKey; // Для шаблонов entityKey = ключ шаблона

          // Пробуем найти в каталоге привычек (единый источник истины)
          const catalogHabit = findHabitByKey(entityKey);
          if (catalogHabit) {
            intent = catalogHabit.intent;
            console.log(
              `[regenerateSlotsForSource] ✅ Found in catalog: entityKey="${entityKey}", intent=${intent} (name: "${catalogHabit.name}")`
            );
          } else {
            // Не найдено в каталоге - это несуществующий шаблон
            // Не устанавливаем intent, чтобы не фильтровать шаблоны
            intent = undefined;
            console.log(
              `[regenerateSlotsForSource] ⚠️ EntityKey="${entityKey}" not found in catalog, intent will be undefined`
            );
          }
        }
      } else if (kind === 'therapy' && entityKey) {
        // Для терапии проверяем, кастомная ли это тема
        const [customTopic] = await db
          .select()
          .from(therapyTopicsCustom)
          .where(
            and(
              eq(therapyTopicsCustom.id, entityKey),
              eq(therapyTopicsCustom.userId, userId)
            )
          )
          .limit(1);
        isCustomEntity = !!customTopic;
        if (customTopic) {
          normalizedEntityKeyForSlot = customTopic.id; // ID для кастомных
        } else {
          normalizedEntityKeyForSlot = entityKey; // Для шаблонов entityKey = ключ шаблона
        }
      } else if (kind === 'habits' && !entityKey) {
        // Общие настройки для привычек
        normalizedEntityKeyForSlot = null;
      }

      // Определяем фактический subtype
      // Для кастомных привычек subtype всегда null, не обрабатываем его
      let actualSubtype = sourcePref.subtype;

      console.log(
        `[Scheduler] 🔍 Subtype determination: sourcePref.subtype=${sourcePref.subtype}, initial actualSubtype=${actualSubtype}, kind=${kind}, entityKey=${entityKey || 'none'}`
      );

      // normalizedEntityKeyForSlot уже определен выше при определении isCustomEntity

      // ВАЖНО: Для детерминированного выбора subtype при 'mixed' используем дату и userId
      // Это обеспечит одинаковый выбор при каждой регенерации для одного пользователя
      if (!isCustomEntity) {
        // Для готовых шаблонов обрабатываем 'mixed' и fallback для quit-привычек
        if (sourcePref.subtype === 'mixed') {
          const subtypes: Array<'reminder' | 'informational' | 'motivational'> =
            ['reminder', 'informational', 'motivational'];
          // Детерминированный выбор на основе userId и даты (для стабильности)
          const now = new Date();
          const dayOfYear = Math.floor(
            (now.getTime() - new Date(now.getFullYear(), 0, 0).getTime()) /
              (1000 * 60 * 60 * 24)
          );
          const deterministicIndex = (userId + dayOfYear) % subtypes.length;
          actualSubtype = subtypes[deterministicIndex];
          console.log(
            `[Scheduler] 🔍 Deterministic subtype selection for 'mixed': userId=${userId}, dayOfYear=${dayOfYear}, selected=${actualSubtype}, kind=${kind}, entityKey=${entityKey || 'none'}`
          );
        }

        if (
          kind === 'habits' &&
          intent === 'quit' &&
          actualSubtype === 'reminder'
        ) {
          // Детерминированный выбор для quit-привычек
          const now = new Date();
          const dayOfYear = Math.floor(
            (now.getTime() - new Date(now.getFullYear(), 0, 0).getTime()) /
              (1000 * 60 * 60 * 24)
          );
          const deterministicChoice = (userId + dayOfYear) % 2;
          actualSubtype =
            deterministicChoice === 0 ? 'informational' : 'motivational';
          console.log(
            `[Scheduler] Deterministic subtype selection for quit habit: userId=${userId}, dayOfYear=${dayOfYear}, selected=${actualSubtype}`
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
            `[Scheduler] Found custom habit for entityName: id=${habit.id}, name="${habit.name}", entityKey param=${entityKey}`
          );
        } else {
          // Готовый шаблон привычки (water, meditation, training и т.д.)
          // ВАЖНО: Используем читаемое название из каталога, чтобы хеш совпадал с генерацией
          const catalogHabit = findHabitByKey(entityKey);
          if (catalogHabit) {
            entityName = catalogHabit.name;
            entityDescription = catalogHabit.description || null;
            console.log(
              `[Scheduler] Template habit: entityKey=${entityKey}, name="${catalogHabit.name}" (from catalog)`
            );
          } else {
            // Fallback: если не найден в каталоге, используем entityKey
            entityName = entityKey;
            entityDescription = null;
            console.log(
              `[Scheduler] Template habit: entityKey=${entityKey} (not found in catalog, using as entityName)`
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

      if (
        prefMeta &&
        typeof prefMeta === 'object' &&
        'textSource' in prefMeta
      ) {
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
        `[Scheduler] Meta extraction: prefMeta=${JSON.stringify(prefMeta)}, prefMeta type=${typeof prefMeta}, isCustomEntity=${isCustomEntity}, textSource=${textSource}`
      );

      // ВАЖНО: Дополнительная проверка - если prefMeta не распарсился, логируем предупреждение
      if (
        !prefMeta &&
        (isCustomEntity ||
          (kind === 'habits' && entityKey) ||
          (kind === 'therapy' && entityKey))
      ) {
        console.warn(
          `[Scheduler] ⚠️ WARNING: prefMeta is null/undefined but entity might need it! user ${userId}, kind: ${kind}, isCustomEntity: ${isCustomEntity}, sourcePref.meta raw: ${JSON.stringify(sourcePref.meta)}`
        );
      }

      // Логируем для отладки
      if (DEBUG_NOTIFICATIONS) {
        console.log(`[Scheduler] ========== REGENERATING SLOTS ==========`);
      }
      console.log(
        `[Scheduler] Regenerating slots: user ${userId}, kind: ${kind}, isCustomEntity: ${isCustomEntity}, intent: ${intent}, textSource: ${textSource}, entityKey: ${entityKey || 'none'} (should be readable), meta: ${JSON.stringify(prefMeta)}`
      );

      // Загружаем AI-тексты если нужно (один раз для всех слотов)
      let aiTexts: string[] | null = null;
      let configHash: string | null = null; // Объявляем configHash вне блока для доступности
      console.log(
        `[Scheduler] 🔍 Checking if AI texts should be loaded: textSource=${textSource}, entityName="${entityName}", isCustomEntity=${isCustomEntity}`
      );

      if ((textSource === 'ai' || textSource === 'hybrid') && entityName) {
        const effectiveTextSource: 'ai' | 'hybrid' =
          textSource === 'ai' ? 'ai' : 'hybrid';

        console.log(
          `[Scheduler] 🔍 AI texts loading condition met: effectiveTextSource=${effectiveTextSource}, entityName="${entityName}"`
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
        });

        console.log(
          `[Scheduler] 🔍 Computed config hash: ${configHash.substring(0, 8)}..., entityName: ${entityName}, entityDescription: ${entityDescription || 'null'}, directness: ${sourcePref.directness}, subtypeForHash: ${subtypeForHash}, actualSubtype: ${actualSubtype}, textSource: ${effectiveTextSource}, kind: ${kind}, preferenceId: ${sourcePref.id}, isCustomEntity: ${isCustomEntity}`
        );

        console.log(
          `[Scheduler] 🔍 Loading AI texts: userId=${userId}, preferenceId=${sourcePref.id}, configHash=${configHash.substring(0, 8)}..., entityName="${entityName}", entityDescription="${entityDescription || 'null'}"`
        );

        // ВАЖНО: Проверяем, что все параметры правильные перед загрузкой
        if (!entityName) {
          console.error(
            `[Scheduler] ❌ ERROR: entityName is empty! Cannot load AI texts. userId=${userId}, preferenceId=${sourcePref.id}, kind=${kind}, entityKey=${entityKey || 'none'}, isCustomEntity=${isCustomEntity}`
          );
        }

        aiTexts = await loadAiGeneratedTexts(userId, sourcePref.id, configHash);

        // ВАЖНО: Если AI-тексты не найдены, проверяем, может ли быть проблема с configHash
        if (!aiTexts || aiTexts.length === 0) {
          console.warn(
            `[Scheduler] ⚠️ AI texts not found. Checking if there are any AI texts for this preference with different hash...`
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
              `[Scheduler] ⚠️ Found ${allAiTexts.length} AI text record(s) for this preference, but with different hash(es): ${allAiTexts.map((r) => r.generationConfigHash?.substring(0, 8) || 'no hash').join(', ')}. Current hash: ${configHash.substring(0, 8)}...`
            );
            console.warn(
              `[Scheduler] ⚠️ This suggests that configHash mismatch! Check entityName, entityDescription, directness, subtype, textSource, kind.`
            );
          } else {
            console.warn(
              `[Scheduler] ⚠️ No AI texts found at all for this preference. AI texts may not have been generated yet.`
            );
          }
        }

        // Логируем для отладки
        if (aiTexts && aiTexts.length > 0) {
          console.log(
            `[Scheduler] ✅ Loaded ${aiTexts.length} AI texts for user ${userId}, preferenceId: ${sourcePref.id}, configHash: ${configHash.substring(0, 8)}..., kind: ${kind}, entityName: ${entityName}`
          );
          console.log(
            `[Scheduler] ✅ First 3 AI texts: ${aiTexts
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
              `[Scheduler] 📊 Pool status: ${poolStatus.availableTexts}/${poolStatus.totalTexts} available, ${poolStatus.daysRemaining} days remaining, used: ${poolStatus.usedTexts}`
            );

            if (poolStatus.needsRefill) {
              console.warn(
                `[Scheduler] ⚠️ Pool needs refill (${poolStatus.daysRemaining} days left), but skipping auto-refill. Worker will handle it.`
              );
            }
          } catch (error) {
            console.error(`[Scheduler] ❌ Error checking pool status:`, error);
            // Не прерываем выполнение, так как это только проверка
          }
        } else {
          console.warn(
            `[Scheduler] ⚠️ No AI texts found for user ${userId}, preferenceId: ${sourcePref.id}, configHash: ${configHash.substring(0, 8)}..., textSource: ${textSource}, entityName: ${entityName}, kind: ${kind}, entityKey: ${entityKey || 'none'}`
          );
          console.warn(
            `[Scheduler] ⚠️ This might mean AI texts were not generated yet. Check if generateNotificationTexts was called.`
          );
        }
      } else {
        console.log(
          `[Scheduler] 🔍 AI texts NOT loaded: textSource=${textSource}, entityName="${entityName}", condition check: textSource in ['ai','hybrid']=${textSource === 'ai' || textSource === 'hybrid'}, entityName exists=${!!entityName}`
        );
      }

      // Создаём новые слоты для этого источника
      // ВАЖНО: Отслеживаем использованные тексты как в БД, так и в рамках текущей генерации
      let customTextIndex = 0;
      let aiTextIndex = 0;
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
            `[Scheduler] 📊 Loaded ${usedAiTextIndicesFromDb.size} used text indices and ${usedAiTextHashesFromDb.size} used text hashes from DB for aiTextId=${aiTextRecord.id}`
          );
        }
      }

      // Отслеживаем использованные AI-тексты и customTexts в рамках текущей генерации
      // Это предотвращает повторение текстов, пока не будут использованы все доступные
      // Объединяем с индексами и хешами из БД
      const usedAiTextIndices = new Set<number>(usedAiTextIndicesFromDb);
      const usedAiTextHashes = new Set<string>(usedAiTextHashesFromDb); // Хеши для проверки дубликатов по содержимому
      const usedCustomTextIndices = new Set<number>();

      /**
       * Вспомогательная функция для применения AI-текста к слоту
       * Обновляет все необходимые структуры данных и возвращает true при успехе
       */
      function tryUseAiText(
        aiTexts: string[],
        slotIndex: number,
        reason: string
      ): boolean {
        const selectedText = selectUnusedAiText(
          aiTexts,
          usedAiTextIndices,
          usedAiTextHashes,
          usedTextsInCurrentGeneration
        );

        if (selectedText) {
          text = formatNotificationTextWithName(selectedText.text, userName);
          selectedAiTextIndex = selectedText.index;
          usedAiTextIndices.add(selectedText.index);
          const textHash = hashNotificationText(selectedText.text);
          usedAiTextHashes.add(textHash);
          usedTextsInCurrentGeneration.add(selectedText.text);
          templateIdForSlot = 'ai_generated';
          console.log(
            `[Scheduler] ✅ Using AI text (${reason}, slot ${slotIndex}): user ${userId}, kind: ${kind}, index: ${selectedText.index}, text="${text.substring(0, 50)}..."`
          );
          return true;
        } else {
          console.warn(
            `[Scheduler] ❌ All AI texts already used, skipping slot: user ${userId}, kind: ${kind}, slot ${slotIndex}`
          );
          return false;
        }
      }

      /**
       * Выбирает неиспользованный AI-текст из пула по индексу и хешу
       * Использует комбинированный подход для максимальной надежности
       * @param aiTexts - массив AI-текстов
       * @param usedIndices - Set использованных индексов
       * @param usedHashes - Set использованных хешей текстов (для проверки дубликатов по содержимому)
       * @param usedTexts - Set использованных текстов (для проверки дубликатов, опционально)
       * @param startIndex - индекс для начала поиска (для последовательного обхода)
       * @returns объект с текстом и индексом, или null если все использованы
       */
      function selectUnusedAiText(
        aiTexts: string[],
        usedIndices: Set<number>,
        usedHashes: Set<string>,
        usedTexts: Set<string>,
        startIndex: number = 0
      ): { text: string; index: number } | null {
        // Получаем доступные индексы (не использованные по индексу)
        const availableIndices = aiTexts
          .map((_, index) => index)
          .filter((index) => !usedIndices.has(index));

        if (availableIndices.length === 0) {
          return null;
        }

        // Перемешиваем для случайного выбора, но с проверкой хеша и текста на дубликаты
        const shuffled = [...availableIndices].sort(() => Math.random() - 0.5);

        // Ищем первый доступный текст, который не был использован по хешу
        // Хеш вычисляется от исходного текста (rawText), чтобы имя пользователя не влияло на проверку дубликатов
        for (const index of shuffled) {
          const rawText = aiTexts[index];

          // Вычисляем хеш от исходного текста для проверки дубликатов
          // Это важно: имя пользователя - переменная часть, не должна влиять на проверку
          const textHash = hashNotificationText(rawText);

          // Проверяем по хешу (основная защита - устойчив к форматированию)
          // И по тексту (дополнительная защита)
          if (!usedHashes.has(textHash) && !usedTexts.has(rawText)) {
            return {
              text: rawText,
              index: index,
            };
          }
        }

        // Если все доступные тексты уже использованы (дубликаты в массиве), возвращаем null
        // Это предотвратит создание слота с дубликатом
        console.warn(
          `[Scheduler] ⚠️ All available texts are duplicates (by hash or text), cannot select unique text`
        );
        return null;
      }

      if (DEBUG_NOTIFICATIONS) {
        console.log(`[Scheduler] ========== STARTING SLOT CREATION ==========`);
        console.log(
          `[Scheduler] Starting slot creation loop: ${newSlotTimes.length} time slots, isCustomEntity: ${isCustomEntity}, textSource: ${textSource}, customTexts count: ${prefMeta?.customTexts?.length || 0}, aiTexts count: ${aiTexts?.length || 0}`
        );
      }
      console.log(
        `[Scheduler] 🔍 AI texts status: ${aiTexts ? `LOADED [${aiTexts.length} texts]` : 'NOT LOADED (null)'}`
      );
      if (prefMeta?.customTexts) {
        console.log(
          `[Scheduler] 🔍 Custom texts: ${prefMeta.customTexts.length} texts available`
        );
      }

      // Переменные для использования в цикле и в функции tryUseAiText
      let templateIdForSlot: string = 'custom_user_text';
      let text: string | null = null;
      let template: ReturnType<typeof findTemplate> | null = null;
      let selectedAiTextIndex: number | null = null;

      for (const scheduledAt of newSlotTimes) {
        slotIndex += 1;
        console.log(
          `[Scheduler] ========== PROCESSING SLOT ${slotIndex}/${newSlotTimes.length} ==========`
        );
        const customText =
          kind === 'habits' || kind === 'therapy'
            ? pickCustomTextFromMeta(prefMeta, userName, customTextIndex)
            : null;
        console.log(
          `[Scheduler] Processing slot ${slotsCreated + slotsSkipped + 1}/${newSlotTimes.length}: scheduledAt=${scheduledAt.toISOString()}, customText=${customText ? `"${customText.substring(0, 20)}..."` : 'null'}, isCustomEntity=${isCustomEntity}, textSource=${textSource}`
        );

        // Сбрасываем переменные для новой итерации
        templateIdForSlot = 'custom_user_text';
        text = null;
        template = null;
        selectedAiTextIndex = null;

        // Логика выбора текста с учетом режима генерации
        // Для кастомных сущностей (привычки и терапия)
        if (isCustomEntity) {
          // Приоритет: AI > Hybrid > Templates
          // Если textSource не определен, используем templates по умолчанию

          if (textSource === 'ai') {
            // Режим AI - используем только AI-тексты, игнорируем customTexts
            if (aiTexts && aiTexts.length > 0) {
              // ВАЖНО: Используем комбинированный подход: проверка по индексу, хешу и тексту
              const selectedText = selectUnusedAiText(
                aiTexts,
                usedAiTextIndices,
                usedAiTextHashes,
                usedTextsInCurrentGeneration
              );

              if (selectedText) {
                text = formatNotificationTextWithName(
                  selectedText.text,
                  userName
                );
                selectedAiTextIndex = selectedText.index;
                usedAiTextIndices.add(selectedText.index);
                // ВАЖНО: Добавляем хеш и текст в Sets для проверки дубликатов
                // Хеш вычисляем от исходного текста (rawText), чтобы имя пользователя не влияло
                const textHash = hashNotificationText(selectedText.text);
                usedAiTextHashes.add(textHash);
                usedTextsInCurrentGeneration.add(selectedText.text);
                templateIdForSlot = 'ai_generated';
                console.log(
                  `[Scheduler] ✅ Using AI text (AI mode, ignoring customTexts): user ${userId}, kind: ${kind}, index: ${selectedText.index}, text="${text.substring(0, 50)}..."`
                );
              } else {
                console.warn(
                  `[Scheduler] ❌ All AI texts already used, skipping slot: user ${userId}, kind: ${kind}, entityKey: ${entityKey || 'none'}`
                );
                slotsSkipped += 1;
                continue;
              }
            } else {
              console.warn(
                `[Scheduler] ❌ No AI texts found for custom entity in AI mode: user ${userId}, kind: ${kind}, entityKey: ${entityKey || 'none'}`
              );
              slotsSkipped += 1;
              continue;
            }
          } else if (textSource === 'hybrid') {
            // Гибридный режим - чередуем customTexts и AI детерминированно
            // Проверяем наличие обоих источников
            const hasCustomTexts = customText !== null;
            const hasAiTexts = aiTexts && aiTexts.length > 0;

            console.log(
              `[Scheduler] 🔍 HYBRID MODE - Slot ${slotIndex}: hasCustomTexts=${hasCustomTexts}, hasAiTexts=${hasAiTexts}, aiTexts=${aiTexts ? `[${aiTexts.length} texts]` : 'null'}, customText=${customText ? `"${customText.substring(0, 30)}..."` : 'null'}`
            );

            if (!hasCustomTexts && !hasAiTexts) {
              // Если нет ни customTexts, ни AI-текстов - пропускаем
              console.warn(
                `[Scheduler] ❌ No texts available in hybrid mode: user ${userId}, kind: ${kind}, slot ${slotIndex}`
              );
              slotsSkipped += 1;
              continue;
            }

            // Детерминированное чередование: четные слоты - AI, нечетные - customTexts
            // Если одного из источников нет, используем только доступный
            if (!hasCustomTexts && aiTexts) {
              // Только AI-тексты
              // ВАЖНО: Используем комбинированный подход: проверка по индексу, хешу и тексту
              const selectedText = selectUnusedAiText(
                aiTexts,
                usedAiTextIndices,
                usedAiTextHashes,
                usedTextsInCurrentGeneration
              );

              if (selectedText) {
                text = formatNotificationTextWithName(
                  selectedText.text,
                  userName
                );
                selectedAiTextIndex = selectedText.index;
                usedAiTextIndices.add(selectedText.index);
                // ВАЖНО: Добавляем хеш и текст в Sets для проверки дубликатов
                // Хеш вычисляем от исходного текста (rawText), чтобы имя пользователя не влияло
                const textHash = hashNotificationText(selectedText.text);
                usedAiTextHashes.add(textHash);
                usedTextsInCurrentGeneration.add(selectedText.text);
                templateIdForSlot = 'ai_generated';
                console.log(
                  `[Scheduler] ✅ Using AI text (hybrid mode, no customTexts, slot ${slotIndex}): user ${userId}, kind: ${kind}, index: ${selectedText.index}, text="${text.substring(0, 50)}..."`
                );
              } else {
                console.warn(
                  `[Scheduler] ❌ All AI texts already used, skipping slot: user ${userId}, kind: ${kind}, slot ${slotIndex}`
                );
                slotsSkipped += 1;
                continue;
              }
            } else if (!hasAiTexts) {
              // Только customTexts
              // ВАЖНО: Проверяем использованные тексты, чтобы избежать дублирования
              if (customText && usedTextsInCurrentGeneration.has(customText)) {
                console.warn(
                  `[Scheduler] ⚠️ Custom text already used, skipping slot: user ${userId}, kind: ${kind}, slot ${slotIndex}, text="${customText.substring(0, 50)}..."`
                );
                slotsSkipped += 1;
                continue;
              }

              text = customText;
              if (text) {
                usedTextsInCurrentGeneration.add(text);
              }
              customTextIndex += 1;
              templateIdForSlot = 'custom_user_text';
              console.log(
                `[Scheduler] ✅ Using custom text (hybrid mode, no AI texts, slot ${slotIndex}): user ${userId}, kind: ${kind}, text="${text ? text.substring(0, 50) : 'null'}..."`
              );
            } else if (aiTexts) {
              // Оба источника доступны - чередуем детерминированно
              const isEvenSlot = slotIndex % 2 === 0;
              console.log(
                `[Scheduler] 🔍 HYBRID MODE - Slot ${slotIndex}: isEvenSlot=${isEvenSlot}, will use ${isEvenSlot ? 'AI' : 'customText'}`
              );

              if (isEvenSlot) {
                // Четные слоты - AI
                // ВАЖНО: Используем комбинированный подход: проверка по индексу, хешу и тексту
                const selectedText = selectUnusedAiText(
                  aiTexts,
                  usedAiTextIndices,
                  usedAiTextHashes,
                  usedTextsInCurrentGeneration
                );

                if (selectedText) {
                  text = formatNotificationTextWithName(
                    selectedText.text,
                    userName
                  );
                  selectedAiTextIndex = selectedText.index;
                  usedAiTextIndices.add(selectedText.index);
                  // ВАЖНО: Добавляем хеш и текст в Sets для проверки дубликатов
                  // Хеш вычисляем от исходного текста (rawText), чтобы имя пользователя не влияло
                  const textHash = hashNotificationText(selectedText.text);
                  usedAiTextHashes.add(textHash);
                  usedTextsInCurrentGeneration.add(selectedText.text);
                  templateIdForSlot = 'ai_generated';
                  console.log(
                    `[Scheduler] ✅ Using AI text (hybrid mode, slot ${slotIndex}, even): user ${userId}, kind: ${kind}, index: ${selectedText.index}, text="${text.substring(0, 50)}..."`
                  );
                } else {
                  console.warn(
                    `[Scheduler] ❌ All AI texts already used, skipping slot: user ${userId}, kind: ${kind}, slot ${slotIndex}`
                  );
                  slotsSkipped += 1;
                  continue;
                }
              } else {
                // Нечетные слоты - customTexts
                // ВАЖНО: Проверяем использованные тексты, чтобы избежать дублирования
                if (
                  customText &&
                  usedTextsInCurrentGeneration.has(customText)
                ) {
                  console.warn(
                    `[Scheduler] ⚠️ Custom text already used, skipping slot: user ${userId}, kind: ${kind}, slot ${slotIndex}, text="${customText.substring(0, 50)}..."`
                  );
                  slotsSkipped += 1;
                  continue;
                }

                text = customText;
                if (text) {
                  usedTextsInCurrentGeneration.add(text);
                }
                customTextIndex += 1;
                templateIdForSlot = 'custom_user_text';
                console.log(
                  `[Scheduler] ✅ Using custom text (hybrid mode, slot ${slotIndex}, odd): user ${userId}, kind: ${kind}, text="${text ? text.substring(0, 50) : 'null'}...", customTextIndex=${customTextIndex - 1}`
                );
              }
            } else {
              console.error(
                `[Scheduler] ❌ ERROR: Both sources should be available but aiTexts is null! slot ${slotIndex}, hasCustomTexts=${hasCustomTexts}, hasAiTexts=${hasAiTexts}`
              );
              slotsSkipped += 1;
              continue;
            }
          } else {
            // Режим templates или undefined - используем только customTexts
            if (customText) {
              // ВАЖНО: Проверяем использованные тексты, чтобы избежать дублирования
              if (usedTextsInCurrentGeneration.has(customText)) {
                console.warn(
                  `[Scheduler] ⚠️ Custom text already used, skipping slot: user ${userId}, kind: ${kind}, slot ${slotIndex}, text="${customText.substring(0, 50)}..."`
                );
                slotsSkipped += 1;
                continue;
              }

              text = customText;
              usedTextsInCurrentGeneration.add(text);
              customTextIndex += 1; // ВАЖНО: Увеличиваем индекс для чередования текстов
              templateIdForSlot = 'custom_user_text';
              console.log(
                `[Scheduler] ✅ Using custom text (templates mode, slot ${slotIndex}): user ${userId}, kind: ${kind}, text="${text.substring(0, 30)}...", customTextIndex=${customTextIndex - 1}`
              );
            } else {
              console.warn(
                `[Scheduler] ❌ No custom text found for custom entity: user ${userId}, kind: ${kind}, entityKey: ${entityKey || 'none'}, prefMeta: ${JSON.stringify(prefMeta)}, customTexts: ${prefMeta?.customTexts?.length || 0}`
              );
              slotsSkipped += 1;
              continue;
            }
          }

          // Если все еще нет текста - пропускаем
          if (!text) {
            console.warn(
              `[Scheduler] ❌ No text found for custom entity after all checks: user ${userId}, kind: ${kind}, entityKey: ${entityKey || 'none'}`
            );
            slotsSkipped += 1;
            continue;
          }
        }
        // Для готовых шаблонов (привычки и терапия)
        else {
          // Если textSource не определен, используем шаблоны по умолчанию (обратная совместимость)
          const useTemplates =
            !textSource ||
            textSource === 'templates' ||
            textSource === 'hybrid';
          const useAi = textSource === 'ai' || textSource === 'hybrid';

          // Приоритет: если textSource === 'ai', используем только AI (игнорируем customText)
          // Если textSource === 'hybrid', чередуем шаблоны и AI
          // Если textSource === 'templates' или undefined, используем шаблоны

          if (textSource === 'ai') {
            // Режим AI - используем только AI-тексты
            if (aiTexts && aiTexts.length > 0) {
              const rawAiText = aiTexts[aiTextIndex % aiTexts.length];
              // ВАЖНО: Заменяем {name} на имя пользователя в AI-текстах
              text = formatNotificationTextWithName(rawAiText, userName);
              aiTextIndex += 1;
              templateIdForSlot = 'ai_generated';
              console.log(
                `[Scheduler] Using AI text (AI mode): user ${userId}, kind: ${kind}`
              );
            } else {
              // AI-тексты еще не готовы - пропускаем слот с предупреждением
              // Тексты будут сгенерированы асинхронно, слоты можно будет создать позже
              console.warn(
                `[Scheduler] AI texts not ready yet, skipping slot (will be generated asynchronously): user ${userId}, kind: ${kind}, preferenceId: ${sourcePref.id}`
              );
              continue;
            }
          } else if (textSource === 'hybrid') {
            // Гибридный режим - чередуем шаблоны и AI детерминированно
            const hasAiTexts = aiTexts && aiTexts.length > 0;
            const isEvenSlot = slotIndex % 2 === 0;

            console.log(
              `[Scheduler] 🔍 HYBRID MODE (template) - Slot ${slotIndex}: hasAiTexts=${hasAiTexts}, aiTexts=${aiTexts ? `[${aiTexts.length} texts]` : 'null'}, isEvenSlot=${isEvenSlot}`
            );

            // Детерминированное чередование: четные слоты - AI, нечетные - шаблоны
            // Если шаблонов нет, используем AI для всех слотов
            if (isEvenSlot && hasAiTexts && aiTexts) {
              // Четные слоты - AI
              if (!tryUseAiText(aiTexts, slotIndex, 'hybrid mode, even slot')) {
                slotsSkipped += 1;
                continue;
              }
            } else {
              // Нечетные слоты - пробуем шаблоны, если нет - используем AI
              if (!text) {
                // ВАЖНО: Для детерминированного выбора используем scheduledAt и userId
                // Это обеспечит одинаковый выбор шаблона при каждой регенерации для одного и того же времени
                // Используем хеш от scheduledAt и userId для стабильности
                const timeHash = scheduledAt.getTime();
                const deterministicTemplateIndex =
                  (timeHash + userId) % 1000000;

                console.log(
                  `[Scheduler] 🔍 Deterministic template selection: scheduledAt=${scheduledAt.toISOString()}, timeHash=${timeHash}, userId=${userId}, templateIndex=${deterministicTemplateIndex}, actualSubtype=${actualSubtype}`
                );

                // Пробуем найти шаблон с детерминированным выбором
                // ВАЖНО: Всегда используем excludeTemplateIds для предотвращения дублирования
                // Если все шаблоны использованы, findTemplate автоматически сбросит список и начнет заново
                template = findTemplate(kind as NotificationKind, {
                  entityKey: entityKey,
                  intent,
                  subtype: actualSubtype as NotificationSubtype | undefined,
                  excludeTemplateIds: Array.from(
                    usedTemplatesInCurrentGeneration
                  ), // ВСЕГДА используем исключения для предотвращения дублирования
                  templateIndex: deterministicTemplateIndex, // Детерминированный выбор на основе времени
                });

                // Fallback для habits
                if (!template && kind === 'habits' && actualSubtype) {
                  const fallbackSubtypes: Array<
                    'reminder' | 'informational' | 'motivational'
                  > =
                    actualSubtype === 'reminder'
                      ? ['informational', 'motivational']
                      : actualSubtype === 'informational'
                        ? ['reminder', 'motivational']
                        : ['reminder', 'informational'];

                  for (const fallbackSubtype of fallbackSubtypes) {
                    const timeHash = scheduledAt.getTime();
                    const deterministicTemplateIndex =
                      (timeHash + userId) % 1000000;
                    template = findTemplate(kind as NotificationKind, {
                      entityKey: entityKey,
                      intent,
                      subtype: fallbackSubtype,
                      excludeTemplateIds: Array.from(
                        usedTemplatesInCurrentGeneration
                      ), // ВСЕГДА используем исключения для предотвращения дублирования
                      templateIndex: deterministicTemplateIndex, // Детерминированный выбор на основе времени
                    });
                    if (template) break;
                  }
                }

                if (template) {
                  // Получаем текст шаблона
                  const candidateText = getTemplateText(
                    template,
                    addressing as any,
                    sourcePref.directness as any,
                    userName ?? undefined
                  );

                  // ВАЖНО: Проверяем, не использовался ли этот текст недавно
                  // Это предотвращает дублирование одинаковых текстов в соседних слотах
                  if (usedTextsInCurrentGeneration.has(candidateText)) {
                    console.warn(
                      `[Scheduler] ⚠️ Text already used, trying another template: templateId="${template.id}", text="${candidateText.substring(0, 50)}..."`
                    );

                    // Исключаем этот шаблон и пробуем найти другой
                    usedTemplatesInCurrentGeneration.add(template.id);
                    template = findTemplate(kind as NotificationKind, {
                      entityKey: entityKey,
                      intent,
                      subtype: actualSubtype as NotificationSubtype | undefined,
                      excludeTemplateIds: Array.from(
                        usedTemplatesInCurrentGeneration
                      ),
                      templateIndex: deterministicTemplateIndex + 1, // Пробуем следующий индекс
                    });

                    if (template) {
                      // Пробуем новый шаблон
                      const newCandidateText = getTemplateText(
                        template,
                        addressing as any,
                        sourcePref.directness as any,
                        userName ?? undefined
                      );

                      // Если новый текст тоже использован, пропускаем этот слот
                      if (usedTextsInCurrentGeneration.has(newCandidateText)) {
                        console.warn(
                          `[Scheduler] ⚠️ Alternative template text also used, skipping slot: templateId="${template.id}"`
                        );
                        slotsSkipped += 1;
                        continue;
                      }

                      text = newCandidateText;
                      usedTemplatesInCurrentGeneration.add(template.id);
                      usedTextsInCurrentGeneration.add(text);
                      templateIdForSlot = template.id;
                      console.log(
                        `[Scheduler] ✅ Using alternative template text (hybrid mode, slot ${slotIndex}): user ${userId}, kind: ${kind}, templateId="${template.id}"`
                      );
                    } else {
                      // Если альтернативный шаблон не найден, используем AI если доступен
                      if (hasAiTexts && aiTexts) {
                        console.log(
                          `[Scheduler] 🔍 No alternative template found, using AI text instead (hybrid mode, slot ${slotIndex}): user ${userId}, kind: ${kind}`
                        );
                        if (
                          !tryUseAiText(
                            aiTexts,
                            slotIndex,
                            'hybrid mode, no alternative template'
                          )
                        ) {
                          slotsSkipped += 1;
                          continue;
                        }
                      } else {
                        // Если альтернативный шаблон не найден и нет AI-текстов, пропускаем слот
                        console.warn(
                          `[Scheduler] ⚠️ No alternative template found and no AI texts, skipping slot: user ${userId}, kind: ${kind}`
                        );
                        slotsSkipped += 1;
                        continue;
                      }
                    }
                  } else {
                    // Текст не использован - используем его
                    usedTemplatesInCurrentGeneration.add(template.id);
                    usedTextsInCurrentGeneration.add(candidateText);
                    templateIdForSlot = template.id;
                    text = candidateText;
                    console.log(
                      `[Scheduler] ✅ Using template text (hybrid mode, slot ${slotIndex}): user ${userId}, kind: ${kind}, templateId="${template.id}"`
                    );
                  }
                } else {
                  // Шаблон не найден - если есть AI-тексты, используем их для всех слотов
                  if (hasAiTexts && aiTexts) {
                    console.log(
                      `[Scheduler] 🔍 No templates found, using AI text for all slots (hybrid mode, slot ${slotIndex}): user ${userId}, kind: ${kind}`
                    );
                    if (
                      !tryUseAiText(
                        aiTexts,
                        slotIndex,
                        'hybrid mode, no templates'
                      )
                    ) {
                      slotsSkipped += 1;
                      continue;
                    }
                  } else {
                    // Если шаблон не найден и нет AI-текстов, пропускаем слот
                    console.warn(
                      `[Scheduler] ⚠️ No templates found and no AI texts, skipping slot: user ${userId}, kind: ${kind}, slot ${slotIndex}`
                    );
                    slotsSkipped += 1;
                    continue;
                  }
                }
              }
            }
          } else {
            // Режим templates или undefined - используем шаблоны
            if (!text) {
              // ВАЖНО: Для детерминированного выбора используем scheduledAt и userId
              // Это обеспечит одинаковый выбор шаблона при каждой регенерации для одного и того же времени
              const timeHash = scheduledAt.getTime();
              const deterministicTemplateIndex = (timeHash + userId) % 1000000;

              console.log(
                `[Scheduler] 🔍 Deterministic template selection: scheduledAt=${scheduledAt.toISOString()}, timeHash=${timeHash}, userId=${userId}, templateIndex=${deterministicTemplateIndex}, actualSubtype=${actualSubtype}`
              );

              // ВАЖНО: Всегда используем excludeTemplateIds для предотвращения дублирования
              // Если все шаблоны использованы, findTemplate автоматически сбросит список и начнет заново
              template = findTemplate(kind as NotificationKind, {
                entityKey: entityKey,
                intent,
                subtype: actualSubtype as NotificationSubtype | undefined,
                excludeTemplateIds: Array.from(
                  usedTemplatesInCurrentGeneration
                ), // ВСЕГДА используем исключения для предотвращения дублирования
                templateIndex: deterministicTemplateIndex, // Детерминированный выбор на основе времени
              });

              // Fallback для habits
              if (!template && kind === 'habits' && actualSubtype) {
                const fallbackSubtypes: Array<
                  'reminder' | 'informational' | 'motivational'
                > =
                  actualSubtype === 'reminder'
                    ? ['informational', 'motivational']
                    : actualSubtype === 'informational'
                      ? ['reminder', 'motivational']
                      : ['reminder', 'informational'];

                for (const fallbackSubtype of fallbackSubtypes) {
                  const timeHash = scheduledAt.getTime();
                  const deterministicTemplateIndex =
                    (timeHash + userId) % 1000000;
                  template = findTemplate(kind as NotificationKind, {
                    entityKey: entityKey,
                    intent,
                    subtype: fallbackSubtype,
                    excludeTemplateIds: Array.from(
                      usedTemplatesInCurrentGeneration
                    ), // ВСЕГДА используем исключения для предотвращения дублирования
                    templateIndex: deterministicTemplateIndex, // Детерминированный выбор на основе времени
                  });
                  if (template) break;
                }
              }

              if (template) {
                // Получаем текст шаблона
                const candidateText = getTemplateText(
                  template,
                  addressing as any,
                  sourcePref.directness as any,
                  userName ?? undefined
                );

                // ВАЖНО: Проверяем, не использовался ли этот текст недавно
                // Это предотвращает дублирование одинаковых текстов в соседних слотах
                if (usedTextsInCurrentGeneration.has(candidateText)) {
                  console.warn(
                    `[Scheduler] ⚠️ Text already used, trying another template: templateId="${template.id}", text="${candidateText.substring(0, 50)}..."`
                  );

                  // Исключаем этот шаблон и пробуем найти другой
                  usedTemplatesInCurrentGeneration.add(template.id);
                  const timeHash = scheduledAt.getTime();
                  const alternativeTemplateIndex =
                    (timeHash + userId + 1) % 1000000;
                  template = findTemplate(kind as NotificationKind, {
                    entityKey: entityKey,
                    intent,
                    subtype: actualSubtype as NotificationSubtype | undefined,
                    excludeTemplateIds: Array.from(
                      usedTemplatesInCurrentGeneration
                    ),
                    templateIndex: alternativeTemplateIndex,
                  });

                  if (template) {
                    // Пробуем новый шаблон
                    const newCandidateText = getTemplateText(
                      template,
                      addressing as any,
                      sourcePref.directness as any,
                      userName ?? undefined
                    );

                    // Если новый текст тоже использован, пропускаем этот слот
                    if (usedTextsInCurrentGeneration.has(newCandidateText)) {
                      console.warn(
                        `[Scheduler] ⚠️ Alternative template text also used, skipping slot: templateId="${template.id}"`
                      );
                      slotsSkipped += 1;
                      continue;
                    }

                    text = newCandidateText;
                    usedTemplatesInCurrentGeneration.add(template.id);
                    usedTextsInCurrentGeneration.add(text);
                    templateIdForSlot = template.id;
                    console.log(
                      `[Scheduler] ✅ Using alternative template text (templates mode): user ${userId}, kind: ${kind}, templateId="${template.id}"`
                    );
                  } else {
                    // Если альтернативный шаблон не найден, пропускаем слот
                    console.warn(
                      `[Scheduler] ⚠️ No alternative template found, skipping slot: user ${userId}, kind: ${kind}`
                    );
                    slotsSkipped += 1;
                    continue;
                  }
                } else {
                  // Текст не использован - используем его
                  usedTemplatesInCurrentGeneration.add(template.id);
                  usedTextsInCurrentGeneration.add(candidateText);
                  templateIdForSlot = template.id;
                  text = candidateText;
                  console.log(
                    `[Scheduler] ✅ Using template text (templates mode): user ${userId}, kind: ${kind}, templateId="${template.id}"`
                  );
                }
              } else {
                // Если шаблон не найден, но есть AI-тексты и textSource === 'templates' или undefined,
                // можно использовать AI-тексты как fallback (но только если textSource не 'templates' явно)
                // Или просто логируем для отладки
                if (textSource === undefined && aiTexts && aiTexts.length > 0) {
                  // Если textSource не определен и есть AI-тексты, используем их как fallback
                  const rawAiText = aiTexts[aiTextIndex % aiTexts.length];
                  // ВАЖНО: Заменяем {name} на имя пользователя в AI-текстах
                  text = formatNotificationTextWithName(rawAiText, userName);
                  aiTextIndex += 1;
                  templateIdForSlot = 'ai_generated';
                  console.log(
                    `[Scheduler] Template not found, using AI text as fallback: user ${userId}, kind: ${kind}`
                  );
                } else {
                  console.warn(
                    `[Scheduler] Template not found: user ${userId}, kind: ${kind}, intent: ${intent}, subtype: ${actualSubtype}, entityKey: ${entityKey || 'none'}, textSource: ${textSource}`
                  );
                }
              }
            }
          }

          // Если все еще нет текста - пропускаем
          if (!text) {
            console.warn(
              `[Scheduler] ❌ No text found for template entity after all checks: user ${userId}, kind: ${kind}, entityKey: ${entityKey || 'none'}, textSource: ${textSource || 'undefined'}, aiTexts: ${aiTexts?.length || 0}, template: ${template ? 'found' : 'not found'}`
            );
            slotsSkipped += 1;
            continue;
          }

          console.log(
            `[Scheduler] ✅ Selected text for template entity slot: user ${userId}, kind: ${kind}, templateId: ${templateIdForSlot}, text length: ${text.length}, isAi: ${templateIdForSlot === 'ai_generated'}`
          );
        }

        const isDevelopment = process.env.NODE_ENV !== 'production';
        let devPrefix = '';
        // Используем entityDisplayName для кастомных сущностей, entityKey для шаблонов
        const displayNameForPrefix = isCustomEntity
          ? entityName
          : entityKey || 'unknown';
        if (isDevelopment) {
          if (kind === 'therapy' && displayNameForPrefix) {
            devPrefix = `[${displayNameForPrefix.toUpperCase()}|${sourcePref.directness.toUpperCase()}] `;
          } else if (kind === 'habits') {
            const habitLabel = displayNameForPrefix || 'unknown';
            // Кастомная привычка определяется по isCustomEntity (найдена в БД)
            const subtypeLabel = actualSubtype
              ? actualSubtype.toUpperCase()
              : isCustomEntity
                ? 'CUSTOM'
                : 'N/A';
            devPrefix = `[${habitLabel}|${subtypeLabel}|${sourcePref.directness.toUpperCase()}] `;
          }
        }

        // Определяем, является ли текст AI-сгенерированным
        // TODO: Реализовать AI-генерацию в будущем
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
        console.log(
          `[Scheduler] 🎯 FINAL SLOT CREATION - Slot ${slotIndex}: templateId="${templateIdForSlot}", isAiGenerated=${templateIdForSlot === 'ai_generated'}, text="${text ? text.substring(0, 60) : 'null'}...", scheduledAt=${scheduledAt.toISOString()}`
        );

        // ВАЖНО: Используем то же значение, что и в payload.data.entityKey
        await db.insert(notificationSlots).values({
          id: slotId,
          userId,
          kind: sourcePref.kind,
          entityKey: finalEntityKey,
          entityDisplayName: entityName || null, // Читаемое название для удобства разработчиков
          scheduledAt,
          payload,
          templateId: templateIdForSlot,
          status: 'planned',
        });

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
            console.log(
              `[Scheduler] ✅ Saved text usage: aiTextId=${aiTextRecordId}, slotId=${slotId}, index=${selectedAiTextIndex}`
            );
          } catch (error) {
            console.error(`[Scheduler] ❌ Failed to save text usage:`, error);
            // Не прерываем выполнение, так как слот уже создан
          }
        }

        slotsCreated += 1;
        console.log(
          `[Scheduler] ✅ Created slot ${slotsCreated}: id=${slotId}, entityKey=${normalizedEntityKeyForSlot || entityKey || 'null'}, templateId=${templateIdForSlot}, scheduledAt=${scheduledAt.toISOString()}`
        );
      }

      if (DEBUG_NOTIFICATIONS) {
        console.log(`[Scheduler] ========== SLOT CREATION SUMMARY ==========`);
        console.log(
          `[Scheduler] 📊 Statistics: isCustomEntity=${isCustomEntity}, textSource=${textSource}, aiTexts loaded=${aiTexts ? aiTexts.length : 0}, customTexts count=${prefMeta?.customTexts?.length || 0}`
        );
        console.log(`[Scheduler] ========== END SLOT REGENERATION ==========`);
      }
      console.log(
        `[Scheduler] ✅ Regenerated slots for source: user ${userId}, kind: ${kind}, created: ${slotsCreated}, skipped: ${slotsSkipped}, total time slots: ${newSlotTimes.length}`
      );
    } catch (error) {
      console.error(
        `[Scheduler] ❌ Error during slot regeneration: user ${userId}, kind: ${kind}, entityKey: ${entityKey || 'none'}`,
        error
      );
      throw error;
    }
  })();

  // Сохраняем промис в Map ПЕРЕД await
  activeRegenerations.set(regenerationKey, regenerationPromise);

  try {
    // Ждем завершения операции
    await regenerationPromise;
  } finally {
    // Удаляем промис из Map после завершения операции
    activeRegenerations.delete(regenerationKey);
    console.log(
      `[Scheduler] 🧹 Cleaned up regeneration promise for: user ${userId}, kind: ${kind}, entityKey: ${entityKey || 'none'}`
    );
  }
}

/**
 * Триггер для пересоздания слотов при изменении настроек
 * Вызывается из API endpoints при PUT /api/notifications/prefs/:kind
 * Теперь использует регенерацию только для конкретного источника
 */
export async function triggerSlotRegeneration(
  userId: number,
  kind?: NotificationKind,
  options?: {
    entityKey?: string;
  }
): Promise<void> {
  if (kind) {
    // Регенерируем только для конкретного источника
    await regenerateSlotsForSource(userId, kind, options);
  } else {
    // Если kind не указан, пересоздаем все слоты (fallback)
    await generateAllSlotsForUser(userId);
  }
}
