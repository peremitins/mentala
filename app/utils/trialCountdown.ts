const MINUTE_MS = 60 * 1000;
const DAY_HOURS = 24;

export interface TrialCountdown {
  days: number;
  hours: number;
  lessThanHour: boolean;
}

function getWordForm(value: number, forms: [string, string, string]): string {
  const absolute = Math.abs(value);
  const lastDigit = absolute % 10;
  const lastTwoDigits = absolute % 100;

  if (lastTwoDigits >= 11 && lastTwoDigits <= 14) {
    return forms[2];
  }

  if (lastDigit === 1) {
    return forms[0];
  }

  if (lastDigit >= 2 && lastDigit <= 4) {
    return forms[1];
  }

  return forms[2];
}

/**
 * Рассчитывает остаток trial в днях и часах от точного timestamp окончания.
 */
export function getTrialCountdown(
  trialEndsAt: string | Date | null | undefined,
  now: Date
): TrialCountdown | null {
  if (!trialEndsAt) return null;

  const expiresAt =
    trialEndsAt instanceof Date ? trialEndsAt : new Date(trialEndsAt);

  if (Number.isNaN(expiresAt.getTime())) {
    return null;
  }

  const diffMs = expiresAt.getTime() - now.getTime();
  if (diffMs <= 0) {
    return {
      days: 0,
      hours: 0,
      lessThanHour: false,
    };
  }

  // Округляем до минут вверх, чтобы не показывать "0 часов" пока trial еще активен.
  const totalMinutes = Math.ceil(diffMs / MINUTE_MS);
  const totalHours = Math.floor(totalMinutes / 60);
  const days = Math.floor(totalHours / DAY_HOURS);
  const hours = totalHours % DAY_HOURS;

  return {
    days,
    hours,
    lessThanHour: totalHours === 0,
  };
}

/**
 * Преобразует countdown в человекочитаемую строку для UI.
 */
export function formatTrialCountdown(countdown: TrialCountdown): string {
  if (countdown.lessThanHour) {
    return 'меньше часа';
  }

  const parts: string[] = [];

  if (countdown.days > 0) {
    parts.push(
      `${countdown.days} ${getWordForm(countdown.days, ['день', 'дня', 'дней'])}`
    );
  }

  if (countdown.hours > 0 || countdown.days === 0) {
    parts.push(
      `${countdown.hours} ${getWordForm(countdown.hours, [
        'час',
        'часа',
        'часов',
      ])}`
    );
  }

  return parts.join(' ');
}
