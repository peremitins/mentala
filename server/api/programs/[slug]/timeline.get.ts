import { and, eq } from 'drizzle-orm';
import { createError, defineEventHandler, getRouterParam } from 'h3';
import { getSessionUserWithRole } from '@/server/utils/require-role';
import { db } from '@/server/infrastructure/db/client';
import { programs, userPrograms } from '@/server/infrastructure/db/schema';
import { getCheckpointSummaries } from '@/server/application/garden/garden-checkpoint-summary.service';
import type { ProgramTimelineResponseDto } from '@/shared/dto/program-checkpoint';

/**
 * GET /api/programs/:slug/timeline
 *
 * Аналог /api/garden/plants/:id/timeline, но для активной (ещё не завершённой)
 * программы, у которой пока нет записи в `user_plants`. Возвращает все
 * чекпоинт-отчёты, которые уже сгенерированы (могут быть только weekly,
 * без финального, пока программа в процессе).
 */
export default defineEventHandler(
  async (event): Promise<ProgramTimelineResponseDto> => {
    const sessionUser = await getSessionUserWithRole(event);
    if (!sessionUser?.id) {
      throw createError({ statusCode: 401, statusMessage: 'Unauthorized' });
    }
    const userId = Number(sessionUser.id);

    const slug = getRouterParam(event, 'slug');
    if (!slug || slug.length === 0) {
      throw createError({ statusCode: 400, statusMessage: 'E_VALIDATION' });
    }

    const [programRow] = await db
      .select({ id: programs.id, slug: programs.slug })
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

    const items = await getCheckpointSummaries({
      userId,
      userProgramId: userProgramRow.id,
    });

    return {
      programSlug: programRow.slug,
      userProgramId: userProgramRow.id,
      items,
    };
  }
);
