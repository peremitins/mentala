import { and, eq, sql } from 'drizzle-orm';
import { createError, defineEventHandler, getRouterParam } from 'h3';
import { getSessionUserWithRole } from '@/server/utils/require-role';
import { db } from '@/server/infrastructure/db/client';
import { userProgramCheckpointSummaries } from '@/server/infrastructure/db/schema';

/**
 * POST /api/garden/reports/:id/mark-viewed
 *
 * Отметка просмотра отчёта пользователем. После этого:
 *   - In-app модалка «готов отчёт» больше не появится для этой записи;
 *   - Push-уведомление (если ещё не отправлено) не будет отправлено;
 *   - GET /api/garden/reports/pending его не вернёт.
 *
 * Идемпотентно: повторный вызов на уже viewed отчёте не меняет viewedAt
 * (сохраняем первоначальный timestamp как «момент первого просмотра»).
 */
export default defineEventHandler(async (event) => {
  const sessionUser = await getSessionUserWithRole(event);
  if (!sessionUser?.id) {
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized' });
  }
  const userId = Number(sessionUser.id);

  const idParam = getRouterParam(event, 'id');
  const reportId = Number(idParam);
  if (!Number.isInteger(reportId) || reportId <= 0) {
    throw createError({ statusCode: 400, statusMessage: 'E_VALIDATION' });
  }

  // Одним UPDATE...RETURNING вместо SELECT + UPDATE.
  // COALESCE сохраняет первоначальный viewedAt (идемпотентность).
  // WHERE user_id = ? — 404 вместо 403 для чужих записей (лучше безопасность).
  const [row] = await db
    .update(userProgramCheckpointSummaries)
    .set({
      viewedAt: sql<Date>`COALESCE(${userProgramCheckpointSummaries.viewedAt}, NOW())`,
      updatedAt: sql<Date>`CASE WHEN ${userProgramCheckpointSummaries.viewedAt} IS NULL THEN NOW() ELSE ${userProgramCheckpointSummaries.updatedAt} END`,
    })
    .where(
      and(
        eq(userProgramCheckpointSummaries.id, reportId),
        eq(userProgramCheckpointSummaries.userId, userId)
      )
    )
    .returning({ viewedAt: userProgramCheckpointSummaries.viewedAt });

  if (!row) {
    throw createError({ statusCode: 404, statusMessage: 'E_NOT_FOUND' });
  }

  return { ok: true, viewedAt: row.viewedAt!.toISOString() };
});
