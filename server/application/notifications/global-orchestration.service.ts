/**
 * Сервис глобальной оркестрации расписания уведомлений
 * Реализует равномерное распределение слотов по дням и чередование тем
 *
 * Согласно ТЗ: NOTIFICATION_SCHEDULING_ORCHESTRATION.md
 */

import { nanoid } from 'nanoid';
import { db } from '@/server/infrastructure/db/client';
import {
  users,
  userPreferences,
  habits,
  therapyTopicsCustom,
  notificationPreferences,
} from '@/server/infrastructure/db/schema';
import type { NotificationKind } from '@/shared/dto/notifications';
import { resolveAssistantTone } from '@/shared/constants/assistantTone';
import {
  toLocalTime,
  toUTC,
  getTimezoneFromPrefs,
  isValidTimezone,
} from './timezone.utils';
import { findEnabledPreferencesByUser } from './repositories/notification-preferences.repository';
import {
  countActiveSlotsInRange,
  countSentSlotsForToday,
  deletePlannedSlotsInRangeWithLimit,
  getActiveSlotsHorizonTail,
  insertSlot,
} from './repositories/notification-slots.repository';
import { loadTextsForPreference } from './notification-texts.service';
import {
  pickTextForSlot,
  type TextSelectionState,
  type PickTextParams,
} from './text-selection.service';
import { resolveEntityKeyForSlots } from './entity-key.service';
import {
  loadAiGeneratedTextsWithId,
  getUsedTextIndices,
  getUsedTextHashes,
  type AiNotificationText,
} from './ai-generation.service';
import { enqueueAiTextGenerationJob } from './queues/aiTextGeneration.queue';
import { computeDayOfYear } from './notification-date.utils';
import { and, eq, sql } from 'drizzle-orm';
import { pickNotificationImage } from './notification-images.service';
import { getCustomNotificationSourceAccessByKind } from './notification-source-access.service';
import { resolveTemplateTherapyTopic } from './notification-prompt-helpers';
import { buildAiTextConfigHashCandidates } from './notification-ai-hash.helpers';
import type {
  NotificationPayload,
  NotificationSubtype,
  NotificationNavigation,
} from '@/shared/dto/notifications';
import {
  DEFAULT_NOTIFICATION_TIME_RANGE_END,
  DEFAULT_NOTIFICATION_TIME_RANGE_START,
  DEFAULT_NOTIFICATION_TIMEZONE,
  LOCK_NAMESPACE_SLOTS_GENERATION,
  hoursToMs,
  minutesToMs,
  slotsScalingConfig,
} from './slots-scaling.config';
import {
  buildDeepLinkFromNavigation,
  resolveNavigationFromActionHint,
} from './breath-navigation.utils';
import {
  applyFlexibleSlotJitter,
  buildFlexibleSlotMinutes,
  buildSourcePhaseMap,
} from './slot-distribution.utils';
import {
  buildDailySequence as buildDailySequenceByQuota,
  type DailySequenceSlot,
} from './daily-sequence.utils';
import {
  clampNotificationTimesPerDay,
  MAX_NOTIFICATION_TIMES_PER_DAY,
  normalizeCustomSlotTimesByLimit,
} from './preferences-limits.utils';
import { getCurrentActiveSubscriptionWithPlan } from '@/server/application/subscriptions/current-subscription.service';

/**
 * Детерминированный джиттер для равномерного распределения слотов
 * Используется для гибких слотов между fixed-временами
 */
function generateDeterministicJitter(
  userId: number,
  slotDate: Date,
  slotIndex: number,
  jitterMinutes: number,
  kind?: string,
  entityKey?: string | null
): number {
  const dateStr = slotDate.toISOString().split('T')[0]; // YYYY-MM-DD
  const kindStr = kind || 'default';
  const entityKeyStr = entityKey || 'null';
  const seed = `${userId}-${kindStr}-${entityKeyStr}-${dateStr}-${slotIndex}`;
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    const char = seed.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  // Преобразуем в диапазон [-jitterMinutes, +jitterMinutes]
  return (Math.abs(hash) % (jitterMinutes * 2 + 1)) - jitterMinutes;
}

const DEBUG_NOTIFICATIONS = process.env.DEBUG_NOTIFICATIONS === 'true';

const SCHEDULE_CONFIG = {
  horizonDays: 2, // Сегодня + завтра
  jitterMinutes: slotsScalingConfig.regeneration.jitterMinutes,
};

export class SlotsGenerationLockTimeoutError extends Error {
  constructor(timeoutMs: number) {
    super(`Slots regeneration lock timeout after ${timeoutMs}ms`);
    this.name = 'SlotsGenerationLockTimeoutError';
  }
}

async function sleepMs(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

type RegenTransactionResult = {
  locked: boolean;
  deletedCount: number;
  insertedCount: number;
  lockAcquireMs: number;
};

function buildActionFromNavigation(navigation: NotificationNavigation): {
  action: string;
  params?: Record<string, string>;
} {
  switch (navigation.type) {
    case 'meditation_track':
      return {
        action: 'open_meditation_track',
        params: { trackId: navigation.trackId },
      };
    case 'breath_practices':
      return { action: 'open_breath_practices' };
    case 'breath_practice':
      return {
        action: 'open_breath_practice',
        params: { practiceId: navigation.slug },
      };
    default:
      return { action: 'open_home' };
  }
}

function hasPaidPlanForImages(planId: string | null | undefined): boolean {
  const normalized = planId?.trim().toLowerCase() ?? '';
  return normalized === 'pro' || normalized === 'premium';
}

/**
 * Интерфейс для источника уведомлений
 */
interface SourceInfo {
  preference: typeof notificationPreferences.$inferSelect;
  kind: NotificationKind;
  entityKey: string | null;
  normalizedEntityKey: string | null;
  isCustomEntity: boolean;
  timesPerDay: number;
  timeRangeStart: number;
  timeRangeEnd: number;
  customSlotTimes: (number | null)[] | null;
  activeDays: number[];
  crossesMidnight: boolean;
  interval: number; // Средний интервал между уведомлениями
  sentToday: number; // Количество отправленных слотов сегодня
  remainingSlots: number; // Оставшееся количество слотов на день
}

/**
 * Интерфейс для слота в последовательности
 */
interface SlotInSequence {
  source: SourceInfo;
  day: 0 | 1; // 0 = сегодня, 1 = завтра
  fixedTime: number | null; // Фиксированное время в минутах (если есть)
  isFixed: boolean; // Является ли слот фиксированным
  scheduledAt?: Date; // Время слота (назначается позже)
}

function normalizeCustomSlotTimesForGeneration(params: {
  userId: number;
  kind: NotificationKind;
  entityKey: string | null;
  customSlotTimes: (number | null)[] | null;
  limit: number;
}): (number | null)[] | null {
  const { customSlotTimes, limit } = params;
  if (!customSlotTimes || customSlotTimes.length === 0 || limit <= 0) {
    return null;
  }

  const normalizedInput = normalizeCustomSlotTimesByLimit(
    customSlotTimes,
    limit
  );
  if (!normalizedInput || normalizedInput.length === 0) {
    return null;
  }

  const seen = new Set<number>();
  const duplicateMinutes = new Set<number>();

  const normalized = normalizedInput.map((value) => {
    if (value === null || value === undefined) return null;

    const minute = Math.round(value);
    if (seen.has(minute)) {
      duplicateMinutes.add(minute);
      // Для дубликатов не создаём второй fixed-слот в то же время:
      // иначе срабатывает active-slot unique и одна запись тихо пропадает.
      return null;
    }

    seen.add(minute);
    return minute;
  });

  if (duplicateMinutes.size > 0) {
    console.warn(
      `[GlobalOrchestration] ⚠️ duplicate customSlotTimes detected for user=${params.userId}, source=${params.kind}:${params.entityKey ?? 'null'}, duplicateMinutes=${[...duplicateMinutes].join(',')}. Duplicates are treated as flexible slots.`
    );
  }

  return normalized.some((value) => value !== null) ? normalized : null;
}

function buildRegenRangeUtc(params: {
  nowUtc: Date;
  timezone: string;
  forceTodaySlots?: boolean;
}): {
  regenRangeStartUtc: Date;
  regenRangeEndUtc: Date;
} {
  const nowLocal = toLocalTime(params.nowUtc, params.timezone);

  // Для ручных изменений расписания (forceTodaySlots=true) начинаем пересоздание
  // с текущего момента, чтобы будущие слоты сегодняшнего дня вступали в силу сразу.
  const safeStartMinutes = params.forceTodaySlots
    ? 0
    : Math.max(
        slotsScalingConfig.regeneration.safeWindowMinutes,
        slotsScalingConfig.regeneration.safeQueuedWindowMinutes
      );

  const regenRangeStartLocal = new Date(
    nowLocal.getTime() + minutesToMs(safeStartMinutes)
  );
  const regenRangeEndLocal = new Date(
    nowLocal.getTime() +
      hoursToMs(slotsScalingConfig.regeneration.targetHorizonHours)
  );

  return {
    regenRangeStartUtc: toUTC(regenRangeStartLocal, params.timezone),
    regenRangeEndUtc: toUTC(regenRangeEndLocal, params.timezone),
  };
}

/**
 * Вычисляет количество частичных слотов для текущего дня
 */
function calculatePartialSlotsForToday(
  source: SourceInfo,
  nowLocal: Date
): number {
  const currentMinutes = nowLocal.getHours() * 60 + nowLocal.getMinutes();
  const { timeRangeStart, timeRangeEnd, crossesMidnight, remainingSlots } =
    source;

  // Проверяем, попадает ли текущее время в диапазон
  let isInRange = false;
  let remainingMinutes = 0;

  if (crossesMidnight) {
    // Диапазон через полночь (например, 18:00-04:00)
    if (currentMinutes >= timeRangeStart || currentMinutes <= timeRangeEnd) {
      isInRange = true;
      if (currentMinutes >= timeRangeStart) {
        // Мы в первой части (вечер)
        remainingMinutes = 1440 - currentMinutes + timeRangeEnd;
      } else {
        // Мы во второй части (утро)
        remainingMinutes = timeRangeEnd - currentMinutes;
      }
    } else {
      // Между end и start - это "до начала" окна (например, 10:00 при окне 18:00-04:00)
      // По ТЗ это "ещё не началось" → планируем полное количество
      return remainingSlots;
    }
  } else {
    // Обычный диапазон
    if (currentMinutes >= timeRangeStart && currentMinutes <= timeRangeEnd) {
      isInRange = true;
      remainingMinutes = timeRangeEnd - currentMinutes;
    } else if (currentMinutes < timeRangeStart) {
      // Ещё не началось - генерируем все слоты
      return remainingSlots;
    } else {
      // Уже закончилось - 0 слотов на сегодня
      return 0;
    }
  }

  if (!isInRange) {
    return 0;
  }

  // ВАЖНО: Для расчета слотов на сегодня используем пропорциональный подход
  // Если осталось X минут, а полный диапазон Y минут, то можем создать (X / Y) * timesPerDay слотов
  // Но также учитываем минимальный интервал между слотами (10 минут)

  const MIN_INTERVAL_MINUTES = 10;

  // Проверяем минимальное время для хотя бы одного слота
  if (remainingMinutes < MIN_INTERVAL_MINUTES) {
    console.log(
      `[calculatePartialSlotsForToday] Source ${source.kind}:${source.entityKey || 'null'} - remainingMinutes (${remainingMinutes}) < MIN_INTERVAL_MINUTES (${MIN_INTERVAL_MINUTES}), returning 0`
    );
    return 0;
  }

  // Вычисляем полную длину окна для расчета пропорции
  const fullWindowDuration = crossesMidnight
    ? 1440 - timeRangeStart + timeRangeEnd
    : timeRangeEnd - timeRangeStart;

  // Вычисляем пропорцию оставшегося времени к полному окну
  const timeRatio = remainingMinutes / fullWindowDuration;

  // Вычисляем максимальное количество слотов на основе пропорции
  // Используем Math.ceil для округления вверх, чтобы создавать слоты даже при небольшом оставшемся времени
  const maxByTimeRatio = Math.ceil(timeRatio * source.timesPerDay);

  // Также вычисляем максимум на основе минимального интервала между слотами
  const maxByMinInterval = Math.floor(remainingMinutes / MIN_INTERVAL_MINUTES);

  // Берем минимум из двух подходов (пропорция и минимальный интервал)
  const maxByTime = Math.min(maxByTimeRatio, maxByMinInterval);

  // Итоговое количество - минимум из maxByTime и remainingSlots
  const slotsToday = Math.min(maxByTime, remainingSlots);

  // ВАЖНО: Если есть хотя бы минимальное время и remainingSlots > 0, создаём хотя бы один слот
  if (
    slotsToday === 0 &&
    remainingSlots > 0 &&
    remainingMinutes >= MIN_INTERVAL_MINUTES
  ) {
    console.log(
      `[calculatePartialSlotsForToday] Source ${source.kind}:${source.entityKey || 'null'} - slotsToday is 0 but remainingSlots (${remainingSlots}) > 0 and remainingMinutes (${remainingMinutes}) >= MIN_INTERVAL_MINUTES, returning 1`
    );
    return 1; // Создаём хотя бы один слот, если есть время
  }

  console.log(
    `[calculatePartialSlotsForToday] Source ${source.kind}:${source.entityKey || 'null'} - currentMinutes: ${currentMinutes}, timeRange: ${timeRangeStart}-${timeRangeEnd}, remainingMinutes: ${remainingMinutes}, fullWindowDuration: ${fullWindowDuration}, timeRatio: ${timeRatio.toFixed(3)}, maxByTimeRatio: ${maxByTimeRatio}, maxByMinInterval: ${maxByMinInterval}, maxByTime: ${maxByTime}, remainingSlots: ${remainingSlots}, slotsToday: ${slotsToday}`
  );

  return slotsToday;
}

/**
 * Строит последовательность слотов на день с учетом чередования тем
 * Использует weighted round-robin по группам и темам
 */
export function buildDailySequence(
  sources: SourceInfo[],
  day: 0 | 1
): SlotInSequence[] {
  return buildDailySequenceByQuota(
    sources,
    day
  ) as DailySequenceSlot<SourceInfo>[];
}

/**
 * Назначает времена для последовательности слотов
 * Фиксированные времена назначаются первыми, затем гибкие слоты распределяются равномерно
 */
function assignTimesToSequence(
  sequence: SlotInSequence[],
  timezone: string,
  nowLocal: Date
): void {
  // Группируем слоты по дням и источникам
  const slotsByDayAndSource = new Map<string, SlotInSequence[]>();

  for (const slot of sequence) {
    const key = `${slot.day}:${slot.source.kind}:${slot.source.entityKey || 'null'}`;
    if (!slotsByDayAndSource.has(key)) {
      slotsByDayAndSource.set(key, []);
    }
    slotsByDayAndSource.get(key)!.push(slot);
  }

  // Строим фазы источников по каждому дню только для источников с гибкими слотами.
  // habits и therapy участвуют в одной общей сетке времени.
  const phaseByDayAndSource = new Map<string, number>();
  const flexibleSourceKeysByDay = new Map<0 | 1, string[]>();

  for (const [key, daySlots] of slotsByDayAndSource) {
    const [dayStr] = key.split(':');
    const day = parseInt(dayStr) as 0 | 1;
    const hasFlexibleSlots = daySlots.some((slot) => !slot.isFixed);
    if (!hasFlexibleSlots) continue;

    if (!flexibleSourceKeysByDay.has(day)) {
      flexibleSourceKeysByDay.set(day, []);
    }
    flexibleSourceKeysByDay.get(day)!.push(key);
  }

  for (const [day, sourceKeys] of flexibleSourceKeysByDay) {
    const dayPhaseMap = buildSourcePhaseMap({ sourceKeys });
    for (const [sourceKey, phase] of dayPhaseMap) {
      phaseByDayAndSource.set(sourceKey, phase);
    }

    console.log(
      `[GlobalOrchestration] Day ${day}: phase map built for ${dayPhaseMap.size} flexible sources`
    );
  }

  // Обрабатываем каждый день и источник отдельно
  for (const [key, daySlots] of slotsByDayAndSource) {
    if (daySlots.length === 0) continue;

    const [dayStr] = key.split(':');
    const day = parseInt(dayStr) as 0 | 1;
    const dayDate = new Date(nowLocal);
    dayDate.setDate(dayDate.getDate() + day);
    dayDate.setHours(0, 0, 0, 0);

    const source = daySlots[0].source;
    const sourcePhase = phaseByDayAndSource.get(key) ?? 0.5;
    const { timeRangeStart, timeRangeEnd, crossesMidnight, customSlotTimes } =
      source;

    // Разделяем на фиксированные и гибкие слоты
    const fixedSlots = daySlots.filter(
      (s) => s.isFixed && s.fixedTime !== null
    );
    const flexibleSlots = daySlots.filter((s) => !s.isFixed);

    // Назначаем времена фиксированным слотам
    // Фильтруем fixed-слоты в прошлом и для day=1 с crossesMidnight (вторая часть окна)
    const validFixedSlots: SlotInSequence[] = [];

    for (const slot of fixedSlots) {
      if (slot.fixedTime !== null) {
        const fixedMinutes = slot.fixedTime;

        // Для crossesMidnight: если fixedTime в "второй части окна" (0..end),
        // переносим на следующий календарный день
        let actualDay = day;
        let actualMinutes = fixedMinutes;

        if (crossesMidnight && fixedMinutes <= timeRangeEnd) {
          // Это вторая часть окна (после полуночи)
          // ВАЖНО: Для day=1 (завтра) не создаём слоты на day=2 (послезавтра)
          // Планируем только вечернюю часть (timeRangeStart..24:00) для завтра
          if (day === 1) {
            // Пропускаем - это выходит за горизонт планирования
            continue;
          }
          // Для day=0 (сегодня) переносим на следующий день (day=1)
          actualDay = 1;
          actualMinutes = fixedMinutes;
        }

        const actualDayDate = new Date(nowLocal);
        actualDayDate.setDate(actualDayDate.getDate() + actualDay);
        actualDayDate.setHours(0, 0, 0, 0);

        const hours = Math.floor(actualMinutes / 60);
        const minutes = actualMinutes % 60;
        actualDayDate.setHours(hours, minutes, 0, 0);

        // Пропускаем fixed-слоты в прошлом для текущего дня
        if (day === 0 && actualDayDate <= nowLocal) {
          // Слот в прошлом - пропускаем, не назначаем время
          continue;
        }

        slot.scheduledAt = toUTC(actualDayDate, timezone);
        validFixedSlots.push(slot);
      }
    }

    // Распределяем гибкие слоты
    if (flexibleSlots.length > 0) {
      // Если есть фиксированные времена, распределяем гибкие между ними
      // Если нет фиксированных, распределяем равномерно по диапазону
      // ВАЖНО: Используем только validFixedSlots (исключаем слоты в прошлом и вне горизонта)
      if (validFixedSlots.length > 0 && customSlotTimes) {
        // Распределяем гибкие слоты между фиксированными временами
        // Используем scheduledAt для правильного порядка (учитывает переносы на следующий день)
        const fixedTimesWithDates = validFixedSlots
          .map((s) => ({
            fixedTime: s.fixedTime!,
            scheduledAt: s.scheduledAt!,
          }))
          .sort((a, b) => a.scheduledAt.getTime() - b.scheduledAt.getTime());

        // Преобразуем в минуты дня для расчёта интервалов
        // Для crossesMidnight и day=1: ограничиваем только вечерней частью
        const effectiveRangeStart = timeRangeStart;
        let effectiveRangeEnd = timeRangeEnd;

        if (crossesMidnight && day === 1) {
          // Для завтра планируем только вечернюю часть (timeRangeStart..24:00)
          effectiveRangeEnd = 1440; // 24:00
        }

        const fixedTimes = fixedTimesWithDates
          .map((ft) => {
            const scheduledLocal = toLocalTime(ft.scheduledAt, timezone);
            // ВАЖНО: Сравниваем полную дату (год, месяц, день), а не только число дня
            // Это предотвращает ошибки на границе месяцев (например, 31-е и 1-е)
            const scheduledDay =
              scheduledLocal.getFullYear() === nowLocal.getFullYear() &&
              scheduledLocal.getMonth() === nowLocal.getMonth() &&
              scheduledLocal.getDate() === nowLocal.getDate()
                ? 0
                : 1;
            const scheduledMinutes =
              scheduledLocal.getHours() * 60 + scheduledLocal.getMinutes();

            // Для crossesMidnight: нормализуем в линейные минуты
            if (
              crossesMidnight &&
              scheduledDay === 1 &&
              scheduledMinutes <= timeRangeEnd
            ) {
              // Это вторая часть окна на следующий день - нормализуем
              return scheduledMinutes + 1440;
            }
            return scheduledMinutes;
          })
          .sort((a, b) => a - b);
        const intervals: Array<{
          start: number;
          end: number;
          slots: SlotInSequence[];
        }> = [];

        // Создаём интервалы между фиксированными временами
        // Для crossesMidnight используем линейные минуты (например, 18:00..28:00)
        // Для day=1 с crossesMidnight ограничиваем только вечерней частью
        if (crossesMidnight && day === 0) {
          // Сегодня: используем полное окно с линейными минутами
          const normalizedStart = effectiveRangeStart;
          const normalizedEnd = effectiveRangeEnd + 1440;

          // Создаём интервалы
          for (let i = 0; i < fixedTimes.length; i++) {
            const start = i === 0 ? normalizedStart : fixedTimes[i - 1];
            const end = fixedTimes[i];
            intervals.push({ start, end, slots: [] });
          }
          // Последний интервал после последнего фиксированного времени
          if (fixedTimes.length > 0) {
            intervals.push({
              start: fixedTimes[fixedTimes.length - 1],
              end: normalizedEnd,
              slots: [],
            });
          } else {
            // Нет фиксированных времен - один интервал
            intervals.push({
              start: normalizedStart,
              end: normalizedEnd,
              slots: [],
            });
          }
        } else if (crossesMidnight && day === 1) {
          // Завтра: только вечерняя часть (timeRangeStart..24:00)
          const normalizedStart = effectiveRangeStart;
          const normalizedEnd = effectiveRangeEnd; // 1440 (24:00)

          // Фильтруем fixedTimes - только те, что в вечерней части (в пределах дня)
          const eveningFixedTimes = fixedTimes.filter((t) => {
            // Если t >= 1440, это уже следующий день - исключаем
            if (t >= 1440) return false;
            return t >= normalizedStart && t <= normalizedEnd;
          });

          // Создаём интервалы
          for (let i = 0; i < eveningFixedTimes.length; i++) {
            const start = i === 0 ? normalizedStart : eveningFixedTimes[i - 1];
            const end = eveningFixedTimes[i];
            intervals.push({ start, end, slots: [] });
          }
          // Последний интервал после последнего фиксированного времени
          if (eveningFixedTimes.length > 0) {
            intervals.push({
              start: eveningFixedTimes[eveningFixedTimes.length - 1],
              end: normalizedEnd,
              slots: [],
            });
          } else {
            // Нет фиксированных времен в вечерней части - один интервал
            intervals.push({
              start: normalizedStart,
              end: normalizedEnd,
              slots: [],
            });
          }
        } else {
          // Обычный режим (без crossesMidnight)
          for (let i = 0; i < fixedTimes.length; i++) {
            const start = i === 0 ? effectiveRangeStart : fixedTimes[i - 1];
            const end = fixedTimes[i];
            intervals.push({ start, end, slots: [] });
          }
          // Последний интервал после последнего фиксированного времени
          if (fixedTimes.length > 0) {
            intervals.push({
              start: fixedTimes[fixedTimes.length - 1],
              end: effectiveRangeEnd,
              slots: [],
            });
          } else {
            // Нет фиксированных времен - один интервал
            intervals.push({
              start: effectiveRangeStart,
              end: effectiveRangeEnd,
              slots: [],
            });
          }
        }

        // Распределяем гибкие слоты по интервалам пропорционально их длине
        const totalIntervalLength = intervals.reduce(
          (sum, interval) => sum + (interval.end - interval.start),
          0
        );

        let slotIndex = 0;
        for (const interval of intervals) {
          const intervalLength = interval.end - interval.start;
          const slotsForInterval = Math.round(
            (flexibleSlots.length * intervalLength) / totalIntervalLength
          );

          for (
            let i = 0;
            i < slotsForInterval && slotIndex < flexibleSlots.length;
            i++
          ) {
            interval.slots.push(flexibleSlots[slotIndex]);
            slotIndex++;
          }
        }

        // Назначаем времена для каждого интервала
        for (const interval of intervals) {
          if (interval.slots.length === 0) continue;
          const intervalBaseMinutes = buildFlexibleSlotMinutes({
            rangeStart: interval.start,
            rangeEnd: interval.end,
            slotsCount: interval.slots.length,
            phaseFraction: sourcePhase,
          });

          for (let i = 0; i < interval.slots.length; i++) {
            let minutesInDay = intervalBaseMinutes[i] ?? interval.start;

            // Добавляем детерминированный джиттер для гибких слотов
            const jitter = generateDeterministicJitter(
              source.preference.userId,
              dayDate,
              i, // Индекс внутри интервала
              SCHEDULE_CONFIG.jitterMinutes,
              source.kind,
              source.entityKey
            );
            minutesInDay = applyFlexibleSlotJitter({
              baseMinutes: minutesInDay,
              slotIndex: i,
              slotsCount: interval.slots.length,
              jitterMinutes: jitter,
            });

            // Ограничиваем в пределах интервала
            minutesInDay = Math.max(
              interval.start,
              Math.min(minutesInDay, interval.end)
            );

            // Для crossesMidnight: определяем день и нормализуем минуты
            let actualDay = day;
            let normalizedMinutes = minutesInDay;

            if (crossesMidnight && day === 0) {
              // Сегодня: если минуты >= 1440, это следующий день
              if (minutesInDay >= 1440) {
                actualDay = 1;
                normalizedMinutes = minutesInDay - 1440;
              } else {
                normalizedMinutes = minutesInDay;
              }
            } else if (crossesMidnight && day === 1) {
              // Завтра: только вечерняя часть, не выходим за 23:59 (1439 минут)
              // ВАЖНО: Ограничиваем до 1439, чтобы hours не стал 24 (что перенесёт на следующий день)
              normalizedMinutes = Math.min(minutesInDay, 1439);
              actualDay = 1;
            } else {
              // Обычный режим
              normalizedMinutes = minutesInDay % 1440;
            }

            const hours = Math.floor(normalizedMinutes / 60);
            const minutes = normalizedMinutes % 60;

            const actualDayDate = new Date(nowLocal);
            actualDayDate.setDate(actualDayDate.getDate() + actualDay);
            actualDayDate.setHours(0, 0, 0, 0);
            actualDayDate.setHours(hours, minutes, 0, 0);

            interval.slots[i].scheduledAt = toUTC(actualDayDate, timezone);
          }
        }
      } else {
        // Нет фиксированных времен - распределяем равномерно по диапазону
        // ВАЖНО: generateSlotTimes генерирует слоты начиная с сегодня, но нам нужно для конкретного дня
        // Поэтому генерируем времена вручную для нужного дня

        // Вычисляем интервал между слотами
        let effectiveRangeStart = timeRangeStart;
        const effectiveRangeEnd = timeRangeEnd;

        // ВАЖНО: Для сегодня (day=0) нужно учитывать текущее время
        // Если сейчас уже прошло начало диапазона, начинаем с текущего времени
        if (day === 0) {
          const currentMinutes =
            nowLocal.getHours() * 60 + nowLocal.getMinutes();
          if (!crossesMidnight) {
            // Обычный диапазон: если текущее время в диапазоне, начинаем с него
            if (
              currentMinutes >= timeRangeStart &&
              currentMinutes < timeRangeEnd
            ) {
              effectiveRangeStart = currentMinutes;
            } else if (currentMinutes < timeRangeStart) {
              // Ещё не началось - используем полный диапазон
              effectiveRangeStart = timeRangeStart;
            } else {
              // Уже закончилось - не должно быть слотов, но на всякий случай
              effectiveRangeStart = timeRangeStart;
            }
          } else {
            // Диапазон через полночь
            if (currentMinutes >= timeRangeStart) {
              // Мы в первой части (вечер) - начинаем с текущего времени
              effectiveRangeStart = currentMinutes;
            } else if (currentMinutes <= timeRangeEnd) {
              // Мы во второй части (утро) - начинаем с текущего времени
              effectiveRangeStart = currentMinutes;
            } else {
              // Между end и start - ещё не началось, используем полный диапазон
              effectiveRangeStart = timeRangeStart;
            }
          }
        }

        // ВАЖНО: Для завтра (day=1) используем полный диапазон от timeRangeStart до timeRangeEnd
        // Не ограничиваем только вечерней частью, так как это следующий день целиком
        // Для завтра с crossesMidnight используем полное окно (вечерняя часть + утренняя часть следующего дня)

        // ВАЖНО: Распределяем слоты равномерно от effectiveRangeStart до effectiveRangeEnd включительно
        // Используем равномерное распределение, чтобы использовать весь диапазон
        const baseMinutes = buildFlexibleSlotMinutes({
          rangeStart: effectiveRangeStart,
          rangeEnd: effectiveRangeEnd,
          slotsCount: flexibleSlots.length,
          phaseFraction: sourcePhase,
        });

        // Назначаем времена гибким слотам
        for (let i = 0; i < flexibleSlots.length; i++) {
          let minutesInDay = baseMinutes[i] ?? effectiveRangeStart;

          // Добавляем детерминированный джиттер
          const jitter = generateDeterministicJitter(
            source.preference.userId,
            dayDate,
            i,
            SCHEDULE_CONFIG.jitterMinutes,
            source.kind,
            source.entityKey
          );
          minutesInDay = applyFlexibleSlotJitter({
            baseMinutes: minutesInDay,
            slotIndex: i,
            slotsCount: flexibleSlots.length,
            jitterMinutes: jitter,
          });

          // Ограничиваем в пределах диапазона
          minutesInDay = Math.max(
            effectiveRangeStart,
            Math.min(minutesInDay, effectiveRangeEnd)
          );

          // Для crossesMidnight: определяем день и нормализуем минуты
          let actualDay = day;
          let normalizedMinutes = minutesInDay;

          if (crossesMidnight && day === 0) {
            // Сегодня: если минуты >= 1440, это следующий день
            if (minutesInDay >= 1440) {
              actualDay = 1;
              normalizedMinutes = minutesInDay - 1440;
            } else {
              normalizedMinutes = minutesInDay;
            }
          } else if (crossesMidnight && day === 1) {
            // Завтра: только вечерняя часть, не выходим за 23:59 (1439 минут)
            normalizedMinutes = Math.min(minutesInDay, 1439);
            actualDay = 1;
          } else {
            // Обычный режим
            normalizedMinutes = minutesInDay % 1440;
          }

          const hours = Math.floor(normalizedMinutes / 60);
          const minutes = normalizedMinutes % 60;

          const actualDayDate = new Date(nowLocal);
          actualDayDate.setDate(actualDayDate.getDate() + actualDay);
          actualDayDate.setHours(0, 0, 0, 0);
          actualDayDate.setHours(hours, minutes, 0, 0);

          flexibleSlots[i].scheduledAt = toUTC(actualDayDate, timezone);
        }
      }
    }
  }
}

/**
 * Главная функция оркестрации всех слотов для пользователя
 */
export type OrchestrateSlotsResult = {
  userId: number;
  reason: string;
  timezone: string;
  timezoneConflict: boolean;
  regenRangeStartUtc: Date;
  regenRangeEndUtc: Date;
  deletedCount: number;
  insertedCount: number;
  plannedCount: number;
  queuedCount: number;
  horizonBefore: number;
  horizonAfter: number;
  lockAcquireMs: number;
};

export async function orchestrateAllSlotsForUser(
  userId: number,
  options?: {
    forceTodaySlots?: boolean;
    reason?: string;
    traceId?: string;
    jobId?: string;
  }
): Promise<OrchestrateSlotsResult> {
  console.log(
    `[GlobalOrchestration] Starting orchestration for user ${userId}`
  );

  try {
    const nowUTC = new Date();
    const orchestrationReason = options?.reason ?? 'manual';

    // Структурированный старт-лог для расследования спонтанных пересборок.
    console.log(
      JSON.stringify({
        event: 'notification_slots_orchestration_start',
        user_id: userId,
        reason: orchestrationReason,
        force_today_slots: options?.forceTodaySlots ?? false,
        trace_id: options?.traceId ?? null,
        job_id: options?.jobId ?? null,
        now_utc: nowUTC.toISOString(),
      })
    );

    // Проверяем, что пользователь существует
    const [user] = await db
      .select({
        id: users.id,
        isBlocked: users.isBlocked,
        roleId: users.roleId,
      })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    if (!user) {
      console.warn(`[GlobalOrchestration] User ${userId} does not exist`);
      const noopRange = buildRegenRangeUtc({
        nowUtc: nowUTC,
        timezone: DEFAULT_NOTIFICATION_TIMEZONE,
      });
      return {
        userId,
        reason: options?.reason ?? 'manual',
        timezone: DEFAULT_NOTIFICATION_TIMEZONE,
        timezoneConflict: false,
        regenRangeStartUtc: noopRange.regenRangeStartUtc,
        regenRangeEndUtc: noopRange.regenRangeEndUtc,
        deletedCount: 0,
        insertedCount: 0,
        plannedCount: 0,
        queuedCount: 0,
        horizonBefore: 0,
        horizonAfter: 0,
        lockAcquireMs: 0,
      };
    }

    if (user.isBlocked) {
      console.warn(`[GlobalOrchestration] User ${userId} is blocked`);
      const noopRange = buildRegenRangeUtc({
        nowUtc: nowUTC,
        timezone: DEFAULT_NOTIFICATION_TIMEZONE,
      });
      return {
        userId,
        reason: options?.reason ?? 'manual',
        timezone: DEFAULT_NOTIFICATION_TIMEZONE,
        timezoneConflict: false,
        regenRangeStartUtc: noopRange.regenRangeStartUtc,
        regenRangeEndUtc: noopRange.regenRangeEndUtc,
        deletedCount: 0,
        insertedCount: 0,
        plannedCount: 0,
        queuedCount: 0,
        horizonBefore: 0,
        horizonAfter: 0,
        lockAcquireMs: 0,
      };
    }

    // Этап 0: Проверка активных настроек.
    const allPrefs = await findEnabledPreferencesByUser(userId);
    const timezoneFromPrefs = getTimezoneFromPrefs(allPrefs);
    const timezone = isValidTimezone(timezoneFromPrefs)
      ? timezoneFromPrefs
      : DEFAULT_NOTIFICATION_TIMEZONE;
    const timezoneConflict =
      allPrefs.length > 1 &&
      allPrefs.some((pref) => pref.timezone !== allPrefs[0]?.timezone);

    if (timezoneConflict) {
      console.warn(
        `[GlobalOrchestration] ⚠️ timezone_conflict for user ${userId}: using ${timezone}`
      );
    }

    const { regenRangeStartUtc, regenRangeEndUtc } = buildRegenRangeUtc({
      nowUtc: nowUTC,
      timezone,
      forceTodaySlots: options?.forceTodaySlots ?? false,
    });

    if (options?.forceTodaySlots) {
      console.log(
        `[GlobalOrchestration] forceTodaySlots enabled: regen range starts from now for user ${userId}`
      );
    }
    const horizonBeforeStats = await countActiveSlotsInRange(
      userId,
      regenRangeStartUtc,
      regenRangeEndUtc
    );
    const horizonBeforeTail = await getActiveSlotsHorizonTail(
      userId,
      regenRangeStartUtc,
      regenRangeEndUtc
    );
    const horizonBefore = horizonBeforeTail.lastScheduledAt
      ? Math.max(
          0,
          (horizonBeforeTail.lastScheduledAt.getTime() - nowUTC.getTime()) /
            3_600_000
        )
      : 0;

    // Если активных prefs нет, очищаем только planned-слоты в диапазоне регенерации.
    if (allPrefs.length === 0) {
      const deletedCount = await deletePlannedSlotsInRangeWithLimit(
        userId,
        regenRangeStartUtc,
        regenRangeEndUtc,
        slotsScalingConfig.regeneration.maxRowsPerRegen
      );
      const afterStats = await countActiveSlotsInRange(
        userId,
        regenRangeStartUtc,
        regenRangeEndUtc
      );
      const afterTail = await getActiveSlotsHorizonTail(
        userId,
        regenRangeStartUtc,
        regenRangeEndUtc
      );
      const horizonAfter = afterTail.lastScheduledAt
        ? Math.max(
            0,
            (afterTail.lastScheduledAt.getTime() - nowUTC.getTime()) / 3_600_000
          )
        : 0;

      console.log(
        `[GlobalOrchestration] No active preferences for user ${userId}, deleted planned=${deletedCount}, reason=prefs_missing_or_disabled`
      );

      return {
        userId,
        reason: 'prefs_missing_or_disabled',
        timezone,
        timezoneConflict,
        regenRangeStartUtc,
        regenRangeEndUtc,
        deletedCount,
        insertedCount: 0,
        plannedCount: afterStats.plannedCount,
        queuedCount: afterStats.queuedCount,
        horizonBefore,
        horizonAfter,
        lockAcquireMs: 0,
      };
    }

    // Этап 1: Подготовка данных
    const nowLocal = toLocalTime(nowUTC, timezone);

    const startOfToday = new Date(nowLocal);
    startOfToday.setHours(0, 0, 0, 0);
    const startOfTodayUTC = toUTC(startOfToday, timezone);

    const endOfToday = new Date(nowLocal);
    endOfToday.setHours(23, 59, 59, 999);
    const endOfTodayUTC = toUTC(endOfToday, timezone);

    const sources: SourceInfo[] = [];
    const customSourceAccess = await getCustomNotificationSourceAccessByKind({
      userId,
      userRole: user.roleId,
    });

    for (const pref of allPrefs) {
      const entityKeyInfo = await resolveEntityKeyForSlots(
        userId,
        pref.kind as NotificationKind,
        pref.entityKey ?? undefined
      );

      const isCustomWithoutAccess =
        entityKeyInfo.isCustom &&
        ((pref.kind === 'habits' && !customSourceAccess.habits) ||
          (pref.kind === 'therapy' && !customSourceAccess.therapy));

      if (isCustomWithoutAccess) {
        console.log(
          `[GlobalOrchestration] ⏭️ Skip custom source without access: user=${userId}, source=${pref.kind}:${pref.entityKey || 'null'}`
        );
        continue;
      }

      const timeRangeStart =
        pref.timeRangeStart ?? DEFAULT_NOTIFICATION_TIME_RANGE_START;
      const timeRangeEnd =
        pref.timeRangeEnd ?? DEFAULT_NOTIFICATION_TIME_RANGE_END;
      const timesPerDay = clampNotificationTimesPerDay(pref.timesPerDay);
      if (timesPerDay !== pref.timesPerDay) {
        console.warn(
          `[GlobalOrchestration] ⚠️ Clamped invalid timesPerDay for user=${userId}, source=${pref.kind}:${pref.entityKey ?? 'null'}: raw=${pref.timesPerDay}, clamped=${timesPerDay}, max=${MAX_NOTIFICATION_TIMES_PER_DAY}`
        );
      }
      const crossesMidnight = timeRangeStart > timeRangeEnd;
      const customSlotTimes = normalizeCustomSlotTimesForGeneration({
        userId,
        kind: pref.kind as NotificationKind,
        entityKey: pref.entityKey,
        customSlotTimes:
          (pref.customSlotTimes as (number | null)[] | null) ?? null,
        limit: timesPerDay,
      });

      // Вычисляем интервал
      const windowDuration = crossesMidnight
        ? 1440 - timeRangeStart + timeRangeEnd
        : timeRangeEnd - timeRangeStart;
      const interval = windowDuration / timesPerDay;

      // Получаем количество отправленных слотов сегодня
      const sentToday = await countSentSlotsForToday(
        userId,
        pref.kind as NotificationKind,
        pref.entityKey,
        startOfTodayUTC,
        endOfTodayUTC
      );

      const remainingSlots = Math.max(0, timesPerDay - sentToday);

      sources.push({
        preference: pref,
        kind: pref.kind as NotificationKind,
        entityKey: pref.entityKey,
        normalizedEntityKey: entityKeyInfo.normalized,
        isCustomEntity: entityKeyInfo.isCustom,
        timesPerDay,
        timeRangeStart,
        timeRangeEnd,
        customSlotTimes,
        activeDays: (pref.activeDays as number[]) ?? [0, 1, 2, 3, 4, 5, 6],
        crossesMidnight,
        interval,
        sentToday,
        remainingSlots,
      });
    }

    // Этап 2: Расчет слотов для текущего дня
    const todaySlotsCount = new Map<string, number>();
    for (const source of sources) {
      const dayOfWeek = nowLocal.getDay();
      if (!source.activeDays.includes(dayOfWeek)) {
        todaySlotsCount.set(`${source.kind}:${source.entityKey || 'null'}`, 0);
        console.log(
          `[GlobalOrchestration] Source ${source.kind}:${source.entityKey || 'null'} - today is not active (dayOfWeek: ${dayOfWeek}, activeDays: [${source.activeDays.join(',')}])`
        );
        continue;
      }

      const remainingSlotsForToday = source.remainingSlots;
      const slotsToday = calculatePartialSlotsForToday(
        {
          ...source,
          remainingSlots: remainingSlotsForToday,
        },
        nowLocal
      );
      todaySlotsCount.set(
        `${source.kind}:${source.entityKey || 'null'}`,
        slotsToday
      );
      source.remainingSlots = slotsToday; // Обновляем для сегодня

      console.log(
        `[GlobalOrchestration] Source ${source.kind}:${source.entityKey || 'null'} - today slots: ${slotsToday}, remainingSlots: ${source.remainingSlots}, currentMinutes: ${nowLocal.getHours() * 60 + nowLocal.getMinutes()}, timeRange: ${source.timeRangeStart}-${source.timeRangeEnd}`
      );
    }

    // Для завтра используем полное количество (если день активный)
    const tomorrowDate = new Date(nowLocal);
    tomorrowDate.setDate(tomorrowDate.getDate() + 1);
    const tomorrowDayOfWeek = tomorrowDate.getDay();

    const tomorrowSlotsCount = new Map<string, number>();
    for (const source of sources) {
      if (source.activeDays.includes(tomorrowDayOfWeek)) {
        const sentTomorrow = 0; // Завтра ещё нет отправленных слотов
        const remainingTomorrow = Math.max(
          0,
          source.timesPerDay - sentTomorrow
        );
        tomorrowSlotsCount.set(
          `${source.kind}:${source.entityKey || 'null'}`,
          remainingTomorrow
        );
      } else {
        tomorrowSlotsCount.set(
          `${source.kind}:${source.entityKey || 'null'}`,
          0
        );
      }
    }

    // Этап 3-4: Генерация последовательностей и назначение времен
    // Создаём отдельные последовательности для сегодня и завтра
    const todaySequence: SlotInSequence[] = [];
    const tomorrowSequence: SlotInSequence[] = [];

    // Создаём копии источников для каждого дня с правильным remainingSlots
    const todaySources = sources.map((s) => ({
      ...s,
      remainingSlots:
        todaySlotsCount.get(`${s.kind}:${s.entityKey || 'null'}`) || 0,
    }));

    const tomorrowSources = sources.map((s) => ({
      ...s,
      remainingSlots:
        tomorrowSlotsCount.get(`${s.kind}:${s.entityKey || 'null'}`) || 0,
    }));

    // Строим последовательности
    if (todaySources.some((s) => s.remainingSlots > 0)) {
      const todaySeq = buildDailySequence(todaySources, 0);
      todaySequence.push(...todaySeq);
      console.log(
        `[GlobalOrchestration] Built ${todaySeq.length} slots for today (before time assignment)`
      );
    }

    if (tomorrowSources.some((s) => s.remainingSlots > 0)) {
      const tomorrowSeq = buildDailySequence(tomorrowSources, 1);
      tomorrowSequence.push(...tomorrowSeq);
      console.log(
        `[GlobalOrchestration] Built ${tomorrowSeq.length} slots for tomorrow (before time assignment)`
      );

      // Логируем детали по источникам для завтра
      for (const source of tomorrowSources) {
        if (source.remainingSlots > 0) {
          console.log(
            `[GlobalOrchestration] Tomorrow source: ${source.kind}:${source.entityKey || 'null'}, remainingSlots: ${source.remainingSlots}, activeDays: [${source.activeDays.join(',')}], tomorrowDayOfWeek: ${tomorrowDayOfWeek}`
          );
        }
      }
    }

    // Назначаем времена
    assignTimesToSequence(todaySequence, timezone, nowLocal);
    assignTimesToSequence(tomorrowSequence, timezone, nowLocal);

    // Этап 5: Предотвращение пересечений
    // Собираем все слоты и сортируем по времени
    const allSlots = [...todaySequence, ...tomorrowSequence].filter(
      (s) => s.scheduledAt
    );

    console.log(
      `[GlobalOrchestration] After time assignment: ${todaySequence.filter((s) => s.scheduledAt).length} today slots, ${tomorrowSequence.filter((s) => s.scheduledAt).length} tomorrow slots`
    );
    allSlots.sort(
      (a, b) =>
        (a.scheduledAt?.getTime() || 0) - (b.scheduledAt?.getTime() || 0)
    );

    // Применяем preventSimultaneousNotifications (но сначала нужно сохранить слоты в БД)
    // ВАЖНО: preventSimultaneousNotifications работает с БД, поэтому сначала создадим слоты

    // Этап 6: Создание слотов в БД
    // Получаем глобальные настройки пользователя
    const [globalPrefs] = await db
      .select()
      .from(userPreferences)
      .where(eq(userPreferences.userId, userId))
      .limit(1);

    const addressing = globalPrefs?.addressing || 'informal';
    const [userRecord] = await db
      .select({ gender: users.gender })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);
    const userGender =
      userRecord?.gender === 'male' || userRecord?.gender === 'female'
        ? userRecord.gender
        : null;
    const activeSubscriptionWithPlan =
      await getCurrentActiveSubscriptionWithPlan({
        userId,
        now: nowUTC,
      });
    const activePlanId =
      activeSubscriptionWithPlan?.plan?.id ??
      activeSubscriptionWithPlan?.subscription?.planId ??
      null;
    const hasPaidSubscriptionForTemplateImages =
      hasPaidPlanForImages(activePlanId);

    // Создаём слоты
    // Группируем слоты по источникам для эффективной загрузки данных
    const slotsBySource = new Map<string, SlotInSequence[]>();
    for (const slot of allSlots) {
      if (!slot.scheduledAt) continue;
      const key = `${slot.source.kind}:${slot.source.entityKey || 'null'}`;
      if (!slotsBySource.has(key)) {
        slotsBySource.set(key, []);
      }
      slotsBySource.get(key)!.push(slot);
    }

    const slotsToInsert: Array<{
      id: string;
      userId: number;
      kind: NotificationKind;
      entityKey: string | null;
      entityDisplayName: string | null;
      scheduledAt: Date;
      payload: NotificationPayload;
      templateId: string;
      status: 'planned';
    }> = [];
    let droppedPastSlotsCount = 0;
    const droppedPastSlotsSample: Array<{
      kind: NotificationKind;
      entityKey: string | null;
      scheduledAtUtc: string;
      day: 0 | 1;
      isFixed: boolean;
    }> = [];

    // Обрабатываем каждый источник отдельно
    for (const [, sourceSlots] of slotsBySource) {
      if (sourceSlots.length === 0) continue;

      const source = sourceSlots[0].source;
      const daySequenceCounters = new Map<string, number>();

      // Получаем intent для habits
      let intent: 'build' | 'quit' | null = null;
      let entityName: string | null = null;
      let entityDescription: string | null = null;

      if (source.kind === 'habits' && source.entityKey) {
        if (source.isCustomEntity) {
          // Кастомная привычка - получаем из БД
          const [customHabit] = await db
            .select()
            .from(habits)
            .where(
              and(eq(habits.id, source.entityKey), eq(habits.userId, userId))
            )
            .limit(1);
          if (customHabit) {
            intent =
              customHabit.intent === 'build' || customHabit.intent === 'quit'
                ? customHabit.intent
                : 'build';
            entityName = customHabit.name;
            entityDescription = customHabit.description;
          }
        } else {
          // Готовый шаблон - получаем из каталога
          const { findHabitByKey } = await import('@/app/lib/habitsCatalog');
          const catalogHabit = findHabitByKey(source.entityKey);
          if (catalogHabit) {
            intent = catalogHabit.intent;
            entityName = catalogHabit.name;
            entityDescription = catalogHabit.description;
          } else if (source.entityKey) {
            // Fallback: используем ключ как имя, чтобы AI-пулы совпадали с генерацией
            entityName = source.entityKey;
            entityDescription = null;
          }
        }
      } else if (source.kind === 'therapy' && source.entityKey) {
        if (source.isCustomEntity) {
          // Кастомная тема терапии
          const [customTopic] = await db
            .select()
            .from(therapyTopicsCustom)
            .where(
              and(
                eq(therapyTopicsCustom.id, source.entityKey),
                eq(therapyTopicsCustom.userId, userId)
              )
            )
            .limit(1);
          if (customTopic) {
            entityName = customTopic.name;
            entityDescription = customTopic.description;
          }
        } else {
          // Для системных therapy-тем используем тот же resolver, что и генератор AI.
          const templateTopic = resolveTemplateTherapyTopic(source.entityKey);
          entityName = templateTopic.entityName;
          entityDescription = templateTopic.entityDescription;
        }
      }

      // Определяем фактический subtype (детерминированный выбор для 'mixed')
      let actualSubtype = source.preference
        .subtype as NotificationSubtype | null;
      if (!source.isCustomEntity && actualSubtype === 'mixed') {
        const subtypes: Array<'reminder' | 'informational' | 'motivational'> = [
          'reminder',
          'informational',
          'motivational',
        ];
        // Детерминированный выбор на основе userId и даты (для стабильности)
        const nowUTC = new Date();
        const dayOfYear = computeDayOfYear(nowUTC);
        const deterministicIndex = (userId + dayOfYear) % subtypes.length;
        actualSubtype = subtypes[deterministicIndex];
        if (DEBUG_NOTIFICATIONS) {
          console.log(
            `[GlobalOrchestration] Deterministic subtype selection for 'mixed': userId=${userId}, dayOfYear=${dayOfYear}, selected=${actualSubtype}`
          );
        }
      }

      // Для quit-привычек: fallback с reminder на informational/motivational
      if (
        source.kind === 'habits' &&
        intent === 'quit' &&
        actualSubtype === 'reminder' &&
        !source.isCustomEntity
      ) {
        const nowUTC = new Date();
        const dayOfYear = computeDayOfYear(nowUTC);
        const deterministicChoice = (userId + dayOfYear) % 2;
        actualSubtype =
          deterministicChoice === 0 ? 'informational' : 'motivational';
        if (DEBUG_NOTIFICATIONS) {
          console.log(
            `[GlobalOrchestration] Deterministic subtype selection for quit habit: userId=${userId}, dayOfYear=${dayOfYear}, selected=${actualSubtype}`
          );
        }
      }

      // Загружаем тексты для источника с actualSubtype
      const loadedTexts = await loadTextsForPreference({
        userId,
        kind: source.kind,
        entityKey: source.normalizedEntityKey,
        directness: source.preference.directness as
          | 'soft'
          | 'moderate'
          | 'hard',
        addressing: addressing as 'informal' | 'formal',
        intent,
        subtype: actualSubtype,
      });

      // Проверяем наличие шаблонных текстов
      if (loadedTexts.texts.length === 0) {
        console.warn(
          `[GlobalOrchestration] ⚠️ No template texts found for source ${source.kind}:${source.entityKey || 'null'}, subtype: ${actualSubtype}`
        );
      }

      // Загружаем AI-тексты если нужно
      let aiTexts: Array<string | AiNotificationText> | null = null;
      let configHash: string | null = null;
      // Инициализируем used-сеты для AI (загружаются из БД если есть AI-тексты)
      let usedAiTextIndicesFromDb = new Set<number>();
      let usedAiTextHashesFromDb = new Set<string>();
      const rawTextSource = (source.preference.meta as any)?.textSource;
      const textSource: 'templates' | 'ai' =
        rawTextSource === 'ai' ? 'ai' : 'templates';
      let aiTextsAvailable = false;
      if (textSource === 'ai' && entityName) {
        // ВАЖНО: Используем tone из userPreferences, а не из preference.meta
        const tone = resolveAssistantTone(
          globalPrefs?.tone as string | null | undefined
        );

        // ВАЖНО: Для хеша используем исходный subtype из preference (если 'mixed' - оставляем 'mixed')
        // actualSubtype используется только для выбора шаблонных текстов, но не для хеша
        // Это обеспечивает стабильность пула AI-текстов и совпадение хеша с генерацией
        // ВАЖНО: subtype влияет на смысл текста, поэтому учитываем его для всех сущностей
        const subtypeForHash =
          (source.preference.subtype as
            | 'reminder'
            | 'informational'
            | 'motivational'
            | 'mixed'
            | null) ?? null;

        const hashCandidates = buildAiTextConfigHashCandidates({
          kind: source.kind,
          isCustomEntity: source.isCustomEntity,
          entityKey: source.entityKey,
          entityName,
          entityDescription,
          tone,
          addressing: addressing as 'informal' | 'formal',
          directness: source.preference.directness as
            | 'soft'
            | 'moderate'
            | 'hard',
          subtype: subtypeForHash,
          habitIntent: source.kind === 'habits' ? intent : null,
          userGender,
          customPromptNotification:
            source.preference.customPromptNotification ?? null,
        });

        configHash = hashCandidates[0] ?? null;

        let aiTextRecord: Awaited<
          ReturnType<typeof loadAiGeneratedTextsWithId>
        > | null = null;
        let matchedConfigHash: string | null = null;

        for (const hashCandidate of hashCandidates) {
          const candidateRecord = await loadAiGeneratedTextsWithId(
            userId,
            source.preference.id,
            hashCandidate
          );

          if (candidateRecord?.texts?.length) {
            aiTextRecord = candidateRecord;
            matchedConfigHash = hashCandidate;
            break;
          }
        }

        if (
          aiTextRecord &&
          aiTextRecord.texts &&
          aiTextRecord.texts.length > 0
        ) {
          aiTexts = aiTextRecord.texts;
          aiTextsAvailable = true;

          // Загружаем использованные индексы и хеши из БД (для предотвращения повторений)
          usedAiTextIndicesFromDb = await getUsedTextIndices(aiTextRecord.id);
          usedAiTextHashesFromDb = await getUsedTextHashes(aiTextRecord.id);
          if (DEBUG_NOTIFICATIONS) {
            console.log(
              `[GlobalOrchestration] Loaded ${usedAiTextIndicesFromDb.size} used text indices and ${usedAiTextHashesFromDb.size} used text hashes from DB`
            );
          }
          if (
            matchedConfigHash &&
            matchedConfigHash !== configHash &&
            DEBUG_NOTIFICATIONS
          ) {
            console.log(
              `[GlobalOrchestration] Using legacy AI config hash for source ${source.kind}:${source.entityKey || 'null'}: ${matchedConfigHash.substring(0, 8)}...`
            );
          }
        } else {
          // AI-тексты не найдены или пустые
          console.warn(
            `[GlobalOrchestration] ⚠️ AI texts not found or empty for source ${source.kind}:${source.entityKey || 'null'}, configHash: ${configHash?.substring(0, 8)}..., candidates=${hashCandidates.length}`
          );
        }
      }

      // ВАЖНО: Если textSource = ai и AI-тексты отсутствуют — НЕ создаём слоты и ставим ретрай
      if (textSource === 'ai' && !aiTextsAvailable) {
        console.warn(
          `[GlobalOrchestration] ⏭️ Skipping slots for AI source ${source.kind}:${source.entityKey || 'null'} (no AI texts yet)`
        );
        // Ставим задачу на генерацию с задержкой, чтобы не спамить провайдера
        void enqueueAiTextGenerationJob({
          userId,
          preferenceId: source.preference.id,
          delayMs: 60_000,
          reason: 'missing_ai_texts',
          configHash: configHash ?? undefined,
        });
        continue;
      }

      // Создаём состояние выбора текста для источника с данными из БД
      const textSelectionState: TextSelectionState = {
        usedTexts: new Set(),
        usedTemplateIndices: new Set(),
        usedTemplateHashes: new Set(),
        usedAiIndices: usedAiTextIndicesFromDb,
        usedAiHashes: usedAiTextHashesFromDb,
      };

      // Создаём слоты для этого источника
      for (let slotIndex = 0; slotIndex < sourceSlots.length; slotIndex++) {
        const slot = sourceSlots[slotIndex];
        const slotDate = slot.scheduledAt;
        const dayKey = slotDate ? slotDate.toISOString().split('T')[0] : 'na';
        const daySlotIndex = daySequenceCounters.get(dayKey) ?? 0;
        daySequenceCounters.set(dayKey, daySlotIndex + 1);
        if (!slot.scheduledAt) continue;

        // Регенерируем только в безопасном диапазоне пересоздания.
        if (slot.scheduledAt < regenRangeStartUtc) continue;
        if (slot.scheduledAt > regenRangeEndUtc) continue;

        // Жёсткий guard: в БД не должны попадать слоты в прошлом/на текущий момент.
        // Иначе delivery подхватит их как overdue и отправит "сразу".
        if (slot.scheduledAt.getTime() <= nowUTC.getTime()) {
          droppedPastSlotsCount += 1;
          if (droppedPastSlotsSample.length < 10) {
            droppedPastSlotsSample.push({
              kind: source.kind,
              entityKey: source.normalizedEntityKey,
              scheduledAtUtc: slot.scheduledAt.toISOString(),
              day: slot.day,
              isFixed: slot.isFixed,
            });
          }
          continue;
        }

        if (
          slotsToInsert.length >=
          slotsScalingConfig.regeneration.maxRowsPerRegen
        ) {
          continue;
        }

        const effectiveTextSource: 'templates' | 'ai' = textSource as
          | 'templates'
          | 'ai';

        const pickParams: PickTextParams = {
          slotIndex: slotIndex, // Локальный индекс внутри sourceSlots, а не глобальный
          textSource: effectiveTextSource,
          isCustomEntity: source.isCustomEntity,
          templateTexts: loadedTexts.texts.map((t) => ({
            text: t.text,
            imageTag: t.imageTag ?? null,
            actionHint: t.actionHint ?? 'none',
          })),
          aiTexts: aiTextsAvailable ? aiTexts : null, // Передаём null если AI-тексты недоступны
          userGender,
        };

        const pickResult = pickTextForSlot(textSelectionState, pickParams);

        if (!pickResult) {
          console.error(
            `[GlobalOrchestration] ❌ No text found for slot (source: ${source.kind}:${source.entityKey || 'null'}, textSource: ${textSource}, effectiveTextSource: ${effectiveTextSource}, templateTexts: ${loadedTexts.texts.length}, aiTextsAvailable: ${aiTextsAvailable}), skipping slot. This should not happen!`
          );
          continue;
        }

        const { text, templateIdForSlot, imageTag, subtype, actionHint } =
          pickResult;

        const slotId = nanoid();
        const effectiveSubtypeForImage =
          source.preference.subtype === 'mixed'
            ? (subtype ?? actualSubtype)
            : actualSubtype;
        const shouldAttachImage =
          effectiveTextSource !== 'templates' ||
          hasPaidSubscriptionForTemplateImages;
        const imageUrl = shouldAttachImage
          ? await pickNotificationImage({
              userId,
              kind: source.kind,
              entityKey: source.normalizedEntityKey,
              imageTag,
              directness: source.preference.directness as
                | 'soft'
                | 'moderate'
                | 'hard',
              subtype: effectiveSubtypeForImage,
              isMixedMode: source.preference.subtype === 'mixed',
              habitIntent: source.kind === 'habits' ? intent : null,
              text,
              actionHint,
              textSource: effectiveTextSource,
            })
          : null;

        const navigation = resolveNavigationFromActionHint(actionHint, text);
        const deepLink = buildDeepLinkFromNavigation(navigation);
        const actionMeta = buildActionFromNavigation(navigation);

        // Создаём payload
        const payload: NotificationPayload = {
          title: entityName || '',
          body: text,
          templateId: templateIdForSlot,
          action: 'open',
          deepLink,
          navigation,
          image: imageUrl || undefined,
          data: {
            kind: source.kind,
            entityKey: source.normalizedEntityKey ?? undefined,
            entityDisplayName: source.preference.entityKey ?? undefined,
            slotId,
            isAiGenerated: templateIdForSlot === 'ai_generated',
            fixedTime:
              slot.isFixed && slot.fixedTime !== null
                ? slot.fixedTime
                : undefined, // Флаг для защиты от сдвига
            // Fallback-навигация для push: action + параметры (для iOS/Android).
            action: actionMeta.action,
            ...(actionMeta.params ?? {}),
          },
        };

        slotsToInsert.push({
          id: slotId,
          userId,
          kind: source.kind,
          entityKey: source.normalizedEntityKey,
          entityDisplayName: source.preference.entityKey ?? null,
          scheduledAt: slot.scheduledAt,
          payload,
          templateId: templateIdForSlot,
          status: 'planned',
        });
      }
    }

    if (droppedPastSlotsCount > 0) {
      console.warn(
        JSON.stringify({
          event: 'notification_slots_past_guard',
          user_id: userId,
          reason: orchestrationReason,
          dropped_count: droppedPastSlotsCount,
          sample: droppedPastSlotsSample,
          now_utc: nowUTC.toISOString(),
        })
      );
    }

    let deletedCount = 0;
    let insertedCount = 0;
    let lockAcquireMs = 0;
    const rowsToInsert = slotsToInsert.slice(
      0,
      slotsScalingConfig.regeneration.maxRowsPerRegen
    );
    const txTimeoutMs = Math.max(
      1_000,
      slotsScalingConfig.regeneration.txTimeoutMs
    );
    const lockTimeoutMs = Math.max(
      100,
      slotsScalingConfig.regeneration.lockTimeoutMs
    );
    const lockRetryDelayMs = 120;
    const lockAttemptStartedAt = Date.now();
    let lockAcquired = false;

    while (Date.now() - lockAttemptStartedAt < lockTimeoutMs) {
      const txResult = await db.transaction<RegenTransactionResult>(
        async (tx) => {
          await tx.execute(
            sql.raw(`set local statement_timeout = ${txTimeoutMs}`)
          );

          const lockResult = await tx.execute(
            sql`select pg_try_advisory_xact_lock(${userId}, ${LOCK_NAMESPACE_SLOTS_GENERATION}) as locked`
          );
          const locked = Boolean((lockResult as any)?.rows?.[0]?.locked);
          if (!locked) {
            return {
              locked: false,
              deletedCount: 0,
              insertedCount: 0,
              lockAcquireMs: 0,
            };
          }

          const txLockAcquireMs = Date.now() - lockAttemptStartedAt;
          const txDeletedCount = await deletePlannedSlotsInRangeWithLimit(
            userId,
            regenRangeStartUtc,
            regenRangeEndUtc,
            slotsScalingConfig.regeneration.maxRowsPerRegen,
            tx as any
          );

          let txInsertedCount = 0;
          for (const slotRow of rowsToInsert) {
            const inserted = await insertSlot(slotRow, timezone, tx as any);
            if (inserted) {
              txInsertedCount += 1;
            }
          }

          return {
            locked: true,
            deletedCount: txDeletedCount,
            insertedCount: txInsertedCount,
            lockAcquireMs: txLockAcquireMs,
          };
        }
      );

      if (txResult.locked) {
        deletedCount = txResult.deletedCount;
        insertedCount = txResult.insertedCount;
        lockAcquireMs = txResult.lockAcquireMs;
        lockAcquired = true;
        break;
      }

      await sleepMs(lockRetryDelayMs);
    }

    if (!lockAcquired) {
      throw new SlotsGenerationLockTimeoutError(lockTimeoutMs);
    }

    const horizonAfterStats = await countActiveSlotsInRange(
      userId,
      regenRangeStartUtc,
      regenRangeEndUtc
    );
    const horizonAfterTail = await getActiveSlotsHorizonTail(
      userId,
      regenRangeStartUtc,
      regenRangeEndUtc
    );
    const horizonAfter = horizonAfterTail.lastScheduledAt
      ? Math.max(
          0,
          (horizonAfterTail.lastScheduledAt.getTime() - nowUTC.getTime()) /
            3_600_000
        )
      : 0;

    const result: OrchestrateSlotsResult = {
      userId,
      reason: options?.reason ?? 'manual',
      timezone,
      timezoneConflict,
      regenRangeStartUtc,
      regenRangeEndUtc,
      deletedCount,
      insertedCount,
      plannedCount: horizonAfterStats.plannedCount,
      queuedCount: horizonAfterStats.queuedCount,
      horizonBefore,
      horizonAfter,
      lockAcquireMs,
    };

    console.log(
      JSON.stringify({
        event: 'notification_slots_orchestration',
        user_id: userId,
        job_id: options?.jobId ?? null,
        trace_id: options?.traceId ?? null,
        reason: result.reason,
        horizon_before: result.horizonBefore,
        horizon_after: result.horizonAfter,
        deleted_count: result.deletedCount,
        inserted_count: result.insertedCount,
        planned_count: horizonBeforeStats.plannedCount,
        queued_count: horizonBeforeStats.queuedCount,
        lock_acquire_ms: result.lockAcquireMs,
        regen_range_start_utc: result.regenRangeStartUtc.toISOString(),
        regen_range_end_utc: result.regenRangeEndUtc.toISOString(),
      })
    );

    return result;
  } catch (error) {
    if (error instanceof SlotsGenerationLockTimeoutError) {
      console.warn(
        `[GlobalOrchestration] ⏳ Lock timeout during orchestration for user ${userId}: ${error.message}`
      );
      throw error;
    }

    console.error(
      `[GlobalOrchestration] ❌ Error orchestrating slots for user ${userId}:`,
      error
    );
    throw error;
  }
}
