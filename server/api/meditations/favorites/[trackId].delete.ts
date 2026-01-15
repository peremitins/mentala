import { and, eq } from 'drizzle-orm';
import { meditationFavorites } from '@/server/infrastructure/db/schema';
import { db } from '@/server/infrastructure/db/client';
import { getSessionUser } from '@/server/application/auth/session';
import { MeditationFavoriteDto } from '@/shared/dto/meditations';

/**
 * DELETE /api/meditations/favorites/:trackId
 * Удалить медитацию из избранного
 */
export default defineEventHandler(async (event) => {
  const sessionResult = await getSessionUser(event);
  if (!sessionResult?.user?.id) {
    throw createError({
      statusCode: 401,
      message: 'Unauthorized',
    });
  }
  const userId = sessionResult.user.id;

  const trackId = getRouterParam(event, 'trackId');
  if (!trackId) {
    throw createError({
      statusCode: 400,
      message: 'trackId is required',
    });
  }

  await db
    .delete(meditationFavorites)
    .where(
      and(
        eq(meditationFavorites.userId, userId),
        eq(meditationFavorites.trackId, trackId)
      )
    );

  return MeditationFavoriteDto.parse({ trackId });
});
