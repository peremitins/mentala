/**
 * Сервис для генерации временных меток для слотов уведомлений
 * Чистая функция без зависимостей от БД или других сервисов
 * 
 * Реализация по ТЗ: правильное распределение по дням (сегодня частично, завтра полностью),
 * детерминированный джиттер, поддержка диапазонов через полночь
 */

import { toZonedTime, fromZonedTime } from 'date-fns-tz';

/**
 * Детерминированный джиттер для равномерного распределения слотов
 * ВАЖНО: Использует kind и entityKey для разных джиттеров у разных шаблонов
 * @param userId - ID пользователя (для детерминированности)
 * @param slotDate - дата слота
 * @param slotIndex - индекс слота в дне
 * @param jitterMinutes - максимальный джиттер в минутах
 * @param kind - тип уведомления (для разных джиттеров у разных шаблонов)
 * @param entityKey - ключ сущности (для разных джиттеров у разных шаблонов)
 * @returns джиттер в диапазоне [-jitterMinutes, +jitterMinutes]
 */
function generateDeterministicJitter(
  userId: number,
  slotDate: Date,
  slotIndex: number,
  jitterMinutes: number,
  kind?: string,
  entityKey?: string | null
): number {
  // Простой хеш для детерминированности
  // Используем дату без времени для стабильности при регенерации
  // ВАЖНО: Добавляем kind и entityKey, чтобы разные шаблоны получали разные джиттеры
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

/**
 * Вычисляет количество слотов для временного окна
 * @param windowMinutes - длительность окна в минутах
 * @param desiredSlots - желаемое количество слотов
 * @param minGapMinutes - минимальный интервал между слотами
 * @returns количество слотов, которое влезет в окно
 */
function calculateSlotsForTimeWindow(
  windowMinutes: number,
  desiredSlots: number,
  minGapMinutes: number
): number {
  const maxSlots = Math.floor(windowMinutes / minGapMinutes);
  return Math.min(desiredSlots, maxSlots);
}

/**
 * Генерирует временные метки для слотов
 * @param timesPerDay - количество уведомлений в день
 * @param timezone - IANA timezone пользователя
 * @param days - количество дней вперёд
 * @param activeDays - массив активных дней недели (0 = Воскресенье, 1 = Понедельник, ..., 6 = Суббота)
 * @param timeRangeStart - начало временного окна в минутах (по умолчанию 540 = 09:00)
 * @param timeRangeEnd - конец временного окна в минутах (по умолчанию 1350 = 22:30)
 * @param customSlotTimes - ручные времена в минутах (если заданы)
 * @param jitterMinutes - джиттер в минутах (по умолчанию 15)
 * @param userId - ID пользователя (для детерминированного джиттера)
 * @param kind - тип уведомления (для разных джиттеров у разных шаблонов)
 * @param entityKey - ключ сущности (для разных джиттеров у разных шаблонов)
 * @returns массив дат в UTC для сохранения в БД
 */
export function generateSlotTimes(
  timesPerDay: number,
  timezone: string,
  days: number,
  activeDays: number[] = [0, 1, 2, 3, 4, 5, 6],
  timeRangeStart: number = 540,
  timeRangeEnd: number = 1350,
  customSlotTimes: (number | null)[] | null = null,
  jitterMinutes: number = 15,
  userId: number, // ДОБАВЛЕНО: для детерминированного джиттера
  kind?: string, // ДОБАВЛЕНО: для разных джиттеров у разных шаблонов
  entityKey?: string | null // ДОБАВЛЕНО: для разных джиттеров у разных шаблонов
): Date[] {
  const slots: Date[] = [];
  const nowUTC = new Date();
  const nowLocal = toZonedTime(nowUTC, timezone);
  const currentMinutes = nowLocal.getHours() * 60 + nowLocal.getMinutes();
  const crossesMidnight = timeRangeStart > timeRangeEnd;

  // Вычисляем динамический интервал
  // Если уведомлений мало (≤10), максимально отдалить (но равномерно)
  // Если много, использовать minGapMinutes (10 минут)
  const windowDuration = crossesMidnight
    ? 1440 - timeRangeStart + timeRangeEnd
    : timeRangeEnd - timeRangeStart;
  const dynamicMinGap =
    timesPerDay <= 10
      ? Math.max(10, Math.floor(windowDuration / (timesPerDay + 1))) // Равномерное распределение
      : 10; // Минимум 10 минут для большого количества

  for (let d = 0; d < days; d++) {
    const dateLocal = new Date(nowLocal);
    dateLocal.setDate(dateLocal.getDate() + d);
    const dayOfWeek = dateLocal.getDay();

    if (!activeDays.includes(dayOfWeek)) {
      continue;
    }

    let slotsForThisDay: number;
    let timeWindowStart: number;
    let timeWindowEnd: number;

    if (d === 0) {
      // Текущий день: считаем оставшееся время
      if (crossesMidnight) {
        // Диапазон через полночь (например, 18:00-04:00)
        // Определяем, в какой части окна мы находимся
        if (currentMinutes >= timeRangeStart) {
          // Мы в первой части (вечер, например 20:00 при окне 18:00-04:00)
          // Оставшееся время: до 24:00 + от 00:00 до timeRangeEnd
          const remainingMinutes = 1440 - currentMinutes + timeRangeEnd;
          slotsForThisDay = Math.min(
            timesPerDay,
            calculateSlotsForTimeWindow(
              remainingMinutes,
              timesPerDay,
              dynamicMinGap
            )
          );
          timeWindowStart = currentMinutes;
          timeWindowEnd = 1440; // Конец первой части (до 24:00)
        } else if (currentMinutes <= timeRangeEnd) {
          // Мы во второй части (утро, например 02:00 при окне 18:00-04:00)
          // Оставшееся время: до timeRangeEnd
          const remainingMinutes = timeRangeEnd - currentMinutes;
          slotsForThisDay = Math.min(
            timesPerDay,
            calculateSlotsForTimeWindow(
              remainingMinutes,
              timesPerDay,
              dynamicMinGap
            )
          );
          timeWindowStart = currentMinutes;
          timeWindowEnd = timeRangeEnd;
        } else {
          // Мы вне окна (например, 10:00 при окне 18:00-04:00)
          // Слотов на сегодня нет, но они будут на завтра
          slotsForThisDay = 0;
          continue;
        }
      } else {
        // Обычный диапазон внутри суток (например, 10:00-22:00)
        if (currentMinutes < timeRangeStart) {
          // Ещё не началось - генерируем полное количество
          slotsForThisDay = timesPerDay;
          timeWindowStart = timeRangeStart;
          timeWindowEnd = timeRangeEnd;
        } else if (currentMinutes >= timeRangeEnd) {
          // Уже закончилось - слотов на сегодня нет
          slotsForThisDay = 0;
          continue;
        } else {
          // Мы в середине диапазона
          const remainingMinutes = timeRangeEnd - currentMinutes;
          slotsForThisDay = Math.min(
            timesPerDay,
            calculateSlotsForTimeWindow(
              remainingMinutes,
              timesPerDay,
              dynamicMinGap
            )
          );
          timeWindowStart = currentMinutes;
          timeWindowEnd = timeRangeEnd;
        }
      }
    } else {
      // Следующие дни: ВСЕГДА полное количество
      slotsForThisDay = timesPerDay;
      timeWindowStart = timeRangeStart;
      timeWindowEnd = timeRangeEnd;
    }

    // Генерируем slotsForThisDay слотов равномерно распределённых по дню
    // Первое около начала окна, последнее около конца, остальные равномерно
    const manualTimes = Array.isArray(customSlotTimes) ? customSlotTimes : [];

    for (let i = 0; i < slotsForThisDay; i++) {
      const manualValue = manualTimes[i];
      let slotMinutes: number;

      if (manualValue !== null && manualValue !== undefined) {
        slotMinutes = manualValue;
      } else {
        // Равномерное распределение: первое около начала, последнее около конца
        if (slotsForThisDay === 1) {
          // Одно уведомление - в середине окна
          slotMinutes = timeWindowStart + (timeWindowEnd - timeWindowStart) / 2;
        } else {
          // Несколько уведомлений - равномерно распределяем
          // ВАЖНО: Для диапазонов через полночь нужно правильно вычислять шаг
          // Используем "линейные минуты" для корректной работы с любыми окнами

          let step: number;
          let windowDuration: number;

          if (crossesMidnight) {
            // Диапазон через полночь (например, 18:00-04:00)
            // Работаем в "линейных минутах": [start, start+duration]
            // duration = (1440 - start) + end
            const fullWindowDuration = 1440 - timeRangeStart + timeRangeEnd;

            if (d === 0 && currentMinutes >= timeRangeStart) {
              // Текущий день, мы в первой части окна (вечер)
              // Оставшееся окно: от currentMinutes до конца окна
              // Вычисляем позицию currentMinutes в полном окне
              const positionInFullWindow = currentMinutes - timeRangeStart;
              const remainingInFullWindow =
                fullWindowDuration - positionInFullWindow;
              windowDuration = remainingInFullWindow;
              // Начинаем с позиции в полном окне
              const startPosition = positionInFullWindow;
              step = windowDuration / (slotsForThisDay - 1);
              const positionInWindow = startPosition + step * i;
              // Преобразуем обратно в минуты дня
              if (positionInWindow < 1440 - timeRangeStart) {
                // В первой части (вечер текущего дня)
                slotMinutes = timeRangeStart + positionInWindow;
              } else {
                // Во второй части (утро следующего дня)
                slotMinutes = positionInWindow - (1440 - timeRangeStart);
              }
            } else if (d === 0 && currentMinutes <= timeRangeEnd) {
              // Текущий день, мы во второй части окна (утро)
              // Оставшееся окно: от currentMinutes до timeRangeEnd
              windowDuration = timeRangeEnd - currentMinutes;
              step = windowDuration / (slotsForThisDay - 1);
              slotMinutes = currentMinutes + step * i;
            } else {
              // Полный день или следующий день
              // Равномерно распределяем по всему окну
              step = fullWindowDuration / (slotsForThisDay - 1);
              const positionInWindow = step * i;
              if (positionInWindow < 1440 - timeRangeStart) {
                // В первой части (вечер)
                slotMinutes = timeRangeStart + positionInWindow;
              } else {
                // Во второй части (утро следующего дня)
                slotMinutes = positionInWindow - (1440 - timeRangeStart);
              }
            }
          } else {
            // Обычный диапазон внутри суток
            windowDuration = timeWindowEnd - timeWindowStart;
            step = windowDuration / (slotsForThisDay - 1);
            slotMinutes = timeWindowStart + step * i;
          }
        }

        // Нормализация для диапазона через полночь
        if (crossesMidnight && slotMinutes >= 1440) {
          slotMinutes = slotMinutes % 1440;
        }

        // Детерминированный джиттер (не Math.random!)
        // ВАЖНО: Передаём kind и entityKey, чтобы разные шаблоны получали разные джиттеры
        const jitter = generateDeterministicJitter(
          userId, // Передаётся из параметров функции
          dateLocal,
          i,
          jitterMinutes,
          kind, // Для разных джиттеров у разных шаблонов
          entityKey // Для разных джиттеров у разных шаблонов
        );
        slotMinutes += jitter;

        // Нормализация и ограничение границами
        slotMinutes = Math.round(slotMinutes);
        if (slotMinutes >= 1440) slotMinutes = slotMinutes % 1440;
        if (slotMinutes < 0) slotMinutes = (slotMinutes % 1440) + 1440;

        // Ограничиваем временным окном
        // ВАЖНО: Не "прилипаем" к границам, если это не первое/последнее уведомление
        if (!crossesMidnight) {
          // Обычный диапазон - ограничиваем границами
          if (slotMinutes < timeRangeStart) {
            slotMinutes = timeRangeStart;
          } else if (slotMinutes > timeRangeEnd) {
            // ВАЖНО: Не прилипаем к концу, если это не последний слот
            // Если слот выходит за границы из-за джиттера, корректируем его
            if (i < slotsForThisDay - 1) {
              // Не последний слот - ограничиваем до конца, но не "прилипаем"
              // Корректируем джиттер, чтобы слот остался в пределах диапазона
              const excess = slotMinutes - timeRangeEnd;
              slotMinutes = timeRangeEnd - Math.min(excess, dynamicMinGap / 2); // Отступаем немного от конца
            } else {
              // Последний слот - можно прилипнуть к концу
              slotMinutes = timeRangeEnd;
            }
          }
        } else {
          // Диапазон через полночь - проверяем попадание в окно
          // Окно: [timeRangeStart, 1440) U [0, timeRangeEnd]
          if (slotMinutes >= timeRangeStart || slotMinutes <= timeRangeEnd) {
            // В окне - оставляем как есть
          } else {
            // Вне окна - находим ближайшую границу
            if (slotMinutes > timeRangeEnd && slotMinutes < timeRangeStart) {
              // Между концом второй части и началом первой части
              const distToStart = timeRangeStart - slotMinutes;
              const distToEnd = slotMinutes - timeRangeEnd;
              slotMinutes =
                distToStart < distToEnd ? timeRangeStart : timeRangeEnd;
            }
          }
        }
      }

      // Создаём Date объект и добавляем в slots
      const slotHour = Math.floor(slotMinutes / 60);
      const slotMin = slotMinutes % 60;
      let slotDay = dateLocal.getDate();

      // ВАЖНО: Для диапазонов через полночь правильно определяем день
      if (crossesMidnight) {
        // Если слот попадает в часть после полуночи (0:00 - timeRangeEnd)
        if (slotMinutes < timeRangeEnd) {
          slotDay = dateLocal.getDate() + 1;
        } else if (slotMinutes >= timeRangeStart) {
          // Слот в первой части (вечер) - остаётся в текущем дне
          slotDay = dateLocal.getDate();
        }
      }

      const slotLocalDate = new Date(
        dateLocal.getFullYear(),
        dateLocal.getMonth(),
        slotDay,
        slotHour,
        slotMin,
        0,
        0
      );

      const slotUTC = fromZonedTime(slotLocalDate, timezone);
      const slotLocal = toZonedTime(slotUTC, timezone);

      // Пропускаем слоты в прошлом (только для текущего дня)
      if (d === 0 && slotLocal <= nowLocal) {
        continue;
      }

      slots.push(slotUTC);
    }
  }

  return slots;
}
