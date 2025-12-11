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
 * Вычисляет новое время в пределах диапазона с учетом сдвига
 * @param base - базовое время в UTC (из БД)
 * @param shiftMinutes - сдвиг в минутах
 * @param range - диапазон времени (в локальных минутах пользователя)
 * @param timezone - IANA timezone пользователя
 * @returns новое время в UTC для сохранения в БД
 */
function computeNewTimeWithinRange(
  base: Date,
  shiftMinutes: number,
  range: { start: number; end: number; crossesMidnight: boolean },
  timezone: string
): Date {
  // Преобразуем базовое время в локальное время пользователя
  const baseLocal = toLocalTime(base, timezone);

  // Вычисляем новое время в локальном времени
  const newTimeLocal = new Date(baseLocal.getTime() + shiftMinutes * 60 * 1000);
  const slotHour = newTimeLocal.getHours();
  const slotMin = newTimeLocal.getMinutes();
  let newSlotMinutes = slotHour * 60 + slotMin;

  // Проверяем границы диапазона
  let needsAdjustment = false;
  if (!range.crossesMidnight) {
    // Обычный диапазон: проверяем, что время в пределах [start, end]
    if (newSlotMinutes < range.start || newSlotMinutes > range.end) {
      needsAdjustment = true;
      // Если вышли за границы, сдвигаем к ближайшей границе
      if (newSlotMinutes < range.start) {
        newSlotMinutes = range.start;
      } else if (newSlotMinutes > range.end) {
        newSlotMinutes = range.end;
      }
    }
  } else {
    // Диапазон через полночь: разрешены значения >= start ИЛИ <= end
    // Проверяем, попадает ли время в запрещенный промежуток
    if (newSlotMinutes < range.start && newSlotMinutes > range.end) {
      needsAdjustment = true;
      // Попали в запрещенный промежуток - сдвигаем к ближайшей границе
      const distToStart = (range.start - newSlotMinutes + 1440) % 1440;
      const distToEnd = (newSlotMinutes - range.end + 1440) % 1440;
      newSlotMinutes = distToStart < distToEnd ? range.start : range.end;
    }
  }

  // Если нужно корректировать, пересчитываем newTime в локальном времени
  if (needsAdjustment) {
    const normalizedMinutes = newSlotMinutes % 1440;
    const newHour = Math.floor(normalizedMinutes / 60);
    const newMin = normalizedMinutes % 60;
    const adjustedTimeLocal = new Date(newTimeLocal);
    adjustedTimeLocal.setHours(newHour, newMin, 0, 0);

    // Если диапазон через полночь и время попадает во второй день
    if (range.crossesMidnight && normalizedMinutes < range.end) {
      adjustedTimeLocal.setDate(adjustedTimeLocal.getDate() + 1);
    }

    // Преобразуем обратно в UTC перед возвратом
    return toUTC(adjustedTimeLocal, timezone);
  }

  // Преобразуем обратно в UTC перед возвратом
  return toUTC(newTimeLocal, timezone);
}

/**
 * Предотвращает одновременные уведомления, сдвигая пересекающиеся слоты
 * Проверяет все planned слоты пользователя и сдвигает те, которые находятся слишком близко друг к другу
 * ВАЖНО: Учитывает персональный диапазон для каждого источника и не выходит за его границы
 * @param userId - ID пользователя
 * @param minGapMinutes - минимальный интервал между уведомлениями в минутах (по умолчанию 25)
 */
export async function preventSimultaneousNotifications(
  userId: number,
  minGapMinutes: number = 25
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

    // Если интервал меньше минимального, сдвигаем текущий слот
    if (gapMinutes < minGapMinutes) {
      // Получаем диапазон для текущего слота
      const slotKey = `${currentSlot.kind}:${currentSlot.entityKey || 'null'}`;
      const slotRange = rangeMap.get(slotKey) || {
        start: 540,
        end: 1350,
        crossesMidnight: false,
      };

      // Логируем в локальном времени для отладки
      console.log(
        `[Scheduler] 🔍 Checking slot ${currentSlot.id.substring(0, 8)}... range: [${slotRange.start}-${slotRange.end}], crossesMidnight: ${slotRange.crossesMidnight}, current time: UTC=${currentSlot.scheduledAt.toISOString()}, Local=${currentTimeLocal.toISOString()} (${userTimezone})`
      );

      // Вычисляем новое время со сдвигом (функция вернёт UTC)
      const shiftMinutes = minGapMinutes - gapMinutes;
      const newTimeUTC = computeNewTimeWithinRange(
        currentSlot.scheduledAt, // Передаём UTC время из БД
        shiftMinutes,
        slotRange,
        userTimezone
      );

      const newTimeLocal = toLocalTime(newTimeUTC, userTimezone);
      if (newTimeUTC.getTime() !== currentSlot.scheduledAt.getTime()) {
        console.log(
          `[Scheduler] ⚠️ Adjusted slot ${currentSlot.id.substring(0, 8)}... to stay within range [${slotRange.start}-${slotRange.end}], new time: UTC=${newTimeUTC.toISOString()}, Local=${newTimeLocal.toISOString()}`
        );
      }

      // Обновляем payload с новым временем
      const updatedPayload = {
        ...(currentSlot.payload as any),
        data: {
          ...((currentSlot.payload as any)?.data || {}),
        },
      };

      // Сохраняем UTC время и локальное время в БД (timezone передается для SQL преобразования)
      await updateSlotTime(
        currentSlot.id,
        newTimeUTC,
        userTimezone,
        updatedPayload
      );

      // Обновляем время в локальном массиве для следующей итерации (в UTC)
      allSlots[i].scheduledAt = newTimeUTC;
      shiftedCount++;

      console.log(
        `[Scheduler] 🔄 Shifted slot ${currentSlot.id.substring(0, 8)}... by ${shiftMinutes.toFixed(1)} minutes to prevent overlap (gap was ${gapMinutes.toFixed(1)} min, min gap is ${minGapMinutes} min), range: [${slotRange.start}-${slotRange.end}]`
      );
    }
  }

  if (shiftedCount > 0) {
    console.log(
      `[Scheduler] ✅ Prevented simultaneous notifications: shifted ${shiftedCount} slot(s) for user ${userId}`
    );
  }
}
