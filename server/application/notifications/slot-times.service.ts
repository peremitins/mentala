/**
 * Сервис для генерации временных меток для слотов уведомлений
 * Чистая функция без зависимостей от БД или других сервисов
 */

import { toZonedTime, fromZonedTime } from 'date-fns-tz';

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
  jitterMinutes: number = 15
): Date[] {
  const slots: Date[] = [];

  // Преобразуем текущее время в локальное время пользователя
  const nowUTC = new Date();
  const nowLocal = toZonedTime(nowUTC, timezone);

  if (timesPerDay <= 0) {
    return slots;
  }

  for (let d = 0; d < days; d++) {
    // Работаем с локальным временем пользователя
    const dateLocal = new Date(nowLocal);
    dateLocal.setDate(dateLocal.getDate() + d);

    // Проверяем, активен ли этот день недели (в локальном времени)
    const dayOfWeek = dateLocal.getDay(); // 0 = Воскресенье, 1 = Понедельник, ..., 6 = Суббота
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
        const jitter = (Math.random() * 2 - 1) * jitterMinutes;
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

      // ВАЖНО: Создаём дату в локальном времени пользователя правильно
      // Используем компоненты даты из dateLocal (который уже в локальном времени)
      const year = dateLocal.getFullYear();
      const month = dateLocal.getMonth();
      const day = dateLocal.getDate();

      // Определяем день для слота (с учетом перехода через полночь)
      let slotDay = day;
      if (crossesMidnight && slotMinutes < timeRangeEnd) {
        slotDay = day + 1;
      }

      // ВАЖНО: fromZonedTime интерпретирует Date как локальное время в указанном timezone
      // и преобразует в UTC. Для правильной работы нужно создать Date объект,
      // который будет интерпретирован как локальное время пользователя.
      //
      // Правильный способ: создать Date объект с компонентами локального времени пользователя
      // (год, месяц, день, час, минута) используя конструктор Date(year, month, day, hour, min, sec, ms).
      // Этот конструктор создает дату в локальном времени системы, но fromZonedTime интерпретирует
      // компоненты этой даты (год, месяц, день, час, минута) как локальное время в указанном timezone
      // и преобразует в UTC.
      //
      // Однако, если сервер находится в другом часовом поясе, это может вызвать проблемы.
      // Более надежный способ - создать строку ISO без указания timezone, затем создать Date объект,
      // и использовать fromZonedTime для преобразования.

      // Создаём Date объект с компонентами локального времени пользователя
      // fromZonedTime интерпретирует компоненты этой даты как локальное время в указанном timezone
      const slotLocalDate = new Date(
        year,
        month,
        slotDay,
        slotHour,
        slotMin,
        0,
        0
      );

      // Преобразуем в UTC через fromZonedTime
      // fromZonedTime интерпретирует slotLocalDate как локальное время в указанном timezone
      // и преобразует в UTC
      const slotUTC = fromZonedTime(slotLocalDate, timezone);

      // Преобразуем обратно в локальное время пользователя для сравнения с nowLocal
      const slotLocal = toZonedTime(slotUTC, timezone);

      // Пропускаем слоты в прошлом (сравниваем локальное время)
      if (slotLocal > nowLocal) {
        // slotUTC уже в UTC, сохраняем его в БД
        slots.push(slotUTC);
      }
    }
  }

  return slots;
}
