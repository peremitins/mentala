import { MEDITATION_TOPICS } from '@/shared/constants/meditations';
import { MeditationTopicsDto } from '@/shared/dto/meditations';
import { getSessionUserWithRole } from '@/server/utils/require-role';

/**
 * GET /api/meditations/topics
 * Список тем для фильтрации медитаций
 */
export default defineEventHandler(async (event) => {
  const sessionUser = await getSessionUserWithRole(event);
  if (!sessionUser?.id) {
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
