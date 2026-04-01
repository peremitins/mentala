/**
 * Сервис для подсчета времени сессий
 */

import { db } from '@/server/infrastructure/db/client';
import { therapySessions } from '@/server/infrastructure/db/schema';
import { eq, and, gte, lte, or, lt, isNull } from 'drizzle-orm';
import { CHAT_IDLE_TIMEOUT_MS } from '@/server/config/subscription';
import { toZonedTime, fromZonedTime } from 'date-fns-tz';
import { calculateUsageForSessionsInWindow } from './usage-calculation.utils';
import { handleTherapySessionEnded } from '@/server/application/chat/chatMemory.service';

export {
  calculateSessionMinutes,
  calculateUsageForSessionsInWindow,
  type TherapySessionUsageRecord,
} from './usage-calculation.utils';

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

function resolveDbClient(tx?: any) {
  return tx ?? db;
}

function normalizeClientSessionId(value?: string | null): string | null {
  const normalized = String(value || '').trim();
  return normalized.length > 0 ? normalized : null;
}

/**
 * Начать сессию терапии
 */
export async function startTherapySession(
  userId: number,
  tx?: any,
  options?: {
    clientSessionId?: string | null;
  }
) {
  const now = new Date();
  const client = resolveDbClient(tx);

  const [session] = await client
    .insert(therapySessions)
    .values({
      userId,
      clientSessionId: normalizeClientSessionId(options?.clientSessionId),
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
export async function endTherapySession(sessionId: number, tx?: any) {
  return endTherapySessionWithOptions(sessionId, tx);
}

export async function endTherapySessionWithOptions(
  sessionId: number,
  tx?: any,
  options?: {
    endedAt?: Date;
    skipPostEndMemoryLifecycle?: boolean;
  }
) {
  const now = new Date();
  const client = resolveDbClient(tx);

  const session = await client
    .select()
    .from(therapySessions)
    .where(eq(therapySessions.id, sessionId))
    .limit(1);

  if (!session.length) {
    throw new Error(`Session ${sessionId} not found`);
  }

  if (session[0].endedAt) {
    return session[0];
  }

  const startedAt = session[0].startedAt;

  // Используем lastActivityAt если есть, иначе startedAt
  // Для зависших сессий используем startedAt + idleTimeout
  const lastActivityAt = session[0].lastActivityAt || startedAt;
  const requestedEndTime =
    options?.endedAt instanceof Date ? options.endedAt : now;
  const actualEndTime =
    now.getTime() - lastActivityAt.getTime() > CHAT_IDLE_TIMEOUT_MS
      ? new Date(lastActivityAt.getTime() + CHAT_IDLE_TIMEOUT_MS) // Зависшая сессия - ограничиваем idle timeout
      : requestedEndTime; // Нормальное завершение или внешне заданное время
  const normalizedEndTime =
    actualEndTime.getTime() < startedAt.getTime() ? startedAt : actualEndTime;

  const durationMs = normalizedEndTime.getTime() - startedAt.getTime();
  const durationSeconds = Math.max(0, Math.floor(durationMs / 1000)); // Гарантируем неотрицательное значение

  await client
    .update(therapySessions)
    .set({
      endedAt: normalizedEndTime,
      durationSeconds,
    })
    .where(eq(therapySessions.id, sessionId));

  const endedSession = {
    ...session[0],
    endedAt: normalizedEndTime,
    durationSeconds,
  };

  // Для transaction-aware вызовов не запускаем асинхронный lifecycle внутри tx.
  if (!tx && options?.skipPostEndMemoryLifecycle !== true) {
    try {
      await handleTherapySessionEnded({
        therapySessionId: endedSession.id,
        userId: endedSession.userId,
      });
    } catch (error) {
      console.error(
        '[SessionTime] Failed to trigger post-end session memory pipeline:',
        error
      );
    }
  }

  return endedSession;
}

/**
 * Получить использованные минуты в текущей неделе
 * Считает неделю в timezone пользователя
 */
export async function getUsageForCurrentWeek(
  userId: number,
  userTimezone: string = 'Europe/Moscow',
  options?: {
    periodStartedAt?: Date | null;
    now?: Date;
  }
) {
  // Получаем текущее время
  const now = options?.now ?? new Date();

  // Получаем начало и конец недели в timezone пользователя, конвертированные в UTC
  const weekStartUTC = getStartOfWeek(now, userTimezone);
  const weekEndUTC = getEndOfWeek(now, userTimezone);
  const periodStartedAt = options?.periodStartedAt ?? null;
  const usageWindowStartUTC =
    periodStartedAt && periodStartedAt.getTime() > weekStartUTC.getTime()
      ? periodStartedAt
      : weekStartUTC;

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
            gte(therapySessions.startedAt, usageWindowStartUTC),
            lte(therapySessions.startedAt, weekEndUTC)
          ),
          // ИЛИ сессия началась до недели, но еще не закончилась (endedAt null) или закончилась после начала недели
          and(
            lt(therapySessions.startedAt, usageWindowStartUTC),
            or(
              isNull(therapySessions.endedAt),
              gte(therapySessions.endedAt, usageWindowStartUTC)
            )
          )
        )
      )
    );
  const usedMinutes = calculateUsageForSessionsInWindow(sessions, {
    windowStart: usageWindowStartUTC,
    windowEnd: weekEndUTC,
    idleTimeoutMs: CHAT_IDLE_TIMEOUT_MS,
    now,
  });

  // Лимит будет получен из подписки в вызывающем коде
  // Здесь возвращаем только использованные минуты
  return {
    usedMinutes,
    startOfWeek: weekStartUTC,
    endOfWeek: weekEndUTC,
    countingFrom: usageWindowStartUTC,
  };
}
