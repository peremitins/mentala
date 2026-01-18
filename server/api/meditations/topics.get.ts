import { MEDITATION_TOPICS } from '@/shared/constants/meditations';
import { MeditationTopicsDto } from '@/shared/dto/meditations';
import { getSessionUser } from '@/server/application/auth/session';

/**
 * GET /api/meditations/topics
 * Список тем для фильтрации медитаций
 */
export default defineEventHandler(async (event) => {
  const sessionResult = await getSessionUser(event);
  if (!sessionResult?.user?.id) {
    throw createError({
      statusCode: 401,
      message: 'Unauthorized',
    });
  }

  // Отдаём только нужные поля, без UI-стилей
  const payload = MEDITATION_TOPICS.map((topic) => ({
    key: topic.key,
    name: topic.name,
    description: topic.description,
    emoji: topic.emoji,
  }));

  return MeditationTopicsDto.parse(payload);
});
