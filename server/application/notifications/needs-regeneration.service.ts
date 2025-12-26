/**
 * Сервис для проверки необходимости регенерации слотов
 */

import { findEnabledPreferencesByUser } from './repositories/notification-preferences.repository';
import {
  countPlannedSlotsFromDate,
  countPlannedSlotsForTomorrowNightMode,
} from './repositories/notification-slots.repository';
import { computeDayOfYear } from './notification-date.utils';
import { getTimezoneFromPrefs, toLocalTime, toUTC } from './timezone.utils';

/**
 * Проверяет, нужна ли регенерация слотов для пользователя
 * @param userId - ID пользователя
 * @returns true если нужно регенерировать слоты
 */
export async function needsSlotRegenerationInternal(
  userId: number
): Promise<boolean> {
  // Проверяем, есть ли активные настройки через репозиторий
  const activePrefs = await findEnabledPreferencesByUser(userId);

  // Если нет активных настроек - регенерация не нужна
  if (activePrefs.length === 0) {
    return false;
  }

  // Получаем timezone пользователя
  const userTimezone = getTimezoneFromPrefs(activePrefs);

  // Преобразуем текущее время в локальное время пользователя
  const nowUTC = new Date();
  const nowLocal = toLocalTime(nowUTC, userTimezone);

  // Вся логика "сегодня/завтра/ночь" работает только в локальном времени пользователя
  const todayLocal = new Date(nowLocal);
  todayLocal.setHours(0, 0, 0, 0); // Начало сегодняшнего дня в локальном времени

  const tomorrowLocal = new Date(nowLocal);
  tomorrowLocal.setDate(tomorrowLocal.getDate() + 1);
  tomorrowLocal.setHours(0, 0, 0, 0); // Начало следующего дня в локальном времени

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
    // Вся логика работает в локальном времени пользователя
    const currentMinutes = nowLocal.getHours() * 60 + nowLocal.getMinutes();
    const generationTime = latestRangeEnd + 60; // Через час после окончания (в минутах)

    // Нормализуем время генерации (может быть больше 1440 минут)
    const generationHour = Math.floor(generationTime / 60) % 24;
    const generationMin = generationTime % 60;

    // Создаем дату времени генерации для сегодня в локальном времени
    const generationDateLocal = new Date(nowLocal);
    generationDateLocal.setHours(generationHour, generationMin, 0, 0);

    // Если время генерации уже прошло сегодня, проверяем, нужно ли регенерировать
    if (nowLocal >= generationDateLocal) {
      // Время генерации прошло - проверяем наличие слотов
      // Но только если прошло не более 2 часов (чтобы не регенерировать слишком часто)
      const hoursSinceGeneration =
        (nowLocal.getTime() - generationDateLocal.getTime()) / (1000 * 60 * 60);
      if (hoursSinceGeneration <= 2) {
        // Преобразуем локальную дату в UTC для запроса к БД
        const tomorrowUTC = toUTC(tomorrowLocal, userTimezone);

        // Проверяем наличие слотов на завтра через репозиторий
        const actualSlotsCount = await countPlannedSlotsForTomorrowNightMode(
          userId,
          tomorrowUTC
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

  // Для обычного режима (без ночного) используем логику в локальном времени
  // Проверяем фактическое количество planned слотов на сегодня (если еще не поздно)
  // и на завтра
  const currentHour = nowLocal.getHours();
  const checkToday = currentHour < 22; // Проверяем сегодня только если раньше 22:00 (в локальном времени)

  let checkFromDateLocal = tomorrowLocal;
  if (checkToday) {
    // Если еще рано, проверяем с сегодняшнего дня
    checkFromDateLocal = todayLocal;
  }

  // Преобразуем локальную дату в UTC для запроса к БД
  const checkFromDateUTC = toUTC(checkFromDateLocal, userTimezone);

  // Проверяем фактическое количество planned слотов начиная с checkFromDate через репозиторий
  const actualSlotsCount = await countPlannedSlotsFromDate(
    userId,
    checkFromDateUTC
  );

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
