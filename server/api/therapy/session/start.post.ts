import { getSessionUserWithRole } from '@/server/utils/require-role';
import { createError } from 'h3';
import {
  endTherapySession,
  startTherapySession,
} from '@/server/application/subscriptions/session-time.service';
import { db } from '@/server/infrastructure/db/client';
import { therapySessions } from '@/server/infrastructure/db/schema';
import { and, desc, eq, isNull } from 'drizzle-orm';
import { getAiUsageGate } from '@/server/application/subscriptions/ai-usage.service';
import { CHAT_IDLE_TIMEOUT_MS } from '@/server/config/subscription';

/**
 * POST /api/therapy/session/start
 * Начать сессию терапии (вызывается при отправке первого сообщения)
 */
export default defineEventHandler(async (event) => {
  const sessionResult = await getSessionUserWithRole(event);
  if (!sessionResult?.id) {
    throw createError({
      statusCode: 401,
      statusMessage: 'Unauthorized',
    });
  }

  const gate = await getAiUsageGate(sessionResult.id, sessionResult.role);
  if (gate.status === 'no_ai_access') {
    throw createError({
      statusCode: 403,
      statusMessage: 'AI access is not available for your plan',
      data: {
        code: 'no_ai_access',
      },
    });
  }
  if (gate.status === 'weekly_limit_reached') {
    throw createError({
      statusCode: 402,
      statusMessage: 'Weekly minutes limit exceeded',
      data: {
        code: 'weekly_limit_reached',
        weeklyLimit: gate.weeklyLimit,
        usedMinutes: gate.usedMinutes,
        overdraftUsed: gate.overdraftUsed,
      },
    });
  }

  const now = new Date();

  // Идемпотентность: если сессия уже активна — возвращаем её
  const existing = await db
    .select({
      id: therapySessions.id,
      startedAt: therapySessions.startedAt,
      lastActivityAt: therapySessions.lastActivityAt,
    })
    .from(therapySessions)
    .where(
      and(
        eq(therapySessions.userId, sessionResult.id),
        isNull(therapySessions.endedAt)
      )
    )
    .orderBy(desc(therapySessions.startedAt))
    .limit(1);

  if (existing.length) {
    const active = existing[0];
    const last = active.lastActivityAt || active.startedAt;

    // Если сессия "протухла" (idle timeout), закрываем её и стартуем новую.
    if (now.getTime() - last.getTime() > CHAT_IDLE_TIMEOUT_MS) {
      await endTherapySession(active.id);
    } else {
      await db
        .update(therapySessions)
        .set({ lastActivityAt: now, updatedAt: now })
        .where(eq(therapySessions.id, active.id));

      return {
        sessionId: active.id,
        startedAt: active.startedAt,
      };
    }
  }

  const session = await startTherapySession(sessionResult.id);

  return {
    sessionId: session.id,
    startedAt: session.startedAt,
  };
});
