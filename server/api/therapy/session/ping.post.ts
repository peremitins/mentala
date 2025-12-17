import { getSessionUser } from '@/server/application/auth/session';
import { createError } from 'h3';
import { z } from 'zod';
import { db } from '@/server/infrastructure/db/client';
import { therapySessions } from '@/server/infrastructure/db/schema';
import { and, eq, isNull } from 'drizzle-orm';

const pingSchema = z.object({
  sessionId: z.number(),
});

/**
 * POST /api/therapy/session/ping
 * Обновить lastActivityAt для корректного биллинга и idle timeout на сервере
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
  const { sessionId } = pingSchema.parse(body);

  const now = new Date();

  const updated = await db
    .update(therapySessions)
    .set({
      lastActivityAt: now,
      updatedAt: now,
    })
    .where(
      and(
        eq(therapySessions.id, sessionId),
        eq(therapySessions.userId, user.id),
        isNull(therapySessions.endedAt)
      )
    )
    .returning({ id: therapySessions.id });

  if (!updated.length) {
    throw createError({
      statusCode: 404,
      statusMessage: 'Session not found',
    });
  }

  return { ok: true, lastActivityAt: now.toISOString() };
});

