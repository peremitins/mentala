import {
  defineEventHandler,
  getRouterParam,
  setResponseStatus,
} from 'h3';
import { and, eq } from 'drizzle-orm';
import { db } from '@@/server/infrastructure/db/client';
import { gratitudeDiaryFavoritePrompts } from '@@/server/infrastructure/db/schema';
import { getSessionUser } from '@@/server/application/auth/session';

export default defineEventHandler(async (event) => {
  const sessionResult = await getSessionUser(event);
  if (!sessionResult?.user?.id) {
    setResponseStatus(event, 401);
    return { error: true, message: 'Unauthorized' } as const;
  }

  const idRaw = getRouterParam(event, 'id') || '';
  const favoriteId = Number(idRaw);
  if (!Number.isInteger(favoriteId) || favoriteId <= 0) {
    setResponseStatus(event, 400);
    return { error: true, message: 'Invalid favorite id' } as const;
  }

  const userId = Number(sessionResult.user.id);

  // Безопасное удаление: WHERE id AND user_id — чужие записи не затрагиваются.
  // Ошибку при отсутствии записи не кидаем — операция идемпотентна.
  await db
    .delete(gratitudeDiaryFavoritePrompts)
    .where(
      and(
        eq(gratitudeDiaryFavoritePrompts.id, favoriteId),
        eq(gratitudeDiaryFavoritePrompts.userId, userId)
      )
    );

  return { removedId: favoriteId };
});
