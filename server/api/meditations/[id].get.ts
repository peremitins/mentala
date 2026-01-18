import { and, eq, sql } from 'drizzle-orm';
import {
  meditationFavorites,
  meditationTracks,
} from '@/server/infrastructure/db/schema';
import { db } from '@/server/infrastructure/db/client';
import { getSessionUser } from '@/server/application/auth/session';
import { MeditationTrackDto } from '@/shared/dto/meditations';

/**
 * GET /api/meditations/:id
 * Деталка медитации
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

  const id = getRouterParam(event, 'id');
  if (!id) {
    throw createError({
      statusCode: 400,
      message: 'Meditation ID is required',
    });
  }

  const [track] = await db
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
      isFavorite: sql<boolean>`CASE WHEN ${meditationFavorites.trackId} IS NULL THEN false ELSE true END`,
    })
    .from(meditationTracks)
    .leftJoin(
      meditationFavorites,
      and(
        eq(meditationFavorites.userId, userId),
        eq(meditationFavorites.trackId, meditationTracks.id)
      )
    )
    .where(eq(meditationTracks.id, id))
    .limit(1);

  if (!track) {
    throw createError({
      statusCode: 404,
      message: 'Meditation not found',
    });
  }

  return MeditationTrackDto.parse({
    ...track,
    description: track.description ?? null,
    coverPath: track.coverPath ?? null,
    backgroundPath: track.backgroundPath ?? null,
    durationSeconds: track.durationSeconds ?? null,
    isLoop: track.isLoop ?? false,
    topicKeys: track.topicKeys ?? [],
  });
});
