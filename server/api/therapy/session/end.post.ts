import { getSessionUser } from '@/server/application/auth/session';
import { createError } from 'h3';
import { z } from 'zod';
import {
  endTherapySession,
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
  const user = await getSessionUser(event);
  if (!user?.id) {
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
        eq(therapySessions.userId, user.id)
      )
    )
    .limit(1);

  if (!session.length) {
    throw createError({
      statusCode: 404,
      statusMessage: 'Session not found',
    });
  }

  const endedSession = await endTherapySession(sessionId);
  const minutes = calculateSessionMinutes(endedSession.durationSeconds);

  return {
    sessionId: endedSession.id,
    durationSeconds: endedSession.durationSeconds,
    minutes,
    endedAt: endedSession.endedAt,
  };
});
