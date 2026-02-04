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
import type { NotificationKind, Tone } from '@/shared/dto/notifications';

function resolveTone(value?: string | null): Tone {
  if (
    value === 'delicate' ||
    value === 'neutral' ||
    value === 'uplifting' ||
    value === 'resolute' ||
    value === 'demanding'
  ) {
    return value;
  }
  return 'neutral';
}
import { toLocalTime, toUTC, getTimezoneFromPrefs } from './timezone.utils';
import { findEnabledPreferencesByUser } from './repositories/notification-preferences.repository';
import {
  deleteAllPlannedSlotsForUser,
  countSentSlotsForToday,
  insertSlot,
} from './repositories/notification-slots.repository';
import { preventSimultaneousNotifications } from './prevent-overlap.service';
import { generateSlotTimes } from './slot-times.service';
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
import { computeGenerationConfigHash } from '@/server/utils/notification-ai-config-hash';
import { computeDayOfYear } from './notification-date.utils';
import { and, eq } from 'drizzle-orm';
import { pickNotificationImage } from './notification-images.service';
import type {
  NotificationPayload,
  NotificationSubtype,
} from '@/shared/dto/notifications';

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
  jitterMinutes: 15,
  minGapMinutes: 10,
};

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

/**
 * Удаляет planned и queued слоты пользователя в пределах горизонта планирования (сегодня и завтра)
 * Согласно ТЗ: удаляем только слоты в пределах горизонта, чтобы не трогать слоты дальше
 */
async function deleteAllPlannedSlotsForUserInternal(
  userId: number,
  timezone: string
): Promise<number> {
  const nowUTC = new Date();
  const nowLocal = toLocalTime(nowUTC, timezone);

  // Начало сегодняшнего дня (00:00:00)
  const startOfToday = new Date(nowLocal);
  startOfToday.setHours(0, 0, 0, 0);
  const startOfTodayUTC = toUTC(startOfToday, timezone);

  // Конец завтрашнего дня (23:59:59)
  const endOfTomorrow = new Date(nowLocal);
  endOfTomorrow.setDate(endOfTomorrow.getDate() + 1);
  endOfTomorrow.setHours(23, 59, 59, 999);
  const endOfTomorrowUTC = toUTC(endOfTomorrow, timezone);

  return await deleteAllPlannedSlotsForUser(
    userId,
    startOfTodayUTC,
    endOfTomorrowUTC
  );
}

/**
 * Вычисляет количество частичных слотов для текущего дня
 */
function calculatePartialSlotsForToday(
  source: SourceInfo,
  nowLocal: Date,
  timezone: string
): number {
  const currentMinutes = nowLocal.getHours() * 60 + nowLocal.getMinutes();
  const {
    timeRangeStart,
    timeRangeEnd,
    crossesMidnight,
    interval,
    remainingSlots,
  } = source;

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
function buildDailySequence(
  sources: SourceInfo[],
  day: 0 | 1
): SlotInSequence[] {
  const sequence: SlotInSequence[] = [];

  // Создаём рабочие копии источников с отслеживанием использованных слотов
  const workingSources = sources.map((s) => ({
    ...s,
    usedSlots: 0, // Сколько слотов уже использовано из этого источника
    customTimeIndex: 0, // Индекс для кастомных времен
  }));

  // Разделяем источники по группам
  const therapySources = workingSources.filter((s) => s.kind === 'therapy');
  const habitsSources = workingSources.filter((s) => s.kind === 'habits');

  // Вычисляем веса групп (сумма remainingSlots)
  const therapyWeight = therapySources.reduce(
    (sum, s) => sum + s.remainingSlots,
    0
  );
  const habitsWeight = habitsSources.reduce(
    (sum, s) => sum + s.remainingSlots,
    0
  );

  // Определяем, есть ли обе группы
  const hasBothGroups = therapySources.length > 0 && habitsSources.length > 0;

  // Создаём пулы слотов для каждой темы (для weighted round-robin внутри группы)
  const therapyPool: Array<{
    source: (typeof workingSources)[0];
    slotIndex: number;
  }> = [];
  const habitsPool: Array<{
    source: (typeof workingSources)[0];
    slotIndex: number;
  }> = [];

  for (const source of therapySources) {
    for (let i = 0; i < source.remainingSlots; i++) {
      therapyPool.push({ source, slotIndex: i });
    }
  }

  for (const source of habitsSources) {
    for (let i = 0; i < source.remainingSlots; i++) {
      habitsPool.push({ source, slotIndex: i });
    }
  }

  // Индексы для пулов
  let therapyPoolIndex = 0;
  let habitsPoolIndex = 0;

  // Счетчики для weighted round-robin по группам
  let therapyUsed = 0;
  let habitsUsed = 0;

  // Последние использованные темы для проверки чередования
  const lastTopics: string[] = [];

  const totalSlots = workingSources.reduce(
    (sum, s) => sum + s.remainingSlots,
    0
  );

  while (sequence.length < totalSlots) {
    let selectedPoolItem: {
      source: (typeof workingSources)[0];
      slotIndex: number;
    } | null = null;

    if (hasBothGroups && therapyWeight > 0 && habitsWeight > 0) {
      // Weighted round-robin по группам
      const totalWeight = therapyWeight + habitsWeight;
      const currentPosition = sequence.length;

      // Вычисляем целевое соотношение
      const therapyTarget = Math.floor(
        (currentPosition * therapyWeight) / totalWeight
      );
      const habitsTarget = Math.floor(
        (currentPosition * habitsWeight) / totalWeight
      );

      // Выбираем группу на основе весов
      if (
        therapyUsed <= therapyTarget &&
        therapyPoolIndex < therapyPool.length
      ) {
        selectedPoolItem = therapyPool[therapyPoolIndex];
        therapyPoolIndex++;
        therapyUsed++;
      } else if (
        habitsUsed <= habitsTarget &&
        habitsPoolIndex < habitsPool.length
      ) {
        selectedPoolItem = habitsPool[habitsPoolIndex];
        habitsPoolIndex++;
        habitsUsed++;
      } else {
        // Fallback: выбираем группу с меньшим использованием
        if (
          therapyUsed <= habitsUsed &&
          therapyPoolIndex < therapyPool.length
        ) {
          selectedPoolItem = therapyPool[therapyPoolIndex];
          therapyPoolIndex++;
          therapyUsed++;
        } else if (habitsPoolIndex < habitsPool.length) {
          selectedPoolItem = habitsPool[habitsPoolIndex];
          habitsPoolIndex++;
          habitsUsed++;
        }
      }
    } else {
      // Только одна группа - используем соответствующий пул
      if (therapySources.length > 0 && therapyPoolIndex < therapyPool.length) {
        selectedPoolItem = therapyPool[therapyPoolIndex];
        therapyPoolIndex++;
      } else if (
        habitsSources.length > 0 &&
        habitsPoolIndex < habitsPool.length
      ) {
        selectedPoolItem = habitsPool[habitsPoolIndex];
        habitsPoolIndex++;
      }
    }

    if (!selectedPoolItem) {
      break;
    }

    // Проверяем чередование тем (не более 2 подряд) ДО определения fixed
    // Это нужно для правильного выбора альтернативы
    let selectedSource = selectedPoolItem.source;
    let sourceKey = `${selectedSource.kind}:${selectedSource.entityKey || 'null'}`;
    const lastTwo = lastTopics.slice(-2);

    if (
      lastTwo.length === 2 &&
      lastTwo[0] === sourceKey &&
      lastTwo[1] === sourceKey
    ) {
      // Если уже 2 подряд этой темы, ищем альтернативу
      let alternativePoolItem: typeof selectedPoolItem | null = null;

      if (hasBothGroups) {
        // Ищем в другой группе
        if (
          selectedSource.kind === 'therapy' &&
          habitsPoolIndex < habitsPool.length
        ) {
          alternativePoolItem = habitsPool[habitsPoolIndex];
        } else if (
          selectedSource.kind === 'habits' &&
          therapyPoolIndex < therapyPool.length
        ) {
          alternativePoolItem = therapyPool[therapyPoolIndex];
        }
      }

      // Если не нашли в другой группе, ищем в той же группе другую тему
      if (!alternativePoolItem) {
        const sameGroupPool =
          selectedSource.kind === 'therapy' ? therapyPool : habitsPool;
        const currentIndex =
          selectedSource.kind === 'therapy'
            ? therapyPoolIndex
            : habitsPoolIndex;
        for (let i = currentIndex; i < sameGroupPool.length; i++) {
          const item = sameGroupPool[i];
          const itemKey = `${item.source.kind}:${item.source.entityKey || 'null'}`;
          if (itemKey !== sourceKey) {
            alternativePoolItem = item;
            break;
          }
        }
      }

      if (alternativePoolItem) {
        // ВАЖНО: Откатываем customTimeIndex для исходного источника, если он был увеличен
        // (но мы ещё не знаем, был ли он увеличен, так как определение isFixed происходит после)
        // Поэтому откатываем только если индекс был увеличен в предыдущей итерации
        // Но на самом деле, мы ещё не увеличили индекс - это происходит ниже
        // Так что откат не нужен здесь, но нужен будет во второй проверке

        // Обновляем индексы пулов
        if (selectedSource.kind === 'therapy') {
          therapyPoolIndex--;
          therapyUsed--;
        } else {
          habitsPoolIndex--;
          habitsUsed--;
        }

        if (alternativePoolItem.source.kind === 'therapy') {
          therapyPoolIndex++;
          therapyUsed++;
        } else {
          habitsPoolIndex++;
          habitsUsed++;
        }

        selectedPoolItem = alternativePoolItem;
        // ВАЖНО: Пересчитываем selectedSource и sourceKey после замены
        selectedSource = selectedPoolItem.source;
        sourceKey = `${selectedSource.kind}:${selectedSource.entityKey || 'null'}`;
      }
    }

    // Определяем, является ли слот фиксированным (после возможной замены темы)
    // ВАЖНО: Сохраняем исходный индекс для возможного отката
    const slotIndex = selectedPoolItem.slotIndex;
    const customSlotTimes = selectedSource.customSlotTimes;
    let fixedTime: number | null = null;
    let isFixed = false;
    const originalCustomTimeIndex = selectedSource.customTimeIndex; // Сохраняем для возможного отката

    if (customSlotTimes && customSlotTimes.length > 0) {
      // Идём строго по индексу без циклического повтора
      // null означает "гибкое место" и не увеличивает индекс кастомных слотов
      if (selectedSource.customTimeIndex < customSlotTimes.length) {
        const customTime = customSlotTimes[selectedSource.customTimeIndex];
        if (customTime !== null && customTime !== undefined) {
          fixedTime = customTime;
          isFixed = true;
        }
        // Увеличиваем индекс только после проверки (null тоже считается)
        selectedSource.customTimeIndex++;
      }
      // Если индекс вышел за пределы массива - слот гибкий (isFixed остаётся false)
    }

    // Если альтернативы нет, допускаем 3 подряд ТОЛЬКО если текущий слот fixed
    // Иначе ищем другую тему/группу или снижаем количество
    if (
      lastTwo.length === 2 &&
      lastTwo[0] === sourceKey &&
      lastTwo[1] === sourceKey &&
      !isFixed
    ) {
      // Если слот не фиксированный и уже 2 подряд - ищем любую другую тему
      const allSources = [...therapySources, ...habitsSources];
      const alternativeSource = allSources.find(
        (s) =>
          `${s.kind}:${s.entityKey || 'null'}` !== sourceKey &&
          s.remainingSlots > 0
      );
      if (alternativeSource) {
        // Находим альтернативу в пулах
        const altPool =
          alternativeSource.kind === 'therapy' ? therapyPool : habitsPool;
        const altIndex =
          alternativeSource.kind === 'therapy'
            ? therapyPoolIndex
            : habitsPoolIndex;
        if (altIndex < altPool.length) {
          const alternativePoolItem = altPool[altIndex];
          if (alternativeSource.kind === 'therapy') {
            therapyPoolIndex++;
            therapyUsed++;
          } else {
            habitsPoolIndex++;
            habitsUsed++;
          }
          // ВАЖНО: Откатываем customTimeIndex для исходного источника
          // так как мы уже увеличили его выше, но теперь используем другой источник
          selectedSource.customTimeIndex = originalCustomTimeIndex;

          // Откатываем текущий выбор
          if (selectedSource.kind === 'therapy') {
            therapyPoolIndex--;
            therapyUsed--;
          } else {
            habitsPoolIndex--;
            habitsUsed--;
          }
          selectedPoolItem = alternativePoolItem;
          // ВАЖНО: Пересчитываем selectedSource, sourceKey и isFixed после замены
          selectedSource = selectedPoolItem.source;
          sourceKey = `${selectedSource.kind}:${selectedSource.entityKey || 'null'}`;

          // Сбрасываем fixedTime и isFixed перед пересчётом для нового источника
          fixedTime = null;
          isFixed = false;

          // Пересчитываем isFixed и fixedTime для нового источника
          const newCustomSlotTimes = selectedSource.customSlotTimes;
          if (newCustomSlotTimes && newCustomSlotTimes.length > 0) {
            if (selectedSource.customTimeIndex < newCustomSlotTimes.length) {
              const customTime =
                newCustomSlotTimes[selectedSource.customTimeIndex];
              if (customTime !== null && customTime !== undefined) {
                fixedTime = customTime;
                isFixed = true;
              }
              selectedSource.customTimeIndex++;
            }
          }
        }
      }
    }
    // Если альтернативы нет и слот fixed - допускаем 3 подряд (только из-за фиксированного времени)

    // Создаём слот
    const slot: SlotInSequence = {
      source: selectedSource,
      day,
      fixedTime,
      isFixed,
    };

    sequence.push(slot);
    lastTopics.push(sourceKey);
    selectedSource.usedSlots++;
  }

  return sequence;
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

  // Обрабатываем каждый день и источник отдельно
  for (const [key, daySlots] of slotsByDayAndSource) {
    if (daySlots.length === 0) continue;

    const [dayStr] = key.split(':');
    const day = parseInt(dayStr) as 0 | 1;
    const dayDate = new Date(nowLocal);
    dayDate.setDate(dayDate.getDate() + day);
    dayDate.setHours(0, 0, 0, 0);

    const source = daySlots[0].source;
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
        let effectiveRangeStart = timeRangeStart;
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

          const intervalDuration = interval.end - interval.start;
          const step = intervalDuration / (interval.slots.length + 1);

          for (let i = 0; i < interval.slots.length; i++) {
            let minutesInDay = interval.start + step * (i + 1);

            // Добавляем детерминированный джиттер для гибких слотов
            const jitter = generateDeterministicJitter(
              source.preference.userId,
              dayDate,
              i, // Индекс внутри интервала
              SCHEDULE_CONFIG.jitterMinutes,
              source.kind,
              source.entityKey
            );
            minutesInDay += jitter;

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
        let effectiveRangeEnd = timeRangeEnd;

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

        const windowDuration =
          crossesMidnight && day === 1
            ? 1440 - effectiveRangeStart + effectiveRangeEnd // Полное окно для завтра (вечер + утро следующего дня)
            : crossesMidnight && day === 0
              ? 1440 - effectiveRangeStart + effectiveRangeEnd // Полное окно для сегодня (с учётом текущего времени)
              : effectiveRangeEnd - effectiveRangeStart; // Обычный режим

        // ВАЖНО: Распределяем слоты равномерно от effectiveRangeStart до effectiveRangeEnd включительно
        // Используем равномерное распределение, чтобы использовать весь диапазон
        const step =
          flexibleSlots.length > 1
            ? (effectiveRangeEnd - effectiveRangeStart) /
              (flexibleSlots.length - 1)
            : 0; // Если один слот, ставим его в середину диапазона

        // Назначаем времена гибким слотам
        for (let i = 0; i < flexibleSlots.length; i++) {
          // Распределяем от начала до конца диапазона включительно
          let minutesInDay =
            flexibleSlots.length === 1
              ? effectiveRangeStart +
                (effectiveRangeEnd - effectiveRangeStart) / 2 // Один слот - в середину
              : effectiveRangeStart + step * i; // Несколько слотов - равномерно от start до end

          // Добавляем детерминированный джиттер
          const jitter = generateDeterministicJitter(
            source.preference.userId,
            dayDate,
            i,
            SCHEDULE_CONFIG.jitterMinutes,
            source.kind,
            source.entityKey
          );
          minutesInDay += jitter;

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
export async function orchestrateAllSlotsForUser(
  userId: number,
  options?: {
    forceTodaySlots?: boolean;
  }
): Promise<void> {
  console.log(
    `[GlobalOrchestration] Starting orchestration for user ${userId}`
  );

  try {
    // Проверяем, что пользователь существует
    const [user] = await db
      .select({ id: users.id, isBlocked: users.isBlocked })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    if (!user) {
      console.warn(`[GlobalOrchestration] User ${userId} does not exist`);
      return;
    }

    if (user.isBlocked) {
      console.warn(`[GlobalOrchestration] User ${userId} is blocked`);
      return;
    }

    // Этап 0: Проверка активных настроек ПЕРЕД удалением слотов
    const allPrefs = await findEnabledPreferencesByUser(userId);
    const timezone = getTimezoneFromPrefs(allPrefs);

    // ВАЖНО: Если активных настроек нет, нужно очистить расписание
    // Иначе при выключении последнего уведомления останутся старые слоты
    if (allPrefs.length === 0) {
      const deletedCount = await deleteAllPlannedSlotsForUserInternal(
        userId,
        timezone
      );
      console.log(
        `[GlobalOrchestration] No active preferences for user ${userId}, deleted ${deletedCount} planned/queued slots within planning horizon (today + tomorrow)`
      );
      return;
    }

    // ВАЖНО: Удаляем planned/queued слоты только после проверки наличия активных настроек
    // Это предотвращает потерю слотов, если настройки были отключены
    const deletedCount = await deleteAllPlannedSlotsForUserInternal(
      userId,
      timezone
    );
    console.log(
      `[GlobalOrchestration] Deleted ${deletedCount} planned/queued slots within planning horizon (today + tomorrow)`
    );

    // Этап 1: Подготовка данных
    const nowUTC = new Date();
    const nowLocal = toLocalTime(nowUTC, timezone);

    const startOfToday = new Date(nowLocal);
    startOfToday.setHours(0, 0, 0, 0);
    const startOfTodayUTC = toUTC(startOfToday, timezone);

    const endOfToday = new Date(nowLocal);
    endOfToday.setHours(23, 59, 59, 999);
    const endOfTodayUTC = toUTC(endOfToday, timezone);

    const sources: SourceInfo[] = [];

    for (const pref of allPrefs) {
      const entityKeyInfo = await resolveEntityKeyForSlots(
        userId,
        pref.kind as NotificationKind,
        pref.entityKey ?? undefined
      );

      const timeRangeStart = pref.timeRangeStart ?? 540;
      const timeRangeEnd = pref.timeRangeEnd ?? 1350;
      const crossesMidnight = timeRangeStart > timeRangeEnd;
      const customSlotTimes =
        (pref.customSlotTimes as (number | null)[] | null) ?? null;

      // Вычисляем интервал
      const windowDuration = crossesMidnight
        ? 1440 - timeRangeStart + timeRangeEnd
        : timeRangeEnd - timeRangeStart;
      const interval = customSlotTimes
        ? windowDuration / pref.timesPerDay
        : windowDuration / pref.timesPerDay;

      // Получаем количество отправленных слотов сегодня
      const sentToday = await countSentSlotsForToday(
        userId,
        pref.kind as NotificationKind,
        pref.entityKey,
        startOfTodayUTC,
        endOfTodayUTC
      );

      const remainingSlots = Math.max(0, pref.timesPerDay - sentToday);

      sources.push({
        preference: pref,
        kind: pref.kind as NotificationKind,
        entityKey: pref.entityKey,
        normalizedEntityKey: entityKeyInfo.normalized,
        isCustomEntity: entityKeyInfo.isCustom,
        timesPerDay: pref.timesPerDay,
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
        nowLocal,
        timezone
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
      .select({ name: users.name, gender: users.gender })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);
    const userName = userRecord?.name ?? null;
    const userGender =
      userRecord?.gender === 'male' || userRecord?.gender === 'female'
        ? userRecord.gender
        : null;

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

    // Обрабатываем каждый источник отдельно
    for (const [sourceKey, sourceSlots] of slotsBySource) {
      if (sourceSlots.length === 0) continue;

      const source = sourceSlots[0].source;
      const daySequenceCounters = new Map<string, number>();
      const dayMs = 24 * 60 * 60 * 1000;

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
          // Готовая тема - получаем из каталога
          const { findTopicByKey } = await import('@/app/lib/therapyCatalog');
          const catalogTopic = findTopicByKey(source.entityKey);
          if (catalogTopic) {
            entityName = catalogTopic.name;
            entityDescription = catalogTopic.description;
          } else {
            // Fallback: используем ключ как имя, чтобы AI-пулы совпадали с генерацией
            entityName = source.entityKey;
            entityDescription = null;
          }
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
        const tone = resolveTone(
          globalPrefs?.tone as string | null | undefined
        );

        const hashEntityName =
          source.kind === 'therapy' &&
          !source.isCustomEntity &&
          source.entityKey
            ? source.entityKey
            : entityName;
        const hashEntityDescription =
          source.kind === 'therapy' && !source.isCustomEntity
            ? null
            : entityDescription || null;

        // ВАЖНО: Для хеша используем исходный subtype из preference (если 'mixed' - оставляем 'mixed')
        // actualSubtype используется только для выбора шаблонных текстов, но не для хеша
        // Это обеспечивает стабильность пула AI-текстов и совпадение хеша с генерацией
        // ВАЖНО: subtype влияет на смысл текста, поэтому учитываем его для всех сущностей
        const subtypeForHash = (source.preference.subtype as
          | 'reminder'
          | 'informational'
          | 'motivational'
          | 'mixed'
          | null) ?? null;

        // Вычисляем configHash с исходным subtype (не actualSubtype)
        configHash = computeGenerationConfigHash({
          entityName: hashEntityName,
          entityDescription: hashEntityDescription,
          tone,
          addressing: addressing as 'informal' | 'formal',
          directness: source.preference.directness as
            | 'soft'
            | 'moderate'
            | 'hard',
          subtype: subtypeForHash,
          textSource: 'ai',
          kind: source.kind,
          habitIntent: source.kind === 'habits' ? intent : null,
          userGender,
        });

        const aiTextRecord = await loadAiGeneratedTextsWithId(
          userId,
          source.preference.id,
          configHash
        );
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
        } else {
          // AI-тексты не найдены или пустые
          console.warn(
            `[GlobalOrchestration] ⚠️ AI texts not found or empty for source ${source.kind}:${source.entityKey || 'null'}, configHash: ${configHash?.substring(0, 8)}...`
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
        const dayNumber = slotDate
          ? Math.floor(
              Date.UTC(
                slotDate.getUTCFullYear(),
                slotDate.getUTCMonth(),
                slotDate.getUTCDate()
              ) / dayMs
            )
          : 0;
        if (!slot.scheduledAt) continue;

        const effectiveTextSource: 'templates' | 'ai' =
          textSource as 'templates' | 'ai';

        const pickParams: PickTextParams = {
          slotIndex: slotIndex, // Локальный индекс внутри sourceSlots, а не глобальный
          textSource: effectiveTextSource,
          isCustomEntity: source.isCustomEntity,
          templateTexts: loadedTexts.texts.map((t) => ({
            text: t.text,
            imageTag: t.imageTag ?? null,
          })),
          aiTexts: aiTextsAvailable ? aiTexts : null, // Передаём null если AI-тексты недоступны
          userName,
          userGender,
        };

        const pickResult = pickTextForSlot(textSelectionState, pickParams);

        if (!pickResult) {
          console.error(
            `[GlobalOrchestration] ❌ No text found for slot (source: ${source.kind}:${source.entityKey || 'null'}, textSource: ${textSource}, effectiveTextSource: ${effectiveTextSource}, templateTexts: ${loadedTexts.texts.length}, aiTextsAvailable: ${aiTextsAvailable}), skipping slot. This should not happen!`
          );
          continue;
        }

        const { text, templateIdForSlot, imageTag, subtype } = pickResult;

        const slotId = nanoid();
        const effectiveSubtypeForImage =
          source.preference.subtype === 'mixed'
            ? (subtype ?? actualSubtype)
            : actualSubtype;
        const imageUrl = await pickNotificationImage({
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
        });

        // Создаём payload
        const payload: NotificationPayload = {
          title: entityName || '',
          body: text,
          templateId: templateIdForSlot,
          action: 'open',
          deepLink: source.kind === 'therapy' ? '/support' : '/habits',
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
          },
        };

        // Сохраняем слот
        await insertSlot(
          {
            id: slotId,
            userId,
            kind: source.kind,
            entityKey: source.normalizedEntityKey,
            entityDisplayName: source.preference.entityKey ?? null,
            scheduledAt: slot.scheduledAt,
            payload,
            templateId: templateIdForSlot,
            status: 'planned',
          },
          timezone
        );
      }
    }

    // Применяем preventSimultaneousNotifications
    await preventSimultaneousNotifications(
      userId,
      SCHEDULE_CONFIG.minGapMinutes
    );

    console.log(
      `[GlobalOrchestration] ✅ Created ${allSlots.length} slots for user ${userId}`
    );
  } catch (error) {
    console.error(
      `[GlobalOrchestration] ❌ Error orchestrating slots for user ${userId}:`,
      error
    );
    throw error;
  }
}
