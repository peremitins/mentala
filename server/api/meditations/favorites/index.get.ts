import { eq } from 'drizzle-orm';
import {
  meditationFavorites,
  meditationTracks,
} from '@/server/infrastructure/db/schema';
import { db } from '@/server/infrastructure/db/client';
import { getSessionUser } from '@/server/application/auth/session';
import { MeditationTracksDto } from '@/shared/dto/meditations';

/**
 * GET /api/meditations/favorites
 * Список избранных медитаций пользователя
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

  const rows = await db
    .select({
      id: meditationTracks.id,
      title: meditationTracks.title,
      description: meditationTracks.description,
      topicKey: meditationTracks.topicKey,
      topicKeys: meditationTracks.topicKeys,
      audioPath: meditationTracks.audioPath,
      coverPath: meditationTracks.coverPath,
      backgroundPath: meditationTracks.backgroundPath,
      isLoop: meditationTracks.isLoop,
      durationSeconds: meditationTracks.durationSeconds,
    })
    .from(meditationFavorites)
    .innerJoin(
      meditationTracks,
      eq(meditationTracks.id, meditationFavorites.trackId)
    )
    .where(eq(meditationFavorites.userId, userId))
    .orderBy(meditationFavorites.createdAt);

  const payload = rows.map((track) => ({
    ...track,
    description: track.description ?? null,
    coverPath: track.coverPath ?? null,
    backgroundPath: track.backgroundPath ?? null,
    durationSeconds: track.durationSeconds ?? null,
    isLoop: track.isLoop ?? false,
    topicKeys: track.topicKeys ?? [],
    isFavorite: true,
  }));

  return MeditationTracksDto.parse(payload);
});
