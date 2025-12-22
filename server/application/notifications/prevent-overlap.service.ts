/**
 * Сервис для предотвращения пересечений уведомлений
 * Сдвигает слоты, которые находятся слишком близко друг к другу
 */

import { and, eq } from 'drizzle-orm';
import { db } from '@/server/infrastructure/db/client';
import { notificationPreferences } from '@/server/infrastructure/db/schema';
import {
  findPlannedSlotsForUserAfterNow,
  updateSlotTime,
} from './repositories/notification-slots.repository';
import { getTimezoneFromPrefs, toLocalTime, toUTC } from './timezone.utils';

/**
 * Проверяет, свободно ли время (нет конфликтов с существующими слотами)
 * @param time - время для проверки (UTC)
 * @param existingSlots - массив существующих слотов
 * @param minGapMs - минимальный интервал в миллисекундах
 * @param timezone - IANA timezone пользователя
 * @returns true если время свободно
 */
function isTimeFree(
  time: Date,
  existingSlots: Array<{ scheduledAt: Date }>,
  minGapMs: number,
  timezone: string
): boolean {
  const timeLocal = toLocalTime(time, timezone);
  for (const slot of existingSlots) {
    const slotLocal = toLocalTime(slot.scheduledAt, timezone);
    const gapMs = Math.abs(timeLocal.getTime() - slotLocal.getTime());
    if (gapMs < minGapMs) {
      return false;
    }
  }
  return true;
}

/**
 * Проверяет, попадает ли время в диапазон
 * @param time - время для проверки (локальное)
 * @param range - диапазон времени
 * @param timezone - IANA timezone пользователя
 * @returns true если время в диапазоне
 */
function isWithinRange(
  time: Date,
  range: { start: number; end: number; crossesMidnight: boolean },
  timezone: string
): boolean {
  const timeLocal = toLocalTime(time, timezone);
  const slotHour = timeLocal.getHours();
  const slotMin = timeLocal.getMinutes();
  const slotMinutes = slotHour * 60 + slotMin;

  if (!range.crossesMidnight) {
    return slotMinutes >= range.start && slotMinutes <= range.end;
  } else {
    // Диапазон через полночь: разрешены значения >= start ИЛИ <= end
    return slotMinutes >= range.start || slotMinutes <= range.end;
  }
}

/**
 * Ищет ближайшее свободное время в обе стороны (вперёд и назад)
 * @param baseTime - базовое время (UTC)
 * @param existingSlots - массив существующих слотов
 * @param minGapMinutes - минимальный интервал в минутах
 * @param range - диапазон времени
 * @param timezone - IANA timezone пользователя
 * @returns свободное время в UTC или null если не найдено
 */
function findNearestFreeTimeInBothDirections(
  baseTime: Date,
  existingSlots: Array<{ scheduledAt: Date }>,
  minGapMinutes: number,
  range: { start: number; end: number; crossesMidnight: boolean },
  timezone: string
): Date | null {
  const baseLocal = toLocalTime(baseTime, timezone);
  const minGapMs = minGapMinutes * 60 * 1000;
  const maxSearchRange = 2 * 60 * 60 * 1000; // Увеличиваем до 2 часов в обе стороны

  // Ищем вперёд (приоритет - идти вперёд)
  for (let offset = minGapMs; offset < maxSearchRange; offset += minGapMs) {
    // Шаг = minGapMinutes (более точный поиск)
    const candidateTime = new Date(baseLocal.getTime() + offset);
    const candidateUTC = toUTC(candidateTime, timezone);

    if (
      isTimeFree(candidateUTC, existingSlots, minGapMs, timezone) &&
      isWithinRange(candidateTime, range, timezone)
    ) {
      return candidateUTC;
    }
  }

  // Ищем назад (если вперёд не нашли)
  for (let offset = minGapMs; offset < maxSearchRange; offset += minGapMs) {
    // Шаг = minGapMinutes
    const candidateTime = new Date(baseLocal.getTime() - offset);
    const candidateUTC = toUTC(candidateTime, timezone);

    if (
      isTimeFree(candidateUTC, existingSlots, minGapMs, timezone) &&
      isWithinRange(candidateTime, range, timezone)
    ) {
      return candidateUTC;
    }
  }

  return null;
}

/**
 * Предотвращает одновременные уведомления, сдвигая пересекающиеся слоты
 * Проверяет все planned слоты пользователя и сдвигает те, которые находятся слишком близко друг к другу
 * ВАЖНО: Учитывает персональный диапазон для каждого источника и не выходит за его границы
 * Ищет свободное время в обе стороны (вперёд и назад)
 * @param userId - ID пользователя
 * @param minGapMinutes - минимальный интервал между уведомлениями в минутах (по умолчанию 10)
 */
export async function preventSimultaneousNotifications(
  userId: number,
  minGapMinutes: number = 10
): Promise<void> {
  const nowUTC = new Date();

  // Получаем все planned слоты пользователя, отсортированные по времени
  const allSlots = await findPlannedSlotsForUserAfterNow(userId, nowUTC);

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

  // Получаем timezone пользователя (все preferences должны иметь одинаковый timezone)
  const userTimezone = getTimezoneFromPrefs(allPrefs);
  const nowLocal = toLocalTime(nowUTC, userTimezone);

  // Создаем карту диапазонов для быстрого доступа
  // Ключ: kind:entityKey, значение: {start, end, crossesMidnight}
  const rangeMap = new Map<
    string,
    { start: number; end: number; crossesMidnight: boolean }
  >();

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

    // Преобразуем один раз и переиспользуем (минимизация преобразований)
    const prevTimeLocal = toLocalTime(prevSlot.scheduledAt, userTimezone);
    const currentTimeLocal = toLocalTime(currentSlot.scheduledAt, userTimezone);

    // Вычисляем gap в локальном времени
    const gapMinutes =
      (currentTimeLocal.getTime() - prevTimeLocal.getTime()) / (1000 * 60);

    // Если интервал меньше минимального, ищем свободное время в обе стороны
    if (gapMinutes < minGapMinutes) {
      // Получаем диапазон для текущего слота
      const slotKey = `${currentSlot.kind}:${currentSlot.entityKey || 'null'}`;
      const slotRange = rangeMap.get(slotKey) || {
        start: 540,
        end: 1350,
        crossesMidnight: false,
      };

      // ВАЖНО: Проверяем, является ли слот ручным (customSlotTimes)
      // Для ручных слотов не сдвигаем, только логируем предупреждение
      // (проверка через payload или другие признаки - пока пропускаем, так как нет явного флага)

      // Ищем свободное время в обе стороны
      let freeTime = findNearestFreeTimeInBothDirections(
        currentSlot.scheduledAt,
        allSlots.slice(0, i), // Все предыдущие слоты
        minGapMinutes,
        slotRange,
        userTimezone
      );

      // Если не нашли свободное время, пытаемся найти ближайшее место с минимальным интервалом
      // Это предотвращает "прилипание" всех слотов к концу диапазона
      if (!freeTime) {
        // Ищем ближайшее свободное место, сдвигая слот на minGapMinutes от предыдущего
        const currentTimeLocal = toLocalTime(currentSlot.scheduledAt, userTimezone);
        const prevTimeLocal = toLocalTime(prevSlot.scheduledAt, userTimezone);
        
        // Вычисляем новое время: предыдущий слот + minGapMinutes
        const newTimeLocal = new Date(
          prevTimeLocal.getTime() + minGapMinutes * 60 * 1000
        );
        
        // Проверяем, что новое время в пределах диапазона
        const newSlotMinutes = newTimeLocal.getHours() * 60 + newTimeLocal.getMinutes();
        let adjustedMinutes = newSlotMinutes;
        
        if (!slotRange.crossesMidnight) {
          // Обычный диапазон
          if (newSlotMinutes > slotRange.end) {
            // Вышли за границу - ищем свободное место раньше
            // Пробуем сдвинуть назад от конца диапазона
            adjustedMinutes = Math.max(slotRange.start, slotRange.end - minGapMinutes);
          } else if (newSlotMinutes < slotRange.start) {
            adjustedMinutes = slotRange.start;
          }
        } else {
          // Диапазон через полночь
          if (newSlotMinutes < slotRange.start && newSlotMinutes > slotRange.end) {
            // В запрещенной зоне - сдвигаем к ближайшей границе
            const distToStart = (slotRange.start - newSlotMinutes + 1440) % 1440;
            const distToEnd = (newSlotMinutes - slotRange.end + 1440) % 1440;
            adjustedMinutes = distToStart < distToEnd ? slotRange.start : slotRange.end;
          }
        }
        
        // Создаем новое время с учетом корректировки
        const adjustedHour = Math.floor(adjustedMinutes / 60);
        const adjustedMin = adjustedMinutes % 60;
        const adjustedTimeLocal = new Date(newTimeLocal);
        adjustedTimeLocal.setHours(adjustedHour, adjustedMin, 0, 0);
        
        // Проверяем, что скорректированное время свободно
        const adjustedUTC = toUTC(adjustedTimeLocal, userTimezone);
        if (
          isTimeFree(adjustedUTC, allSlots.slice(0, i), minGapMinutes * 60 * 1000, userTimezone) &&
          isWithinRange(adjustedTimeLocal, slotRange, userTimezone)
        ) {
          freeTime = adjustedUTC;
        } else {
          // Если и это не подошло, ищем любое свободное место в диапазоне
          // Пробуем равномерно распределить по диапазону
          const rangeDuration = slotRange.crossesMidnight
            ? 1440 - slotRange.start + slotRange.end
            : slotRange.end - slotRange.start;
          
          // Пробуем несколько позиций в диапазоне
          for (let attempt = 0; attempt < 10; attempt++) {
            const position = (rangeDuration * attempt) / 10;
            let candidateMinutes: number;
            
            if (slotRange.crossesMidnight) {
              if (position < 1440 - slotRange.start) {
                candidateMinutes = slotRange.start + position;
              } else {
                candidateMinutes = position - (1440 - slotRange.start);
              }
            } else {
              candidateMinutes = slotRange.start + position;
            }
            
            const candidateHour = Math.floor(candidateMinutes / 60);
            const candidateMin = candidateMinutes % 60;
            const candidateTimeLocal = new Date(currentTimeLocal);
            candidateTimeLocal.setHours(candidateHour, candidateMin, 0, 0);
            const candidateUTC = toUTC(candidateTimeLocal, userTimezone);
            
            if (
              isTimeFree(candidateUTC, allSlots.slice(0, i), minGapMinutes * 60 * 1000, userTimezone) &&
              isWithinRange(candidateTimeLocal, slotRange, userTimezone)
            ) {
              freeTime = candidateUTC;
              break;
            }
          }
        }
      }

      if (freeTime) {
        const newTimeLocal = toLocalTime(freeTime, userTimezone);
        console.log(
          `[Scheduler] 🔄 Found free time for slot ${currentSlot.id.substring(0, 8)}... shifting to: UTC=${freeTime.toISOString()}, Local=${newTimeLocal.toISOString()} (gap was ${gapMinutes.toFixed(1)} min, min gap is ${minGapMinutes} min)`
        );

        // Обновляем payload с новым временем
        const updatedPayload = {
          ...(currentSlot.payload as any),
          data: {
            ...((currentSlot.payload as any)?.data || {}),
          },
        };

        // Сохраняем UTC время и локальное время в БД
        await updateSlotTime(
          currentSlot.id,
          freeTime,
          userTimezone,
          updatedPayload
        );

        // Обновляем время в локальном массиве для следующей итерации
        allSlots[i].scheduledAt = freeTime;
        shiftedCount++;
      } else {
        // КРИТИЧНО: Если все равно не нашли свободное время, НЕ оставляем слот на месте
        // Вместо этого сдвигаем его на minGapMinutes от предыдущего, даже если это выходит за границы
        // Это предотвращает "прилипание" всех слотов к концу диапазона
        const currentTimeLocal = toLocalTime(currentSlot.scheduledAt, userTimezone);
        const prevTimeLocal = toLocalTime(prevSlot.scheduledAt, userTimezone);
        const newTimeLocal = new Date(
          prevTimeLocal.getTime() + minGapMinutes * 60 * 1000
        );
        
        // Ограничиваем границами диапазона
        const newSlotMinutes = newTimeLocal.getHours() * 60 + newTimeLocal.getMinutes();
        let finalMinutes = newSlotMinutes;
        
        if (!slotRange.crossesMidnight) {
          finalMinutes = Math.max(slotRange.start, Math.min(slotRange.end, newSlotMinutes));
        } else {
          if (newSlotMinutes < slotRange.start && newSlotMinutes > slotRange.end) {
            const distToStart = (slotRange.start - newSlotMinutes + 1440) % 1440;
            const distToEnd = (newSlotMinutes - slotRange.end + 1440) % 1440;
            finalMinutes = distToStart < distToEnd ? slotRange.start : slotRange.end;
          }
        }
        
        const finalHour = Math.floor(finalMinutes / 60);
        const finalMin = finalMinutes % 60;
        const finalTimeLocal = new Date(newTimeLocal);
        finalTimeLocal.setHours(finalHour, finalMin, 0, 0);
        const finalUTC = toUTC(finalTimeLocal, userTimezone);
        
        console.warn(
          `[Scheduler] ⚠️ Cannot find free time for slot ${currentSlot.id.substring(0, 8)}..., forcing shift to: UTC=${finalUTC.toISOString()}, Local=${finalTimeLocal.toISOString()} (range: [${slotRange.start}-${slotRange.end}])`
        );

        // Обновляем payload с новым временем
        const updatedPayload = {
          ...(currentSlot.payload as any),
          data: {
            ...((currentSlot.payload as any)?.data || {}),
          },
        };

        // Сохраняем UTC время и локальное время в БД
        await updateSlotTime(
          currentSlot.id,
          finalUTC,
          userTimezone,
          updatedPayload
        );

        // Обновляем время в локальном массиве для следующей итерации
        allSlots[i].scheduledAt = finalUTC;
        shiftedCount++;
      }
    }
  }

  if (shiftedCount > 0) {
    console.log(
      `[Scheduler] ✅ Prevented simultaneous notifications: shifted ${shiftedCount} slot(s) for user ${userId}`
    );
  }
}
