/**
 * Сервис для генерации временных меток для слотов уведомлений
 * Чистая функция без зависимостей от БД или других сервисов
 */

/**
 * Генерирует временные метки для слотов
 * @param timesPerDay - количество уведомлений в день
 * @param timezone - IANA timezone пользователя (⚠️ ВАЖНО: пока не используется, слоты генерируются в локальном времени сервера)
 * @param days - количество дней вперёд
 * @param activeDays - массив активных дней недели (0 = Воскресенье, 1 = Понедельник, ..., 6 = Суббота)
 * @param timeRangeStart - начало временного окна в минутах (по умолчанию 540 = 09:00)
 * @param timeRangeEnd - конец временного окна в минутах (по умолчанию 1350 = 22:30)
 * @param customSlotTimes - ручные времена в минутах (если заданы)
 * @param jitterMinutes - джиттер в минутах (по умолчанию 15)
 * @returns массив дат (локальное время сервера) для слотов
 * @todo Реализовать поддержку timezone через date-fns-tz или Intl API
 */
export function generateSlotTimes(
  timesPerDay: number,
  timezone: string, // Пока не используется, оставлено для будущей реализации
  days: number,
  activeDays: number[] = [0, 1, 2, 3, 4, 5, 6],
  timeRangeStart: number = 540,
  timeRangeEnd: number = 1350,
  customSlotTimes: (number | null)[] | null = null,
  jitterMinutes: number = 15
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
