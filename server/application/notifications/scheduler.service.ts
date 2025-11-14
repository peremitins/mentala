/**
 * Сервис планировщика уведомлений
 * Генерирует слоты на 1 день вперёд с глобальной оркестрацией
 *
 * TODO: Установить BullMQ и Redis для продакшена
 * npm install bullmq ioredis
 *
 * В MVP можно использовать простой cron через node-cron или встроенный setInterval
 */

import { eq, and, gt, gte, isNull, desc, count } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import { db } from '@/server/infrastructure/db/client';
import {
  notificationPreferences,
  notificationSlots,
  userPreferences,
  habits,
} from '@/server/infrastructure/db/schema';
import {
  findTemplate,
  getTemplateText,
  type NotificationKind,
} from '@/app/lib/notificationTemplates';
import type { NotificationPayload } from '@/shared/dto/notifications';

// ==========================================
// Конфигурация планировщика
// ==========================================

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
 * @param kind - тип уведомлений (therapy | habits)
 * @param options - дополнительные параметры фильтрации
 * @param lookbackDays - сколько дней назад проверять (по умолчанию 30)
 * @returns массив template IDs, которые были использованы недавно
 */
async function getRecentlyUsedTemplateIds(
  userId: number,
  kind: string,
  options?: {
    habitId?: string | null;
    topicKey?: string | null;
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
  ];

  // Фильтруем по habitId или topicKey для более точного отслеживания
  if (options?.habitId) {
    conditions.push(eq(notificationSlots.habitId, options.habitId));
  }
  if (options?.topicKey) {
    conditions.push(eq(notificationSlots.topicKey, options.topicKey));
  }

  const recentSlots = await db
    .select({ templateId: notificationSlots.templateId })
    .from(notificationSlots)
    .where(and(...conditions))
    .orderBy(desc(notificationSlots.scheduledAt))
    .limit(100); // Ограничиваем для производительности

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

  // 4. Получаем глобальные настройки пользователя (addressing, tone)
  const [globalPrefs] = await db
    .select()
    .from(userPreferences)
    .where(eq(userPreferences.userId, userId))
    .limit(1);

  const addressing = globalPrefs?.addressing || 'informal';
  const tone = globalPrefs?.tone || 'neutral';

  // 5. Получаем историю использованных шаблонов ПЕРЕД удалением слотов
  //    Это критично для избежания повторений при регенерации
  const excludedTemplatesMap = new Map<string, Set<string>>();
  for (const pref of allPrefs) {
    const key = `${pref.kind}:${pref.habitId}:${pref.topicKey}`;
    const excludedIds = await getRecentlyUsedTemplateIds(
      userId,
      pref.kind,
      {
        habitId: pref.habitId,
        topicKey: pref.topicKey,
      },
      30 // Смотрим за последние 30 дней
    );
    excludedTemplatesMap.set(key, new Set(excludedIds));
    console.log(
      `[Scheduler] Excluded ${excludedIds.length} recently used templates for ${key}`
    );
  }

  // 6. Удаляем ВСЕ старые planned слоты пользователя
  const now = new Date();
  await db
    .delete(notificationSlots)
    .where(
      and(
        eq(notificationSlots.userId, userId),
        eq(notificationSlots.status, 'planned'),
        gt(notificationSlots.scheduledAt, now)
      )
    );

  console.log(`[Scheduler] Cleared old planned slots for user ${userId}`);

  // 7. Генерируем слоты для каждого источника с учетом его activeDays
  const slotAssignments: Array<{
    scheduledAt: Date;
    pref: (typeof allPrefs)[0];
  }> = [];

  for (const pref of allPrefs) {
    const timezone = pref.timezone || 'Europe/Moscow';
    const activeDays = (pref.activeDays as number[]) ?? [0, 1, 2, 3, 4, 5, 6];
    const timeRangeStart = pref.timeRangeStart ?? 540; // 09:00
    const timeRangeEnd = pref.timeRangeEnd ?? 1350; // 22:30
    const customSlotTimes =
      (pref.customSlotTimes as (number | null)[] | null) ?? null;

    // Генерируем слоты только для активных дней этого источника
    const sourceSlotTimes = generateGlobalSlotTimes(
      pref.timesPerDay,
      timezone,
      SCHEDULE_CONFIG.horizonDays,
      activeDays,
      timeRangeStart,
      timeRangeEnd,
      customSlotTimes
    );

    // Добавляем слоты в общий список
    for (const scheduledAt of sourceSlotTimes) {
      slotAssignments.push({
        scheduledAt,
        pref,
      });
    }
  }

  // Сортируем слоты по времени для равномерного распределения
  slotAssignments.sort(
    (a, b) => a.scheduledAt.getTime() - b.scheduledAt.getTime()
  );

  console.log(
    `[Scheduler] Generated ${slotAssignments.length} slots for ${allPrefs.length} sources`
  );

  // 8. Создаём слоты в БД (история уже получена в шаге 5)
  for (const { scheduledAt, pref } of slotAssignments) {
    // Получаем habitKey и intent
    let habitKey: string | undefined;
    let intent: 'build' | 'quit' | 'custom' | undefined;

    console.log(
      `[Scheduler] Processing slot: kind=${pref.kind}, habitId=${pref.habitId || 'NULL'}, topicKey=${pref.topicKey || 'NULL'}`
    );

    if (pref.kind === 'habits' && pref.habitId) {
      // ✅ pref.habitId УЖЕ содержит habitKey (water, smoking, steps)!
      // НЕ ищем habit в БД, используем habitId напрямую как habitKey
      habitKey = pref.habitId;

      // Получаем intent из любой привычки с этим habitKey
      const [habit] = await db
        .select()
        .from(habits)
        .where(eq(habits.habitKey, habitKey))
        .limit(1);

      if (habit) {
        intent = habit.intent as 'build' | 'quit' | 'custom';
        console.log(
          `[Scheduler] ✅ Using habitKey="${habitKey}", intent=${intent} (from habit: "${habit.name}")`
        );
      } else {
        // Если нет привычки с таким habitKey, пробуем определить intent по ключу
        if (
          ['water', 'steps', 'training', 'sleep', 'meditation'].includes(
            habitKey
          )
        ) {
          intent = 'build';
        } else if (
          ['smoking', 'alcohol', 'sugar', 'caffeine'].includes(habitKey)
        ) {
          intent = 'quit';
        } else {
          intent = 'custom';
        }
        console.log(
          `[Scheduler] ⚠️ No habit found with habitKey="${habitKey}", inferred intent=${intent}`
        );
      }
    } else if (pref.kind === 'habits') {
      console.warn(
        `[Scheduler] ⚠️ Habit preference without habitId! This should not happen.`
      );
    }

    // Определяем фактический subtype (обрабатываем 'mixed' и fallback для quit-привычек)
    let actualSubtype = pref.subtype;
    if (pref.subtype === 'mixed') {
      // Для habits выбираем случайный тип из всех доступных
      const subtypes: Array<'reminder' | 'informational' | 'motivational'> = [
        'reminder',
        'informational',
        'motivational',
      ];
      actualSubtype = subtypes[Math.floor(Math.random() * subtypes.length)];
    }

    // Для quit-привычек (smoking, alcohol, etc.) нет reminder шаблонов
    // Если пользователь выбрал reminder для quit-привычки, используем informational или motivational
    if (
      pref.kind === 'habits' &&
      intent === 'quit' &&
      actualSubtype === 'reminder'
    ) {
      // Для quit-привычек используем informational или motivational вместо reminder
      actualSubtype = Math.random() > 0.5 ? 'informational' : 'motivational';
      console.log(
        `[Scheduler] ⚠️ Quit habit with reminder subtype, using ${actualSubtype} instead`
      );
    }

    // Получаем список исключенных шаблонов для этого источника
    const excludeKey = `${pref.kind}:${pref.habitId}:${pref.topicKey}`;
    const excludeTemplateIdsSet =
      excludedTemplatesMap.get(excludeKey) ?? new Set<string>();
    excludedTemplatesMap.set(excludeKey, excludeTemplateIdsSet);
    const excludeTemplateIds = Array.from(excludeTemplateIdsSet);

    console.log(
      `[Scheduler] Looking for template: kind=${pref.kind}, intent=${intent}, habitKey=${habitKey || 'NULL'}, subtype=${actualSubtype}`
    );

    // Подбираем случайный шаблон с учётом истории
    // addressing и tone больше не используются в фильтрации, берутся из БД для выбора текста
    let template = findTemplate(pref.kind as NotificationKind, {
      topicKey: pref.topicKey ?? undefined,
      intent, // Передаем intent из БД (build/quit/custom)
      habitKey: habitKey as any, // Передаем habitKey из БД (water, smoking и т.д.)
      subtype: actualSubtype as
        | 'reminder'
        | 'informational'
        | 'motivational'
        | undefined,
      excludeTemplateIds, // Исключаем недавно использованные
    });

    // Fallback для habits: если шаблон не найден с выбранным subtype, пробуем другие
    if (!template && pref.kind === 'habits' && actualSubtype) {
      const fallbackSubtypes: Array<
        'reminder' | 'informational' | 'motivational'
      > =
        actualSubtype === 'reminder'
          ? ['informational', 'motivational']
          : actualSubtype === 'informational'
            ? ['reminder', 'motivational']
            : ['reminder', 'informational'];

      for (const fallbackSubtype of fallbackSubtypes) {
        template = findTemplate(pref.kind as NotificationKind, {
          topicKey: pref.topicKey ?? undefined,
          intent,
          habitKey: habitKey as any,
          subtype: fallbackSubtype,
          excludeTemplateIds,
        });
        if (template) {
          console.log(
            `[Scheduler] ⚠️ Template not found with subtype=${actualSubtype}, using ${fallbackSubtype} instead`
          );
          break;
        }
      }
    }

    if (!template) {
      console.warn(
        `[Scheduler] No template found for user ${userId}, kind: ${pref.kind}, topicKey: ${pref.topicKey}, habitId: ${pref.habitId}, directness: ${pref.directness}`
      );
      continue;
    }

    excludeTemplateIdsSet.add(template.id);

    const text = getTemplateText(
      template,
      addressing as any,
      pref.directness as any,
      undefined // TODO: получить имя пользователя
    );

    // В dev mode добавляем развёрнутую метку для тестирования
    const isDevelopment = process.env.NODE_ENV !== 'production';
    let devPrefix = '';
    if (isDevelopment) {
      // Для therapy: topicKey + directness
      if (pref.kind === 'therapy' && pref.topicKey) {
        devPrefix = `[${pref.topicKey.toUpperCase()}|${pref.directness.toUpperCase()}] `;
      }
      // Для habits: habitId + subtype + directness
      else if (pref.kind === 'habits') {
        const habitLabel = pref.habitId || 'custom';
        devPrefix = `[${habitLabel}|${actualSubtype?.toUpperCase()}|${pref.directness.toUpperCase()}] `;
      }
    }

    const payload: NotificationPayload = {
      title: 'Mentai: время паузы',
      body: `${devPrefix}${text}`,
      templateId: template.id,
      action: 'open',
      deepLink: pref.kind === 'therapy' ? '/support' : '/habits',
      data: {
        kind: pref.kind as NotificationKind,
        habitId: pref.habitId ?? undefined,
        topicKey: pref.topicKey ?? undefined,
        slotId: '', // будет переопределено ниже
        ...(isDevelopment && {
          subtype: actualSubtype,
          directness: pref.directness,
        }), // Добавляем subtype и directness в dev mode
      },
    };

    const slotId = nanoid();
    payload.data!.slotId = slotId;

    await db.insert(notificationSlots).values({
      id: slotId,
      userId,
      kind: pref.kind,
      habitId: habitKey ?? null, // Сохраняем habitKey (water, smoking), а НЕ habit.id!
      topicKey: pref.topicKey ?? null,
      scheduledAt,
      payload,
      templateId: template.id,
      status: 'planned',
    });
  }

  console.log(
    `[Scheduler] ✅ Generated ${slotAssignments.length} slots for user ${userId}`
  );
}

/**
 * Генерирует глобальное расписание временных меток
 * с равномерным распределением по дню
 * @param totalPerDay - общее количество уведомлений в день
 * @param timezone - IANA timezone пользователя
 * @param days - количество дней вперёд
 * @param activeDays - массив активных дней недели (0 = Воскресенье, 1 = Понедельник, ..., 6 = Суббота)
 * @param timeRangeStart - начало временного окна в минутах (по умолчанию 540 = 09:00)
 * @param timeRangeEnd - конец временного окна в минутах (по умолчанию 1350 = 22:30)
 * @returns массив дат (UTC) для слотов
 */
function generateGlobalSlotTimes(
  totalPerDay: number,
  timezone: string,
  days: number,
  activeDays: number[] = [0, 1, 2, 3, 4, 5, 6],
  timeRangeStart: number = 540,
  timeRangeEnd: number = 1350,
  customSlotTimes: (number | null)[] | null = null
): Date[] {
  const slots: Date[] = [];
  const now = new Date();
  if (totalPerDay <= 0) {
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

    // Минимальный шаг с учётом minGap
    const minGap = SCHEDULE_CONFIG.minGapMinutes;
    const requiredTime = totalPerDay * minGap;

    if (requiredTime > windowDuration) {
      console.warn(
        `[Scheduler] Warning: ${totalPerDay} notifications need ${requiredTime} min, but window is ${windowDuration} min`
      );
    }

    // Вычисляем оптимальный шаг
    const step = Math.max(minGap, windowDuration / totalPerDay);
    const manualTimes = Array.isArray(customSlotTimes) ? customSlotTimes : [];

    for (let i = 0; i < totalPerDay; i++) {
      const manualValue = manualTimes[i];
      let slotMinutes: number;

      if (manualValue !== null && manualValue !== undefined) {
        slotMinutes = manualValue;
      } else {
        // Базовое время (центр интервала) от начала временного окна
        slotMinutes = timeRangeStart + step * i + step / 2;

        // Применяем джиттер
        const jitter = (Math.random() * 2 - 1) * SCHEDULE_CONFIG.jitterMinutes;
        slotMinutes += jitter;

        // Нормализуем время с учетом перехода через полночь
        slotMinutes = Math.round(slotMinutes);

        // Если диапазон через полночь, нормализуем минуты
        if (slotMinutes >= 1440) {
          slotMinutes = slotMinutes % 1440;
        }

        // Ограничиваем временным окном
        if (!crossesMidnight) {
          // Обычный диапазон
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

      // Если диапазон через полночь и время раньше полудня, добавляем день
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

// ==========================================
// Генерация слотов для конкретного источника (legacy, используется для совместимости)
// ==========================================

/**
 * Генерирует слоты уведомлений для конкретного типа (therapy | habits)
 * ⚠️ Deprecated: используйте generateAllSlotsForUser() для глобальной оркестрации
 * @param userId - ID пользователя
 * @param kind - тип уведомлений
 * @param options - опциональные параметры (habitId для habits, topicKey для therapy)
 */
export async function generateSlotsForUser(
  userId: number,
  kind: NotificationKind,
  options?: {
    habitId?: string;
    topicKey?: string;
  }
): Promise<void> {
  const { habitId, topicKey } = options || {};

  console.log(
    `[Scheduler] Generating slots for user ${userId}, kind: ${kind}`,
    habitId ? `, habitId: ${habitId}` : '',
    topicKey ? `, topicKey: ${topicKey}` : ''
  );

  // 1. Получаем настройки пользователя с учётом habitId/topicKey
  // Строим WHERE условие правильно, объединяя все условия через and()
  const conditions = [
    eq(notificationPreferences.userId, userId),
    eq(notificationPreferences.kind, kind),
  ];

  if (kind === 'habits' && habitId) {
    // Per-habit настройки
    conditions.push(eq(notificationPreferences.habitId, habitId));
  } else if (kind === 'therapy' && topicKey) {
    // Per-topic настройки
    conditions.push(eq(notificationPreferences.topicKey, topicKey));
  } else {
    // Общие настройки (без habitId/topicKey)
    conditions.push(isNull(notificationPreferences.habitId));
    conditions.push(isNull(notificationPreferences.topicKey));
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

  // 3. Удаляем старые запланированные слоты с учётом habitId/topicKey
  const now = new Date();
  const deleteConditions = [
    eq(notificationSlots.userId, userId),
    eq(notificationSlots.kind, kind),
    eq(notificationSlots.status, 'planned'),
    gt(notificationSlots.scheduledAt, now),
  ];

  if (habitId) {
    deleteConditions.push(eq(notificationSlots.habitId, habitId));
  } else {
    // Если не указан habitId, удаляем только слоты без habitId
    deleteConditions.push(isNull(notificationSlots.habitId));
  }

  if (topicKey) {
    deleteConditions.push(eq(notificationSlots.topicKey, topicKey));
  } else {
    // Если не указан topicKey, удаляем только слоты без topicKey
    deleteConditions.push(isNull(notificationSlots.topicKey));
  }

  await db.delete(notificationSlots).where(and(...deleteConditions));

  // 4. Получаем habitKey и intent
  let habitKey: string | undefined;
  let intent: 'build' | 'quit' | 'custom' | undefined;

  if (kind === 'habits' && habitId) {
    // ✅ habitId УЖЕ содержит habitKey (water, smoking, steps)!
    habitKey = habitId;

    // Получаем intent из любой привычки с этим habitKey
    const [habit] = await db
      .select()
      .from(habits)
      .where(eq(habits.habitKey, habitKey))
      .limit(1);

    if (habit) {
      intent = habit.intent as 'build' | 'quit' | 'custom';
      console.log(
        `[generateSlotsForUser] Using habitKey="${habitKey}", intent=${intent} (from habit: "${habit.name}")`
      );
    } else {
      // Fallback: определяем intent по ключу
      if (
        ['water', 'steps', 'training', 'sleep', 'meditation'].includes(habitKey)
      ) {
        intent = 'build';
      } else if (
        ['smoking', 'alcohol', 'sugar', 'caffeine'].includes(habitKey)
      ) {
        intent = 'quit';
      } else {
        intent = 'custom';
      }
      console.log(
        `[generateSlotsForUser] No habit with habitKey="${habitKey}", inferred intent=${intent}`
      );
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
  for (const scheduledAt of slots) {
    // Подбираем случайный шаблон
    // addressing и tone больше не используются в фильтрации, берутся из БД для выбора текста
    const template = findTemplate(kind, {
      topicKey,
      intent, // Передаем intent из БД (build/quit/custom)
      habitKey: habitKey as any, // Передаем habitKey из БД (water, smoking и т.д.)
      subtype: prefs.subtype as
        | 'reminder'
        | 'informational'
        | 'motivational'
        | undefined,
    });

    if (!template) {
      console.warn(`[Scheduler] No template found for user ${userId}`);
      continue;
    }

    const text = getTemplateText(
      template,
      addressing as any,
      directness as any,
      undefined // TODO: получить имя пользователя
    );

    const payload: NotificationPayload = {
      title: 'Mentai: время паузы',
      body: text,
      templateId: template.id,
      action: 'open',
      deepLink: kind === 'therapy' ? '/support' : '/habits',
      data: {
        kind,
        habitId,
        topicKey,
        slotId: nanoid(), // будет переопределено ниже
      },
    };

    const slotId = nanoid();
    payload.data!.slotId = slotId;

    await db.insert(notificationSlots).values({
      id: slotId,
      userId,
      kind,
      habitId: habitKey ?? null, // Сохраняем habitKey (water, smoking), а НЕ habitId параметра!
      topicKey: topicKey ?? null,
      scheduledAt,
      payload,
      templateId: template.id,
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

    // Равномерно распределяем слоты
    const step = windowDuration / timesPerDay;
    const manualTimes = Array.isArray(customSlotTimes) ? customSlotTimes : [];

    for (let i = 0; i < timesPerDay; i++) {
      const manualValue = manualTimes[i];
      let slotMinutes: number;

      if (manualValue !== null && manualValue !== undefined) {
        slotMinutes = manualValue;
      } else {
        // Базовое время (центр интервала) от начала временного окна
        slotMinutes = timeRangeStart + step * i + step / 2;

        // Применяем джиттер
        const jitter = (Math.random() * 2 - 1) * SCHEDULE_CONFIG.jitterMinutes;
        slotMinutes += jitter;

        // Нормализуем время
        slotMinutes = Math.round(slotMinutes);

        // Если диапазон через полночь, нормализуем минуты
        if (slotMinutes >= 1440) {
          slotMinutes = slotMinutes % 1440;
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

  // Если слотов нет или их меньше ожидаемого - нужна регенерация
  if (actualSlotsCount < expectedSlots) {
    console.log(
      `[Scheduler] User ${userId} has ${actualSlotsCount} planned slots but needs ${expectedSlots} (checking from ${checkToday ? 'today' : 'tomorrow'}), regeneration needed`
    );
    return true;
  }

  return false;
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
 * Регенерирует слоты только для конкретного источника (habitId или topicKey)
 * Удаляет старые слоты для этого источника и пересоздает только их с учетом новых настроек
 * Сохраняет существующие слоты для других источников
 * @param userId - ID пользователя
 * @param kind - тип уведомлений (therapy | habits)
 * @param options - параметры источника (habitId для habits, topicKey для therapy)
 */
export async function regenerateSlotsForSource(
  userId: number,
  kind: NotificationKind,
  options?: {
    habitId?: string;
    topicKey?: string;
  }
): Promise<void> {
  const { habitId, topicKey } = options || {};

  console.log(
    `[Scheduler] Regenerating slots for source: user ${userId}, kind: ${kind}`,
    habitId ? `, habitId: ${habitId}` : '',
    topicKey ? `, topicKey: ${topicKey}` : ''
  );

  // Проверяем, что источник существует
  const conditions = [
    eq(notificationPreferences.userId, userId),
    eq(notificationPreferences.kind, kind),
  ];

  if (kind === 'habits' && habitId) {
    conditions.push(eq(notificationPreferences.habitId, habitId));
  } else if (kind === 'therapy' && topicKey) {
    conditions.push(eq(notificationPreferences.topicKey, topicKey));
  } else {
    // Общие настройки (без habitId/topicKey)
    conditions.push(isNull(notificationPreferences.habitId));
    conditions.push(isNull(notificationPreferences.topicKey));
  }

  const [sourcePref] = await db
    .select()
    .from(notificationPreferences)
    .where(and(...conditions))
    .limit(1);

  if (!sourcePref) {
    console.log(
      `[Scheduler] Source not found for user ${userId}, kind: ${kind}`,
      habitId ? `, habitId: ${habitId}` : '',
      topicKey ? `, topicKey: ${topicKey}` : ''
    );
    return;
  }

  // Получаем историю использованных шаблонов ДО удаления слотов
  const excludeTemplateIdsSet = new Set(
    await getRecentlyUsedTemplateIds(
      userId,
      kind,
      {
        habitId: habitId ?? null,
        topicKey: topicKey ?? null,
      },
      30
    )
  );

  const now = new Date();

  // Удаляем только слоты для этого источника
  const deleteConditions = [
    eq(notificationSlots.userId, userId),
    eq(notificationSlots.kind, kind),
    eq(notificationSlots.status, 'planned'),
    gt(notificationSlots.scheduledAt, now),
  ];

  if (habitId) {
    deleteConditions.push(eq(notificationSlots.habitId, habitId));
  } else {
    deleteConditions.push(isNull(notificationSlots.habitId));
  }

  if (topicKey) {
    deleteConditions.push(eq(notificationSlots.topicKey, topicKey));
  } else {
    deleteConditions.push(isNull(notificationSlots.topicKey));
  }

  await db.delete(notificationSlots).where(and(...deleteConditions));
  console.log(
    `[Scheduler] Removed old slots for source: user ${userId}, kind: ${kind}`
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

  // Генерируем временные метки для нового источника
  const timezone = sourcePref.timezone || 'Europe/Moscow';
  const activeDays = (sourcePref.activeDays as number[]) ?? [
    0, 1, 2, 3, 4, 5, 6,
  ];
  const timeRangeStart = sourcePref.timeRangeStart ?? 540; // 09:00
  const timeRangeEnd = sourcePref.timeRangeEnd ?? 1350; // 22:30
  const customSlotTimes =
    (sourcePref.customSlotTimes as (number | null)[] | null) ?? null;
  const newSlotTimes = generateSlotTimes(
    sourcePref.timesPerDay,
    timezone,
    SCHEDULE_CONFIG.horizonDays,
    activeDays,
    timeRangeStart,
    timeRangeEnd,
    customSlotTimes
  );

  // Получаем habitKey и intent для этого источника
  let habitKey: string | undefined;
  let intent: 'build' | 'quit' | 'custom' | undefined;

  if (kind === 'habits' && habitId) {
    habitKey = habitId;

    const [habit] = await db
      .select()
      .from(habits)
      .where(eq(habits.habitKey, habitKey))
      .limit(1);

    if (habit) {
      intent = habit.intent as 'build' | 'quit' | 'custom';
    } else {
      if (
        ['water', 'steps', 'training', 'sleep', 'meditation'].includes(habitKey)
      ) {
        intent = 'build';
      } else if (
        ['smoking', 'alcohol', 'sugar', 'caffeine'].includes(habitKey)
      ) {
        intent = 'quit';
      } else {
        intent = 'custom';
      }
    }
  }

  // Определяем фактический subtype
  let actualSubtype = sourcePref.subtype;
  if (sourcePref.subtype === 'mixed') {
    const subtypes: Array<'reminder' | 'informational' | 'motivational'> = [
      'reminder',
      'informational',
      'motivational',
    ];
    actualSubtype = subtypes[Math.floor(Math.random() * subtypes.length)];
  }

  if (kind === 'habits' && intent === 'quit' && actualSubtype === 'reminder') {
    actualSubtype = Math.random() > 0.5 ? 'informational' : 'motivational';
  }

  // Создаём новые слоты для этого источника
  for (const scheduledAt of newSlotTimes) {
    let template = findTemplate(kind as NotificationKind, {
      topicKey: topicKey ?? undefined,
      intent,
      habitKey: habitKey as any,
      subtype: actualSubtype as
        | 'reminder'
        | 'informational'
        | 'motivational'
        | undefined,
      excludeTemplateIds: Array.from(excludeTemplateIdsSet),
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
        template = findTemplate(kind as NotificationKind, {
          topicKey: topicKey ?? undefined,
          intent,
          habitKey: habitKey as any,
          subtype: fallbackSubtype,
          excludeTemplateIds: Array.from(excludeTemplateIdsSet),
        });
        if (template) break;
      }
    }

    if (!template) {
      console.warn(
        `[Scheduler] No template found for source: user ${userId}, kind: ${kind}`
      );
      continue;
    }

    excludeTemplateIdsSet.add(template.id);

    const text = getTemplateText(
      template,
      addressing as any,
      sourcePref.directness as any,
      undefined
    );

    const isDevelopment = process.env.NODE_ENV !== 'production';
    let devPrefix = '';
    if (isDevelopment) {
      if (kind === 'therapy' && topicKey) {
        devPrefix = `[${topicKey.toUpperCase()}|${sourcePref.directness.toUpperCase()}] `;
      } else if (kind === 'habits') {
        const habitLabel = habitId || 'custom';
        devPrefix = `[${habitLabel}|${actualSubtype?.toUpperCase()}|${sourcePref.directness.toUpperCase()}] `;
      }
    }

    const payload: NotificationPayload = {
      title: 'Mentai: время паузы',
      body: `${devPrefix}${text}`,
      templateId: template.id,
      action: 'open',
      deepLink: kind === 'therapy' ? '/support' : '/habits',
      data: {
        kind: kind as NotificationKind,
        habitId: habitId ?? undefined,
        topicKey: topicKey ?? undefined,
        slotId: '',
        ...(isDevelopment && {
          subtype: actualSubtype,
          directness: sourcePref.directness,
        }),
      },
    };

    const slotId = nanoid();
    payload.data!.slotId = slotId;

    await db.insert(notificationSlots).values({
      id: slotId,
      userId,
      kind: sourcePref.kind,
      habitId: habitKey ?? null,
      topicKey: topicKey ?? null,
      scheduledAt,
      payload,
      templateId: template.id,
      status: 'planned',
    });
  }

  console.log(
    `[Scheduler] ✅ Regenerated ${newSlotTimes.length} slots for source: user ${userId}, kind: ${kind}`
  );
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
    habitId?: string;
    topicKey?: string;
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
