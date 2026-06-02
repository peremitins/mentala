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
import { trackRetentionEvent } from '@/server/application/analytics/retention-events.service';

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
  const endedSession = await endTherapySessionWithOptions(
    sessionId,
    undefined,
    {
      skipPostEndMemoryLifecycle: true,
    }
  );
  const minutes = calculateSessionMinutes(endedSession.durationSeconds);

  // Аналитика: chat session finalize integrity (стратегия §10, целевое 99.5%+).
  // Если событие не пришло, значит finalize до сервера не долетел — это сигнал
  // о деградации lifecycle'а чата.
  trackRetentionEvent('chat_session_finalized', {
    userId: sessionResult.user.id,
    sessionId: endedSession.id,
    durationSec: endedSession.durationSeconds ?? 0,
  });

  return {
    sessionId: endedSession.id,
    durationSeconds: endedSession.durationSeconds,
    minutes,
    endedAt: endedSession.endedAt,
  };
});
