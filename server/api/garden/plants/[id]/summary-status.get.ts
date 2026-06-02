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
 * GET /api/garden/plants/:id/summary-status
 *
 * Lightweight polling-endpoint для фронта во время генерации клинического
 * отчёта. Не вызывает LLM (в отличие от refresh-summary), просто читает
 * текущее состояние `user_plants.user_summary` + метрики путешествия.
 *
 * Архитектура полного flow:
 *   1. Пользователь завершает последний шаг → backend completeProgramStep
 *      создаёт user_plants с user_summary=null + fire-and-forget LLM.
 *   2. Фронт показывает full-screen overlay «Готовлю разбор сада…» и
 *      делает polling этого endpoint'а каждые 2 сек.
 *   3. Когда user_summary становится непустым → status='ready', overlay
 *      сменяется на GardenPlantReportSheet с готовым отчётом.
 *   4. Если за 15 сек статус всё ещё pending → фронт показывает CTA
 *      «Уйти в /garden — пришлём уведомление». Backend продолжает
 *      генерацию, при заходе на /garden пользователь увидит готовый
 *      отчёт без повторной генерации.
 *
 * Status values:
 *   - 'ready'   — user_summary заполнен (LLM завершился ИЛИ fallback preset).
 *   - 'pending' — user_summary пуст (генерация ещё идёт).
 */
export default defineEventHandler(async (event) => {
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

  // JOIN вместо двух последовательных SELECT: userProgramRow зависит от plant.programId,
  // поэтому параллелить нельзя — объединяем в один запрос.
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
    .where(and(eq(userPlants.id, plantId), eq(userPlants.userId, userId)))
    .limit(1);

  if (!row) {
    throw createError({ statusCode: 404, statusMessage: 'E_NOT_FOUND' });
  }

  const plant = { id: row.plantId, programId: row.programId, userSummary: row.userSummary, completedAt: row.completedAt };
  const userProgramRow = row.upId ? { id: row.upId, startedAt: row.upStartedAt, completedAt: row.upCompletedAt } : null;

  // Метрики путешествия для KPI-карточек в UI отчёта.
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
      status: 'ready' as const,
      summaryText,
      metrics,
    };
  }

  // Безопасная страховка: если plant создан давно, но user_summary всё ещё
  // null (генерация упала и polling зашёл слишком поздно) — запускаем
  // регенерацию синхронно. Считаем «давно» = больше 60 сек назад. Это
  // лечит ситуации с killed nitro-instance / временным сбоем LLM.
  const completedAt = plant.completedAt ? new Date(plant.completedAt) : null;
  const isStuck =
    completedAt !== null && Date.now() - completedAt.getTime() > 60_000;
  if (isStuck) {
    try {
      const result = await getOrGeneratePlantSummary({
        userId,
        plantId,
        force: true,
      });
      return {
        status: 'ready' as const,
        summaryText: result.summaryText,
        metrics: result.metrics ?? metrics,
      };
    } catch (error) {
      console.error(
        '[summary-status] sync regeneration after stuck pending failed:',
        error
      );
      // Падаем в pending — фронт покажет CTA «отчёт готовится в фоне».
    }
  }

  return {
    status: 'pending' as const,
    summaryText: null,
    metrics,
  };
});
