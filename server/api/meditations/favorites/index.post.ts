import { eq } from 'drizzle-orm';
import {
  meditationFavorites,
  meditationTracks,
} from '@/server/infrastructure/db/schema';
import { db } from '@/server/infrastructure/db/client';
import { getSessionUser } from '@/server/application/auth/session';
import {
  MeditationFavoriteDto,
  MeditationFavoriteRequestDto,
} from '@/shared/dto/meditations';

/**
 * POST /api/meditations/favorites
 * Добавить медитацию в избранное
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

  const body = await readBody(event);
  const parsed = MeditationFavoriteRequestDto.parse(body);

  const [track] = await db
    .select({ id: meditationTracks.id })
    .from(meditationTracks)
    .where(eq(meditationTracks.id, parsed.trackId))
    .limit(1);

  if (!track) {
    throw createError({
      statusCode: 404,
      message: 'Meditation not found',
    });
  }

  await db
    .insert(meditationFavorites)
    .values({
      userId,
      trackId: parsed.trackId,
    })
    .onConflictDoNothing({
      target: [
        meditationFavorites.userId,
        meditationFavorites.trackId,
      ],
    });

  return MeditationFavoriteDto.parse({ trackId: parsed.trackId });
});
