import { getSessionUserWithRole } from '@/server/utils/require-role';
import { deleteToolkitItem } from '@/server/application/toolkit/toolkit.service';

/**
 * DELETE /api/toolkit/:id
 * Убрать элемент из «Моего набора».
 */
export default defineEventHandler(async (event): Promise<{ ok: true }> => {
  const sessionUser = await getSessionUserWithRole(event);
  if (!sessionUser?.id) {
    throw createError({ statusCode: 401, message: 'Unauthorized' });
  }

  const id = Number(getRouterParam(event, 'id'));
  if (!Number.isInteger(id) || id <= 0) {
    throw createError({ statusCode: 400, message: 'Некорректный id' });
  }

  const deleted = await deleteToolkitItem(sessionUser.id, id);
  if (!deleted) {
    throw createError({ statusCode: 404, message: 'Элемент не найден' });
  }

  return { ok: true };
});
