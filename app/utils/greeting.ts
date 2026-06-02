/**
 * Утилиты для приветствия на главном экране.
 *
 * Время определяется по локальному времени устройства пользователя
 * (`Date#getHours`), поэтому часовой пояс не хардкодится — у пользователя
 * в Владивостоке будет «Доброе утро», когда в Москве ещё ночь.
 *
 * Важно: вычислять приветствие/дату нужно на клиенте (onMounted), а не при
 * SSR — иначе сервер (UTC) и клиент дадут разный текст и Vue выдаст
 * hydration mismatch.
 */

/**
 * Возвращает приветствие по часу суток.
 *
 * Схема общепринятая для русского языка:
 *   5–11  — Доброе утро
 *   12–16 — Добрый день
 *   17–22 — Добрый вечер
 *   23–4  — Доброй ночи
 */
export function getGreetingByHour(hour: number): string {
  if (hour >= 5 && hour <= 11) return 'Доброе утро';
  if (hour >= 12 && hour <= 16) return 'Добрый день';
  if (hour >= 17 && hour <= 22) return 'Добрый вечер';
  return 'Доброй ночи';
}

/**
 * Приветствие для текущего локального времени пользователя.
 */
export function getCurrentGreeting(now: Date = new Date()): string {
  return getGreetingByHour(now.getHours());
}

/**
 * Дата в формате «четверг, 29 мая» (день недели + число + месяц, без года),
 * в нижнем регистре — как на макете главного экрана.
 */
export function formatGreetingDate(now: Date = new Date()): string {
  try {
    return new Intl.DateTimeFormat('ru-RU', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
    }).format(now);
  } catch {
    return '';
  }
}
