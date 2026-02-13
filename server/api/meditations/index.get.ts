import { getQuery } from 'h3';
import { and, arrayContains, eq, or, sql } from 'drizzle-orm';
import {
  meditationFavorites,
  meditationTracks,
} from '@/server/infrastructure/db/schema';
import { db } from '@/server/infrastructure/db/client';
import { getSessionUserWithRole } from '@/server/utils/require-role';
import {
  MeditationTracksDto,
  MeditationTopicKeyEnum,
} from '@/shared/dto/meditations';

/**
 * GET /api/meditations
 * Список медитаций (с фильтром по теме)
 */
export default defineEventHandler(async (event) => {
  const sessionUser = await getSessionUserWithRole(event);
  if (!sessionUser?.id) {
    throw createError({
      statusCode: 401,
      message: 'Unauthorized',
    });
  }
  const userId = sessionUser.id;

  const topicQuery = getQuery(event).topic;
  const rawTopicKey =
    typeof topicQuery === 'string' && topicQuery.trim()
      ? topicQuery.trim()
      : null;
  let topicKey: string | null = null;

  if (rawTopicKey) {
    const parsed = MeditationTopicKeyEnum.safeParse(rawTopicKey);
    if (!parsed.success) {
      throw createError({
        statusCode: 400,
        message: 'Invalid meditation topic',
      });
    }
    topicKey = parsed.data;
  }

  const baseQuery = db
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
    );

  const finalQuery = topicKey
    ? baseQuery.where(
        or(
          eq(meditationTracks.topicKey, topicKey),
          arrayContains(meditationTracks.topicKeys, [topicKey])
        )
      )
    : baseQuery;

  const rows = await finalQuery.orderBy(meditationTracks.createdAt);

  const payload = rows.map((track) => ({
    ...track,
    description: track.description ?? null,
    coverPath: track.coverPath ?? null,
    backgroundPath: track.backgroundPath ?? null,
    durationSeconds: track.durationSeconds ?? null,
    isLoop: track.isLoop ?? false,
    topicKeys: track.topicKeys ?? [],
  }));

  return MeditationTracksDto.parse(payload);
});
