import { getSessionUser } from '@/server/application/auth/session';
import { createError } from 'h3';
import { z } from 'zod';
import {
  endTherapySessionWithOptions,
  calculateSessionMinutes,
} from '@/server/application/subscriptions/session-time.service';
import { db } from '@/server/infrastructure/db/client';
import { therapySessions } from '@/server/infrastructure/db/schema';
import { eq, and } from 'drizzle-orm';

const endSessionSchema = z.object({
  sessionId: z.number(),
});

/**
 * POST /api/therapy/session/end
 * Завершить сессию терапии
 */
export default defineEventHandler(async (event) => {
  const sessionResult = await getSessionUser(event);
  if (!sessionResult?.user?.id) {
    throw createError({
      statusCode: 401,
      statusMessage: 'Unauthorized',
    });
  }

  const body = await readBody(event);
  const { sessionId } = endSessionSchema.parse(body);

  // Проверяем, что сессия принадлежит пользователю
  const session = await db
    .select()
    .from(therapySessions)
    .where(
      and(
        eq(therapySessions.id, sessionId),
        eq(therapySessions.userId, sessionResult.user.id)
      )
    )
    .limit(1);

  if (!session.length) {
    throw createError({
      statusCode: 404,
      statusMessage: 'Session not found',
    });
  }

  // skipPostEndMemoryLifecycle: не запускаем BullMQ-задачу здесь — она удалит
  // therapy_session_messages раньше, чем пользователь успеет восстановить сессию.
  // Lifecycle (AI handoff + очистка транскрипта) запустится позже — при генерации
  // пользовательского саммари в sessionSummaryUser.service.ts.
  const endedSession = await endTherapySessionWithOptions(sessionId, undefined, {
    skipPostEndMemoryLifecycle: true,
  });
  const minutes = calculateSessionMinutes(endedSession.durationSeconds);

  return {
    sessionId: endedSession.id,
    durationSeconds: endedSession.durationSeconds,
    minutes,
    endedAt: endedSession.endedAt,
  };
});
