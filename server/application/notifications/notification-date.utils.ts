/**
 * Утилиты для работы с датами уведомлений
 */

/**
 * Вычисляет день года для детерминированного выбора subtype
 * @param date - дата для вычисления
 * @returns день года (1-366)
 */
export function computeDayOfYear(date: Date): number {
  return Math.floor(
    (date.getTime() - new Date(date.getFullYear(), 0, 0).getTime()) /
      (1000 * 60 * 60 * 24)
  );
}
