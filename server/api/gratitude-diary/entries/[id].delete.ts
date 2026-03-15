import { defineEventHandler, getRouterParam, setResponseStatus } from 'h3';
import { and, eq } from 'drizzle-orm';
import { db } from '@@/server/infrastructure/db/client';
import { gratitudeDiaryEntries } from '@@/server/infrastructure/db/schema';
import { getSessionUser } from '@@/server/application/auth/session';
import { assertGratitudeDiaryAccess } from '@/server/application/gratitude-diary/access';
import { deleteFromStorage } from '@/server/infrastructure/storage/upload';

export default defineEventHandler(async (event) => {
  const sessionResult = await getSessionUser(event);
  if (!sessionResult?.user?.id) {
    setResponseStatus(event, 401);
    return { error: true, message: 'Unauthorized' } as const;
  }

  const idRaw = getRouterParam(event, 'id') || '';
  const entryId = Number(idRaw);
  if (!Number.isInteger(entryId) || entryId <= 0) {
    setResponseStatus(event, 400);
    return { error: true, message: 'Invalid entry id' } as const;
  }

  const userId = Number(sessionResult.user.id);
  await assertGratitudeDiaryAccess({
    userId,
    roleId: sessionResult.user.roleId,
  });

  // Удаляем запись из БД, возвращая photoStorageKey для последующей очистки хранилища.
  const [deleted] = await db
    .delete(gratitudeDiaryEntries)
    .where(
      and(
        eq(gratitudeDiaryEntries.id, entryId),
        eq(gratitudeDiaryEntries.userId, userId)
      )
    )
    .returning({
      id: gratitudeDiaryEntries.id,
      photoStorageKey: gratitudeDiaryEntries.photoStorageKey,
    });

  if (!deleted) {
    setResponseStatus(event, 404);
    return { error: true, message: 'Entry not found' } as const;
  }

  // Удаляем объект из хранилища только после успешного удаления из БД.
  // Ошибка удаления из S3 не пробрасывается — только логируется.
  if (deleted.photoStorageKey) {
    await deleteFromStorage(deleted.photoStorageKey);
  }

  return { deleted: true };
});
