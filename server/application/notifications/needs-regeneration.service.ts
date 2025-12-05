/**
 * Сервис для проверки необходимости регенерации слотов
 */

import { findEnabledPreferencesByUser } from './repositories/notification-preferences.repository';
import {
  countPlannedSlotsFromDate,
  countPlannedSlotsForTomorrowNightMode,
} from './repositories/notification-slots.repository';
import { computeDayOfYear } from './regenerate-slots.service';

/**
 * Проверяет, нужна ли регенерация слотов для пользователя
 * @param userId - ID пользователя
 * @returns true если нужно регенерировать слоты
 */
export async function needsSlotRegenerationInternal(
  userId: number
): Promise<boolean> {
  const now = new Date();
  const today = new Date(now);
  today.setHours(0, 0, 0, 0); // Начало сегодняшнего дня

  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  tomorrow.setHours(0, 0, 0, 0); // Начало следующего дня

  // Проверяем, есть ли активные настройки через репозиторий
  const activePrefs = await findEnabledPreferencesByUser(userId);

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
        // Проверяем наличие слотов на завтра через репозиторий
        const actualSlotsCount = await countPlannedSlotsForTomorrowNightMode(
          userId,
          tomorrow
        );

        // Fallback: если слотов совсем нет, регенерировать всегда (аналогично дневному режиму)
        if (actualSlotsCount === 0) {
          console.log(
            `[NeedsRegeneration] User ${userId} (night mode) has 0 planned slots, regeneration needed (fallback)`
          );
          return true;
        }

        // ВАЖНО: Не регенерируем если слотов достаточно (больше 80% от ожидаемого)
        // Это предотвращает ненужные регенерации когда слоты были отправлены
        const minRequiredSlots = Math.floor(expectedSlotsPerDay * 0.8);

        if (actualSlotsCount < minRequiredSlots) {
          console.log(
            `[NeedsRegeneration] User ${userId} (night mode) has ${actualSlotsCount} planned slots but needs at least ${minRequiredSlots} (expected: ${expectedSlotsPerDay}, generation time: ${generationHour}:${generationMin.toString().padStart(2, '0')}), regeneration needed`
          );
          return true;
        }

        // Если слотов достаточно, но немного меньше ожидаемого - это нормально
        if (actualSlotsCount < expectedSlotsPerDay) {
          console.log(
            `[NeedsRegeneration] User ${userId} (night mode) has ${actualSlotsCount} planned slots (expected: ${expectedSlotsPerDay}), but above minimum threshold (${minRequiredSlots}). No regeneration needed.`
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

  // Проверяем фактическое количество planned слотов начиная с checkFromDate через репозиторий
  const actualSlotsCount = await countPlannedSlotsFromDate(userId, checkFromDate);

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
      `[NeedsRegeneration] User ${userId} has ${actualSlotsCount} planned slots but needs at least ${minRequiredSlots} (expected: ${expectedSlots}, checking from ${checkToday ? 'today' : 'tomorrow'}), regeneration needed`
    );
    return true;
  }

  // Если слотов достаточно, но немного меньше ожидаемого - это нормально
  // (возможно некоторые слоты были отправлены или удалены)
  if (actualSlotsCount < expectedSlots) {
    console.log(
      `[NeedsRegeneration] User ${userId} has ${actualSlotsCount} planned slots (expected: ${expectedSlots}), but above minimum threshold (${minRequiredSlots}). No regeneration needed.`
    );
  }

  return false;
}

