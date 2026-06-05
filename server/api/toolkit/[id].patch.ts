import { getSessionUserWithRole } from '@/server/utils/require-role';
import { updateToolkitPhrase } from '@/server/application/toolkit/toolkit.service';
import { UpdateToolkitPhraseDto } from '@/shared/dto/toolkit';
import type { UserToolkitItem } from '@/shared/dto/toolkit';

/**
 * PATCH /api/toolkit/:id
 * Редактировать текст личной фразы. Системные элементы редактировать нельзя.
 */
export default defineEventHandler(async (event): Promise<UserToolkitItem> => {
  const sessionUser = await getSessionUserWithRole(event);
  if (!sessionUser?.id) {
    throw createError({ statusCode: 401, message: 'Unauthorized' });
  }

  const id = Number(getRouterParam(event, 'id'));
  if (!Number.isInteger(id) || id <= 0) {
    throw createError({ statusCode: 400, message: 'Некорректный id' });
  }

  const body = await readBody(event);
  const parsed = UpdateToolkitPhraseDto.safeParse(body);
  if (!parsed.success) {
    throw createError({
      statusCode: 400,
      message: 'Текст фразы обязателен (до 300 символов)',
    });
  }

  const updated = await updateToolkitPhrase(
    sessionUser.id,
    id,
    parsed.data.content
  );
  if (!updated) {
    throw createError({
      statusCode: 404,
      message: 'Фраза не найдена или не редактируется',
    });
  }

  return updated;
});
