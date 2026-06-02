import { and, eq } from 'drizzle-orm';
import { createError, defineEventHandler, getRouterParam } from 'h3';
import { getSessionUserWithRole } from '@/server/utils/require-role';
import { db } from '@/server/infrastructure/db/client';
import { programs, userPrograms } from '@/server/infrastructure/db/schema';
import { getCheckpointSummary } from '@/server/application/garden/garden-checkpoint-summary.service';
import type { CheckpointSummaryResponseDto } from '@/shared/dto/program-checkpoint';

/**
 * GET /api/programs/:slug/checkpoint-summary/:step
 *
 * Lightweight polling endpoint для фронта (если POST вернул pending или
 * фронт хочет проверить статус без перегенерации). Не вызывает LLM, просто
 * читает БД и отдаёт текущий статус.
 *
 * status='pending' — отчёт ещё не сгенерирован (POST не вызван или в полёте).
 * status='ready'   — текст готов.
 * status='failed'  — LLM упал, отдаётся fallback-текст (всё равно показываем).
 */
export default defineEventHandler(
  async (event): Promise<CheckpointSummaryResponseDto> => {
    const sessionUser = await getSessionUserWithRole(event);
    if (!sessionUser?.id) {
      throw createError({ statusCode: 401, statusMessage: 'Unauthorized' });
    }
    const userId = Number(sessionUser.id);

    const slug = getRouterParam(event, 'slug');
    const stepParam = getRouterParam(event, 'step');
    const checkpointStep = Number(stepParam);
    if (
      !slug ||
      !Number.isInteger(checkpointStep) ||
      ![7, 14, 21, 30].includes(checkpointStep)
    ) {
      throw createError({ statusCode: 400, statusMessage: 'E_VALIDATION' });
    }

    const [programRow] = await db
      .select({ id: programs.id })
      .from(programs)
      .where(eq(programs.slug, slug))
      .limit(1);
    if (!programRow) {
      throw createError({ statusCode: 404, statusMessage: 'E_NOT_FOUND' });
    }

    const [userProgramRow] = await db
      .select({ id: userPrograms.id })
      .from(userPrograms)
      .where(
        and(
          eq(userPrograms.userId, userId),
          eq(userPrograms.programId, programRow.id)
        )
      )
      .limit(1);
    if (!userProgramRow) {
      throw createError({ statusCode: 404, statusMessage: 'E_NOT_FOUND' });
    }

    const existing = await getCheckpointSummary({
      userId,
      userProgramId: userProgramRow.id,
      checkpointStep: checkpointStep as 7 | 14 | 21 | 30,
    });

    if (!existing) {
      return {
        checkpointStep: checkpointStep as 7 | 14 | 21 | 30,
        status: 'pending',
        summaryText: null,
        structuredData: null,
      };
    }

    return {
      checkpointStep: checkpointStep as 7 | 14 | 21 | 30,
      status: existing.status,
      summaryText: existing.summaryText,
      structuredData: existing.structuredData,
    };
  }
);
