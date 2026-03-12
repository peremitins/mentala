// Удаление orphan-фото из Yandex Object Storage.
// Используется когда пользователь загрузил фото, но удалил его до сохранения записи.
import { defineEventHandler, readBody, setResponseStatus } from 'h3';
import { getSessionUser } from '@@/server/application/auth/session';
import { assertGratitudeDiaryAccess } from '@/server/application/gratitude-diary/access';
import { deleteFromStorage } from '@/server/infrastructure/storage/upload';
import { GratitudeDiaryDeletePhotoDto } from '@/shared/dto';

export default defineEventHandler(async (event) => {
  const sessionResult = await getSessionUser(event);
  if (!sessionResult?.user?.id) {
    setResponseStatus(event, 401);
    return { error: true, message: 'Unauthorized' } as const;
  }

  const userId = Number(sessionResult.user.id);
  await assertGratitudeDiaryAccess({
    userId,
    roleId: sessionResult.user.roleId,
  });

  const body = await readBody(event);
  const parsed = GratitudeDiaryDeletePhotoDto.safeParse(body);
  if (!parsed.success) {
    setResponseStatus(event, 400);
    return {
      error: true,
      message: 'Validation error',
      issues: parsed.error.issues,
    } as const;
  }

  const { storageKey } = parsed.data;

  // Проверяем, что storageKey принадлежит текущему пользователю.
  // Формат: user-uploads/gratitude-diary/{userId}/{timestamp}-{uuid}.webp
  const expectedPrefix = `user-uploads/gratitude-diary/${userId}/`;
  if (!storageKey.startsWith(expectedPrefix)) {
    setResponseStatus(event, 403);
    return { error: true, message: 'Forbidden' } as const;
  }

  await deleteFromStorage(storageKey);

  return { deleted: true };
});
