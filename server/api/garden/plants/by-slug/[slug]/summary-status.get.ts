import { and, eq } from 'drizzle-orm';
import { createError, defineEventHandler, getRouterParam } from 'h3';
import { getSessionUserWithRole } from '@/server/utils/require-role';
import { db } from '@/server/infrastructure/db/client';
import { userPlants, userPrograms } from '@/server/infrastructure/db/schema';
import {
  type ProgramJourneyMetrics,
  getOrGeneratePlantSummary,
} from '@/server/application/garden/garden-summary.service';
import {
  collectProgramMetricsLightweight,
  type ProgramMetricsLightweight,
} from '@/server/application/garden/garden-metrics.service';

/**
 * GET /api/garden/plants/by-slug/:slug/summary-status
 *
 * Альтернатива `GET /api/garden/plants/:id/summary-status`, удобная для
 * фронта на странице шага программы — там известен programSlug, а не plantId.
 *
 * Логика идентична: возвращает status='ready' с готовым summaryText + metrics,
 * либо 'pending' если AI-генерация ещё идёт. См. длинный comment в основном
 * endpoint'е /api/garden/plants/[id]/summary-status.
 */
export default defineEventHandler(async (event) => {
  const sessionUser = await getSessionUserWithRole(event);
  if (!sessionUser?.id) {
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized' });
  }

  const userId = Number(sessionUser.id);
  const slug = String(getRouterParam(event, 'slug') || '').trim();
  if (!slug) {
    throw createError({ statusCode: 400, statusMessage: 'E_VALIDATION' });
  }

  // JOIN вместо двух последовательных SELECT: userProgramRow зависит от plant.programId.
  const [row] = await db
    .select({
      plantId: userPlants.id,
      programId: userPlants.programId,
      userSummary: userPlants.userSummary,
      completedAt: userPlants.completedAt,
      upId: userPrograms.id,
      upStartedAt: userPrograms.startedAt,
      upCompletedAt: userPrograms.completedAt,
    })
    .from(userPlants)
    .leftJoin(
      userPrograms,
      and(
        eq(userPrograms.userId, userId),
        eq(userPrograms.programId, userPlants.programId)
      )
    )
    .where(and(eq(userPlants.userId, userId), eq(userPlants.programSlug, slug)))
    .limit(1);

  if (!row) {
    throw createError({ statusCode: 404, statusMessage: 'E_NOT_FOUND' });
  }

  const plant = { id: row.plantId, userSummary: row.userSummary, completedAt: row.completedAt };
  const userProgramRow = row.upId ? { id: row.upId, startedAt: row.upStartedAt, completedAt: row.upCompletedAt } : null;

  let metrics: ProgramJourneyMetrics | ProgramMetricsLightweight | null = null;
  if (userProgramRow?.startedAt && userProgramRow?.id) {
    metrics = await collectProgramMetricsLightweight({
      userId,
      userProgramId: userProgramRow.id,
      programStartedAt: userProgramRow.startedAt,
      programCompletedAt: userProgramRow.completedAt,
    });
  }

  const summaryText = (plant.userSummary || '').trim();
  if (summaryText.length > 0) {
    return {
      plantId: plant.id,
      status: 'ready' as const,
      summaryText,
      metrics,
    };
  }

  const completedAt = plant.completedAt ? new Date(plant.completedAt) : null;
  const isStuck =
    completedAt !== null && Date.now() - completedAt.getTime() > 60_000;
  if (isStuck) {
    try {
      const result = await getOrGeneratePlantSummary({
        userId,
        plantId: plant.id,
        force: true,
      });
      return {
        plantId: plant.id,
        status: 'ready' as const,
        summaryText: result.summaryText,
        metrics: result.metrics ?? metrics,
      };
    } catch (error) {
      console.error(
        '[summary-status by-slug] sync regeneration after stuck pending failed:',
        error
      );
    }
  }

  return {
    plantId: plant.id,
    status: 'pending' as const,
    summaryText: null,
    metrics,
  };
});
