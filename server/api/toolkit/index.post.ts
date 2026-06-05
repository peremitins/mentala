import { getSessionUserWithRole } from '@/server/utils/require-role';
import { createToolkitPhrase } from '@/server/application/toolkit/toolkit.service';
import { CreateToolkitPhraseDto } from '@/shared/dto/toolkit';
import type { UserToolkitItem } from '@/shared/dto/toolkit';

/**
 * POST /api/toolkit
 * Добавить личную фразу в «Мой набор» вручную.
 */
export default defineEventHandler(async (event): Promise<UserToolkitItem> => {
  const sessionUser = await getSessionUserWithRole(event);
  if (!sessionUser?.id) {
    throw createError({ statusCode: 401, message: 'Unauthorized' });
  }

  const body = await readBody(event);
  const parsed = CreateToolkitPhraseDto.safeParse(body);
  if (!parsed.success) {
    throw createError({
      statusCode: 400,
      message: 'Текст фразы обязателен (до 300 символов)',
    });
  }

  return createToolkitPhrase(sessionUser.id, parsed.data.content);
});
