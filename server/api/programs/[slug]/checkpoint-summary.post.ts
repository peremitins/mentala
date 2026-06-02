import { and, eq } from 'drizzle-orm';
import { createError, defineEventHandler, getRouterParam, readBody } from 'h3';
import { getSessionUserWithRole } from '@/server/utils/require-role';
import { db } from '@/server/infrastructure/db/client';
import { programs, userPrograms } from '@/server/infrastructure/db/schema';
import { generateCheckpointSummary } from '@/server/application/garden/garden-checkpoint-summary.service';
import {
  CheckpointGenerateRequestDto,
  type CheckpointSummaryResponseDto,
} from '@/shared/dto/program-checkpoint';

/**
 * POST /api/programs/:slug/checkpoint-summary
 *
 * Генерирует промежуточный (или финальный) AI-отчёт по программе для
 * указанного чекпоинта (7 | 14 | 21 | 30). Вызывается фронтом после
 * успешного завершения weekly_check action на соответствующем шаге.
 *
 * Идемпотентно: если отчёт для этого (userProgramId, checkpointStep) уже
 * есть и не передан force=true — возвращает существующий мгновенно.
 *
 * Синхронный вызов: ждёт LLM (5-15 сек). При сбое LLM возвращается
 * fallback-текст с status='failed' (фронт всё равно покажет осмысленный
 * текст). UI может полить GET-вариант если нужно polling.
 */
export default defineEventHandler(
  async (event): Promise<CheckpointSummaryResponseDto> => {
    const sessionUser = await getSessionUserWithRole(event);
    if (!sessionUser?.id) {
      throw createError({ statusCode: 401, statusMessage: 'Unauthorized' });
    }
    const userId = Number(sessionUser.id);

    const slug = getRouterParam(event, 'slug');
    if (!slug || slug.length === 0) {
      throw createError({ statusCode: 400, statusMessage: 'E_VALIDATION' });
    }

    const rawBody = await readBody(event);
    const parsed = CheckpointGenerateRequestDto.safeParse(rawBody);
    if (!parsed.success) {
      throw createError({
        statusCode: 400,
        statusMessage: 'E_VALIDATION',
        data: { code: 'E_VALIDATION', details: parsed.error.flatten() },
      });
    }
    const { checkpointStep, force } = parsed.data;

    // Resolve userProgram по slug.
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

    const result = await generateCheckpointSummary({
      userId,
      userProgramId: userProgramRow.id,
      checkpointStep,
      force,
    });

    return {
      id: result.id,
      checkpointStep,
      status: result.status,
      summaryText: result.summaryText,
      structuredData: result.structuredData,
    };
  }
);
