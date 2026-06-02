import { and, eq } from 'drizzle-orm';
import { createError, defineEventHandler, getRouterParam } from 'h3';
import { getSessionUserWithRole } from '@/server/utils/require-role';
import { getOrGeneratePlantSummary } from '@/server/application/garden/garden-summary.service';
import { db } from '@/server/infrastructure/db/client';
import { userPlants } from '@/server/infrastructure/db/schema';

/**
 * POST /api/garden/plants/by-slug/:slug/refresh-summary
 *
 * Удобная альтернатива `POST /api/garden/plants/:id/refresh-summary` для
 * фронта, который оперирует programSlug, а не plantId (GardenPlantItemDto
 * не содержит numeric id). Внутри ищем `user_plants` по `(userId, programSlug)`
 * и проксируем в основной сервис.
 *
 * Используется в `GardenTransplantHandoff.vue` для подтягивания подробного
 * AI-итога завершённого сада перед стартом следующего.
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

  const [plant] = await db
    .select({ id: userPlants.id })
    .from(userPlants)
    .where(and(eq(userPlants.userId, userId), eq(userPlants.programSlug, slug)))
    .limit(1);

  if (!plant) {
    throw createError({ statusCode: 404, statusMessage: 'E_NOT_FOUND' });
  }

  const url = new URL(event.node.req.url || '', 'http://x');
  const force = url.searchParams.get('force') === '1';

  const result = await getOrGeneratePlantSummary({
    userId,
    plantId: plant.id,
    force,
  });

  return {
    summaryText: result.summaryText,
    generated: result.generated,
  };
});
