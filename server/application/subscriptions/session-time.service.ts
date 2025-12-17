/**
 * Сервис для подсчета времени сессий
 */

import { db } from '@/server/infrastructure/db/client';
import { therapySessions } from '@/server/infrastructure/db/schema';
import { eq, and, gte, lte, or, lt, isNull } from 'drizzle-orm';
import { CHAT_IDLE_TIMEOUT_MS } from '@/server/config/subscription';
import { toZonedTime, fromZonedTime } from 'date-fns-tz';

/**
 * Получить начало недели (понедельник 00:00:00) в указанной timezone
 */
function getStartOfWeek(date: Date, timezone: string): Date {
  const zoned = toZonedTime(date, timezone);
  const dayOfWeek = zoned.getDay(); // 0 = воскресенье, 1 = понедельник, ...
  const daysToMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
  const start = new Date(zoned);
  start.setDate(zoned.getDate() - daysToMonday);
  start.setHours(0, 0, 0, 0);
  return fromZonedTime(start, timezone);
}

/**
 * Получить конец недели (воскресенье 23:59:59.999) в указанной timezone
 */
function getEndOfWeek(date: Date, timezone: string): Date {
  const zoned = toZonedTime(date, timezone);
  const dayOfWeek = zoned.getDay();
  const daysToMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
  const end = new Date(zoned);
  end.setDate(zoned.getDate() - daysToMonday + 6);
  end.setHours(23, 59, 59, 999);
  return fromZonedTime(end, timezone);
}

// Конвертируем миллисекунды в секунды для использования в расчетах
export const CHAT_IDLE_TIMEOUT_SECONDS = CHAT_IDLE_TIMEOUT_MS / 1000;

/**
 * Начать сессию терапии
 */
export async function startTherapySession(userId: number) {
  const now = new Date();

  const [session] = await db
    .insert(therapySessions)
    .values({
      userId,
      startedAt: now,
      lastActivityAt: now, // Устанавливаем начальную активность
      durationSeconds: 0,
    })
    .returning();

  return session;
}

/**
 * Завершить сессию терапии
 * Использует lastActivityAt если есть, иначе startedAt + idleTimeout для зависших сессий
 */
export async function endTherapySession(sessionId: number) {
  const now = new Date();

  const session = await db
    .select()
    .from(therapySessions)
    .where(eq(therapySessions.id, sessionId))
    .limit(1);

  if (!session.length) {
    throw new Error(`Session ${sessionId} not found`);
  }

  const startedAt = session[0].startedAt;

  // Используем lastActivityAt если есть, иначе startedAt
  // Для зависших сессий используем startedAt + idleTimeout
  const lastActivityAt = session[0].lastActivityAt || startedAt;
  const actualEndTime =
    now.getTime() - lastActivityAt.getTime() > CHAT_IDLE_TIMEOUT_MS
      ? new Date(lastActivityAt.getTime() + CHAT_IDLE_TIMEOUT_MS) // Зависшая сессия - ограничиваем idle timeout
      : now; // Нормальное завершение

  const durationMs = actualEndTime.getTime() - startedAt.getTime();
  const durationSeconds = Math.max(0, Math.floor(durationMs / 1000)); // Гарантируем неотрицательное значение

  await db
    .update(therapySessions)
    .set({
      endedAt: actualEndTime,
      durationSeconds,
    })
    .where(eq(therapySessions.id, sessionId));

  return {
    ...session[0],
    endedAt: actualEndTime,
    durationSeconds,
  };
}

/**
 * Рассчитать минуты из секунд (округление вниз)
 * Важно: списываем только полные минуты, меньше минуты = 0
 */
export function calculateSessionMinutes(durationSeconds: number): number {
  // Если сессия меньше 60 секунд - не списываем минуты
  if (durationSeconds < 60) {
    return 0;
  }
  // Округляем вниз до полных минут
  return Math.floor(durationSeconds / 60);
}

/**
 * Получить использованные минуты в текущей неделе
 * Считает неделю в timezone пользователя
 */
export async function getUsageForCurrentWeek(
  userId: number,
  userTimezone: string = 'Europe/Moscow'
) {
  // Получаем текущее время
  const now = new Date();

  // Получаем начало и конец недели в timezone пользователя, конвертированные в UTC
  const weekStartUTC = getStartOfWeek(now, userTimezone);
  const weekEndUTC = getEndOfWeek(now, userTimezone);

  // Получаем все сессии, которые пересекаются с текущей неделей:
  // - начались в этой неделе ИЛИ
  // - начались до недели, но еще не закончились (endedAt null) или закончились после начала недели (пересекаются)
  const sessions = await db
    .select()
    .from(therapySessions)
    .where(
      and(
        eq(therapySessions.userId, userId),
        or(
          // Сессия началась в пределах недели
          and(
            gte(therapySessions.startedAt, weekStartUTC),
            lte(therapySessions.startedAt, weekEndUTC)
          ),
          // ИЛИ сессия началась до недели, но еще не закончилась (endedAt null) или закончилась после начала недели
          and(
            lt(therapySessions.startedAt, weekStartUTC),
            or(
              isNull(therapySessions.endedAt),
              gte(therapySessions.endedAt, weekStartUTC)
            )
          )
        )
      )
    );

  // Считаем использованные минуты только за текущую неделю
  let usedMinutes = 0;

  for (const session of sessions) {
    let sessionDurationSeconds = 0;

    if (session.endedAt) {
      // Сессия завершена - используем сохраненное время
      // Но ограничиваем только частью недели, если сессия пересекает границы недели
      const sessionStart =
        session.startedAt < weekStartUTC ? weekStartUTC : session.startedAt;
      const sessionEnd =
        session.endedAt > weekEndUTC ? weekEndUTC : session.endedAt;
      sessionDurationSeconds = Math.floor(
        (sessionEnd.getTime() - sessionStart.getTime()) / 1000
      );
    } else {
      // Сессия активна - ограничиваем время максимальным idle timeout
      const lastActivityAt = session.lastActivityAt || session.startedAt;
      const actualDurationMs = now.getTime() - lastActivityAt.getTime();

      // Если сессия зависшая (старше idle timeout), используем startedAt + idleTimeout
      const effectiveEndTime =
        actualDurationMs > CHAT_IDLE_TIMEOUT_MS
          ? new Date(lastActivityAt.getTime() + CHAT_IDLE_TIMEOUT_MS)
          : now;

      // Ограничиваем только частью недели
      const sessionStart =
        session.startedAt < weekStartUTC ? weekStartUTC : session.startedAt;
      const sessionEnd =
        effectiveEndTime > weekEndUTC ? weekEndUTC : effectiveEndTime;
      sessionDurationSeconds = Math.floor(
        (sessionEnd.getTime() - sessionStart.getTime()) / 1000
      );

    }

    // Считаем минуты только для части недели
    const minutes = calculateSessionMinutes(sessionDurationSeconds);
    usedMinutes += minutes;
  }

  // Лимит будет получен из подписки в вызывающем коде
  // Здесь возвращаем только использованные минуты
  return {
    usedMinutes,
    startOfWeek: weekStartUTC,
    endOfWeek: weekEndUTC,
  };
}
