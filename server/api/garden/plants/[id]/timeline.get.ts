import { and, eq } from 'drizzle-orm';
import { createError, defineEventHandler, getRouterParam } from 'h3';
import { getSessionUserWithRole } from '@/server/utils/require-role';
import { db } from '@/server/infrastructure/db/client';
import { userPlants, userPrograms } from '@/server/infrastructure/db/schema';
import { getCheckpointSummaries } from '@/server/application/garden/garden-checkpoint-summary.service';
import type { ProgramTimelineResponseDto } from '@/shared/dto/program-checkpoint';

/**
 * GET /api/garden/plants/:id/timeline
 *
 * Возвращает все чекпоинт-отчёты программы для timeline-UI в Оранжерее.
 * Включает промежуточные (kind='weekly') и финальный (kind='final').
 *
 * Используется компонентами GardenReportsTimeline.vue и
 * GardenPlantReportSheet.vue для переключения между точками маршрута.
 */
export default defineEventHandler(
  async (event): Promise<ProgramTimelineResponseDto> => {
    const sessionUser = await getSessionUserWithRole(event);
    if (!sessionUser?.id) {
      throw createError({ statusCode: 401, statusMessage: 'Unauthorized' });
    }
    const userId = Number(sessionUser.id);

    const plantIdParam = getRouterParam(event, 'id');
    const plantId = Number(plantIdParam);
    if (!Number.isInteger(plantId) || plantId <= 0) {
      throw createError({ statusCode: 400, statusMessage: 'E_VALIDATION' });
    }

    const [plant] = await db
      .select({
        id: userPlants.id,
        programId: userPlants.programId,
        programSlug: userPlants.programSlug,
      })
      .from(userPlants)
      .where(and(eq(userPlants.id, plantId), eq(userPlants.userId, userId)))
      .limit(1);
    if (!plant) {
      throw createError({ statusCode: 404, statusMessage: 'E_NOT_FOUND' });
    }

    const [userProgramRow] = await db
      .select({ id: userPrograms.id })
      .from(userPrograms)
      .where(
        and(
          eq(userPrograms.userId, userId),
          eq(userPrograms.programId, plant.programId)
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
      programSlug: plant.programSlug,
      userProgramId: userProgramRow.id,
      items,
    };
  }
);
