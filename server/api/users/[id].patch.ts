import { defineEventHandler, getRouterParam, readBody, createError, getHeader } from 'h3';
import { db } from '../../infrastructure/db/client';
import { users } from '../../infrastructure/db/schema';
import { eq } from 'drizzle-orm';
import argon2 from 'argon2';
import {
  getSessionUser,
  rotateSessionId,
  revokeAllUserSessions,
} from '@/server/application/auth/session';
import { requireAdmin } from '@/server/application/auth/admin';

export default defineEventHandler(async (event) => {
  const id = Number(getRouterParam(event, 'id'));
  if (!Number.isFinite(id))
    throw createError({ statusCode: 400, statusMessage: 'invalid id' });

  // Проверка авторизации
  const sessionResult = await getSessionUser(event);
  if (!sessionResult?.user?.id) {
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized' });
  }

  // Если пользователь редактирует не свой профиль - требуется админ
  if (sessionResult.user.id !== id) {
    await requireAdmin(event);
  }

  const body = await readBody<{
    email?: string;
    name?: string;
    password?: string;
  }>(event);
  const patch: any = {};
  if (body?.email) patch.email = body.email;
  if (body?.name !== undefined) patch.name = body.name;

  const isPasswordChange = body?.password && body.password.length >= 6;
  if (isPasswordChange && body.password) {
    patch.passwordHash = await argon2.hash(body.password, {
      type: argon2.argon2id,
    });
  }

  if (!Object.keys(patch).length)
    throw createError({ statusCode: 400, statusMessage: 'nothing to update' });

  const updated = await db
    .update(users)
    .set(patch)
    .where(eq(users.id, id))
    .returning();
  if (!updated.length)
    throw createError({ statusCode: 404, statusMessage: 'not found' });

  // Убираем passwordHash из ответа
  const { passwordHash, ...safeUser } = updated[0];

  // Ротация session ID при смене пароля (критичная операция)
  if (isPasswordChange) {
    const isSelf = sessionResult.user.id === id;

    if (isSelf) {
      // Пользователь меняет свой пароль - ротируем его сессию
      const newSid = await rotateSessionId(
        event,
        id,
        sessionResult.user.locale || undefined
      );

      // Для native платформ возвращаем новый sessionToken
      const platform = String(getHeader(event, 'x-platform') || '').toLowerCase();
      const isNative = platform === 'ios' || platform === 'android';

      return {
        item: safeUser,
        ...(isNative ? { sessionToken: newSid } : {}),
      };
    } else {
      // Админ меняет пароль другому пользователю - ревокаем все сессии целевого пользователя
      await revokeAllUserSessions(id);
    }
  }

  return { item: safeUser };
});
