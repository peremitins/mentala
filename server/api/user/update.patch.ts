import { defineEventHandler } from 'h3';
import { getSessionUser } from '@@/server/application/auth/session';

export default defineEventHandler(async (event) => {
  const user = await getSessionUser(event);
  if (!user?.id) {
    return { error: true, message: 'Unauthorized' } as const;
  }
  // Этот endpoint можно использовать для обновления других полей пользователя
  // Сейчас не используется, но оставляем для будущего расширения
  return { ok: true };
});
