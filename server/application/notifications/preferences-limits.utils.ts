/**
 * Инварианты лимитов для notification preferences.
 * ВАЖНО: максимум слотов на один источник в сутки = 5.
 */

export const MIN_NOTIFICATION_TIMES_PER_DAY = 1;
export const MAX_NOTIFICATION_TIMES_PER_DAY = 5;
export const DEFAULT_NOTIFICATION_TIMES_PER_DAY = 3;

/**
 * Нормализует количество уведомлений в сутки:
 * - округляет до целого;
 * - ограничивает диапазоном [1..5];
 * - при невалидном входе возвращает default.
 */
export function clampNotificationTimesPerDay(
  value: number | null | undefined,
  fallback = DEFAULT_NOTIFICATION_TIMES_PER_DAY
): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }

  const rounded = Math.round(parsed);
  return Math.max(
    MIN_NOTIFICATION_TIMES_PER_DAY,
    Math.min(MAX_NOTIFICATION_TIMES_PER_DAY, rounded)
  );
}

/**
 * Нормализует customSlotTimes под лимит слотов:
 * - обрезает массив до limit;
 * - округляет минуты до целых;
 * - удаляет хвостовые null.
 */
export function normalizeCustomSlotTimesByLimit(
  input: (number | null)[] | null | undefined,
  limit: number
): (number | null)[] | null {
  if (!input || limit <= 0) {
    return null;
  }

  const normalized = input
    .slice(0, limit)
    .map((value) =>
      value === null || value === undefined ? null : Math.round(value)
    );

  while (normalized.length > 0 && normalized[normalized.length - 1] === null) {
    normalized.pop();
  }

  return normalized.length > 0 ? normalized : null;
}
