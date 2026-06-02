import { and, asc, eq, isNull, sql } from 'drizzle-orm';
import { createError, defineEventHandler } from 'h3';
import { getSessionUserWithRole } from '@/server/utils/require-role';
import { db } from '@/server/infrastructure/db/client';
import {
  programs,
  userProgramCheckpointSummaries,
  userPrograms,
} from '@/server/infrastructure/db/schema';

/**
 * GET /api/garden/reports/pending
 *
 * Возвращает самый ранний непросмотренный готовый отчёт пользователя.
 * Используется in-app модалкой «У тебя готов отчёт» (опрос на foreground'е
 * через polling или visibilitychange).
 *
 * Если такого нет — возвращаем `{report: null}`.
 *
 * Lightweight: только метаданные (id, checkpointStep, kind, programSlug,
 * programTitle, generatedAt) — без summaryText, чтобы payload был мал.
 * Полный текст фронт подгрузит через timeline-endpoint при открытии sheet'а.
 */
export default defineEventHandler(async (event) => {
  const sessionUser = await getSessionUserWithRole(event);
  if (!sessionUser?.id) {
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized' });
  }
  const userId = Number(sessionUser.id);

  const [row] = await db
    .select({
      id: userProgramCheckpointSummaries.id,
      userProgramId: userProgramCheckpointSummaries.userProgramId,
      programSlug: userProgramCheckpointSummaries.programSlug,
      checkpointStep: userProgramCheckpointSummaries.checkpointStep,
      kind: userProgramCheckpointSummaries.kind,
      generatedAt: userProgramCheckpointSummaries.generatedAt,
      programTitle: programs.title,
    })
    .from(userProgramCheckpointSummaries)
    .leftJoin(
      userPrograms,
      eq(userProgramCheckpointSummaries.userProgramId, userPrograms.id)
    )
    .leftJoin(programs, eq(userPrograms.programId, programs.id))
    .where(
      and(
        eq(userProgramCheckpointSummaries.userId, userId),
        eq(userProgramCheckpointSummaries.generationStatus, 'ready'),
        isNull(userProgramCheckpointSummaries.viewedAt),
        // Защита от старых записей: показываем только за последние 14 дней,
        // чтобы юзер не получил уведомление про отчёт месячной давности.
        sql`${userProgramCheckpointSummaries.generatedAt} >= NOW() - INTERVAL '14 days'`
      )
    )
    .orderBy(asc(userProgramCheckpointSummaries.generatedAt))
    .limit(1);

  if (!row) {
    return { report: null };
  }

  return {
    report: {
      id: row.id,
      userProgramId: row.userProgramId,
      programSlug: row.programSlug,
      programTitle: row.programTitle ?? row.programSlug,
      checkpointStep: row.checkpointStep,
      kind: row.kind,
      generatedAt: row.generatedAt.toISOString(),
    },
  };
});
