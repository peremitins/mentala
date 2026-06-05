import { getSessionUserWithRole } from '@/server/utils/require-role';
import { listToolkitItems } from '@/server/application/toolkit/toolkit.service';
import type { UserToolkitItem } from '@/shared/dto/toolkit';

/**
 * GET /api/toolkit
 * Список элементов «Моего набора» пользователя.
 */
export default defineEventHandler(async (event): Promise<UserToolkitItem[]> => {
  const sessionUser = await getSessionUserWithRole(event);
  if (!sessionUser?.id) {
    throw createError({ statusCode: 401, message: 'Unauthorized' });
  }
  return listToolkitItems(sessionUser.id);
});
