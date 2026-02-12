/**
 * Утилиты для работы с часовыми поясами
 * Централизованные функции для преобразования времени между UTC и локальным временем пользователя
 */

import { toZonedTime, fromZonedTime, format } from 'date-fns-tz';
import { getHeader } from 'h3';
import { and, eq } from 'drizzle-orm';
import { db } from '@/server/infrastructure/db/client';
import { notificationPreferences } from '@/server/infrastructure/db/schema';
import { findEnabledPreferencesByUser } from './repositories/notification-preferences.repository';

/**
 * Извлечь timezone из preferences (если они уже загружены)
 * Избегает дополнительных запросов к БД
 *
 * ВАЖНО: Использует Europe/Moscow как fallback для российского приложения
 */
export function getTimezoneFromPrefs(
  prefs: Array<{ timezone?: string | null }>
): string {
  return prefs[0]?.timezone || 'Europe/Moscow';
}

/**
 * Получить timezone пользователя из БД
 * Использовать только если preferences ещё не загружены
 */
export async function getUserTimezone(userId: number): Promise<string> {
  const prefs = await findEnabledPreferencesByUser(userId);
  return getTimezoneFromPrefs(prefs);
}

/**
 * Получить текущее время в локальном времени пользователя
 */
export function getNowLocal(timezone: string): Date {
  return toZonedTime(new Date(), timezone);
}

/**
 * Получить начало локального дня в UTC (для сравнений в БД)
 */
export function getStartOfLocalDayUtc(date: Date, timezone: string): Date {
  const local = toZonedTime(date, timezone);
  const startLocal = new Date(
    local.getFullYear(),
    local.getMonth(),
    local.getDate(),
    0,
    0,
    0,
    0
  );
  return fromZonedTime(startLocal, timezone);
}

/**
 * Преобразовать UTC время в локальное время пользователя
 * Возвращает Date объект с компонентами локального времени
 */
export function toLocalTime(utcDate: Date, timezone: string): Date {
  const zoned = toZonedTime(utcDate, timezone);
  // Создаем новый Date с компонентами локального времени
  // Это нужно для правильного сохранения в timestamp without time zone
  return new Date(
    zoned.getFullYear(),
    zoned.getMonth(),
    zoned.getDate(),
    zoned.getHours(),
    zoned.getMinutes(),
    zoned.getSeconds(),
    zoned.getMilliseconds()
  );
}

/**
 * Преобразовать локальное время пользователя в UTC
 */
export function toUTC(localDate: Date, timezone: string): Date {
  return fromZonedTime(localDate, timezone);
}

/**
 * Форматирует UTC время в строку локального времени для сохранения в timestamp without time zone
 * ВАЖНО: Эта функция форматирует UTC время в строку локального времени пользователя
 * в формате 'yyyy-MM-dd HH:mm:ss' без информации о часовом поясе.
 * Эта строка затем используется в SQL запросе для преобразования в timestamp without time zone.
 *
 * @returns строка в формате 'yyyy-MM-dd HH:mm:ss' с локальным временем пользователя
 */
export function formatLocalTimeString(utcDate: Date, timezone: string): string {
  const local = toZonedTime(utcDate, timezone);
  // Форматируем в строку без информации о часовом поясе
  return format(local, 'yyyy-MM-dd HH:mm:ss', { timeZone: timezone });
}

/**
 * @deprecated Используйте formatLocalTimeString вместо этого
 * Создает Date объект с компонентами локального времени (для обратной совместимости)
 */
export function createLocalDate(utcDate: Date, timezone: string): Date {
  const localString = formatLocalTimeString(utcDate, timezone);
  const [datePart, timePart] = localString.split(' ');
  const [year, month, day] = datePart.split('-').map(Number);
  const [hour, minute, second] = timePart.split(':').map(Number);
  return new Date(year, month - 1, day, hour, minute, second || 0, 0);
}

/**
 * Извлечь timezone из HTTP-запроса
 * Приоритет: заголовок X-Timezone > body.timezone > fallback
 * @param event - H3 event объект
 * @returns IANA timezone string (например, 'Europe/Moscow')
 */
export function getTimezoneFromRequest(event: any): string {
  // 1. Проверить заголовок X-Timezone
  const headerTimezone = getHeader(event, 'x-timezone');
  if (headerTimezone && isValidTimezone(headerTimezone)) {
    return headerTimezone;
  }

  // 2. Проверить body.timezone (для auth endpoints)
  // ВАЖНО: body может быть еще не прочитан, нужно использовать readBody только если нужно
  // Для auth endpoints body уже прочитан, поэтому можно использовать event.body
  const body = (event as any).body;
  if (body?.timezone && isValidTimezone(body.timezone)) {
    return body.timezone;
  }

  // 3. Fallback для российского приложения
  return 'Europe/Moscow';
}

/**
 * Валидация IANA timezone
 * @param timezone - строка с IANA timezone (например, 'Europe/Moscow')
 * @returns true если timezone валидна, false иначе
 */
export function isValidTimezone(timezone: string): boolean {
  if (!timezone || typeof timezone !== 'string') {
    return false;
  }
  try {
    // Проверяем через date-fns-tz - если timezone невалидна, выбросит ошибку
    toZonedTime(new Date(), timezone);
    return true;
  } catch {
    return false;
  }
}

/**
 * Обновить timezone во всех активных preferences пользователя
 * И пересчитать все слоты уведомлений (асинхронно, не блокирует выполнение)
 *
 * ВАЖНО: Эта функция вызывается только если timezone действительно изменился
 * Пересчет слотов выполняется асинхронно в фоне, чтобы не блокировать авторизацию
 *
 * @param userId - ID пользователя
 * @param newTimezone - новый IANA timezone (например, 'Asia/Vladivostok')
 */
export async function updateUserTimezone(
  userId: number,
  newTimezone: string
): Promise<void> {
  // 1. Найти все активные preferences пользователя
  const prefs = await findEnabledPreferencesByUser(userId);

  if (prefs.length === 0) {
    console.log(
      `[Timezone] No active preferences for user ${userId}, skipping timezone update`
    );
    return; // Нет preferences для обновления
  }

  // 2. Обновить timezone во всех активных preferences
  await db
    .update(notificationPreferences)
    .set({ timezone: newTimezone })
    .where(
      and(
        eq(notificationPreferences.userId, userId),
        eq(notificationPreferences.enabled, true)
      )
    );

  console.log(
    `[Timezone] Updated timezone to ${newTimezone} for ${prefs.length} preferences of user ${userId}`
  );

  // 3. НЕМЕДЛЕННО пересчитать все слоты уведомлений (асинхронно, не блокирует)
  // Это критично для сценария командировки/переезда
  // Пользователь утром в Москве, вечером во Владивостоке - слоты должны быть пересчитаны сразу
  // ВАЖНО: Не используем await, чтобы не блокировать авторизацию
  setImmediate(async () => {
    try {
      const { generateAllSlotsForUser } = await import(
        '@/server/application/notifications/scheduler.service'
      );
      await generateAllSlotsForUser(userId, { reason: 'timezone_changed' });
      console.log(
        `[Timezone] ✅ Regenerated all slots for user ${userId} with new timezone ${newTimezone}`
      );
    } catch (error) {
      // Логируем ошибку, но не прерываем процесс авторизации
      console.error(
        `[Timezone] ⚠️ Failed to regenerate slots for user ${userId} after timezone update:`,
        error
      );
    }
  });
}
