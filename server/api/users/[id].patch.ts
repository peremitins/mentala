import { defineEventHandler, getRouterParam, readBody, createError, getHeader } from 'h3';
import { db } from '../../infrastructure/db/client';
import { users } from '../../infrastructure/db/schema';
import { eq } from 'drizzle-orm';
import argon2 from 'argon2';
import {
  rotateSessionId,
  revokeAllUserSessions,
} from '@/server/application/auth/session';
import { getSessionUserWithRole, requireCanEditUser } from '@/server/utils/require-role';

export default defineEventHandler(async (event) => {
  const user = await getSessionUserWithRole(event);
  if (!user) {
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized' });
  }

  const id = Number(getRouterParam(event, 'id'));
  if (!Number.isFinite(id)) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid id' });
  }

  const body = await readBody<{
    email?: string;
    name?: string;
    password?: string;
    roleId?: string; // Только для админов
    isBlocked?: boolean; // Запрещено - использовать отдельный endpoint
  }>(event);

  // Запрещаем изменение isBlocked через этот endpoint
  if (body?.isBlocked !== undefined) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Use PATCH /api/moderator/users/[id]/block for blocking/unblocking users',
    });
  }

  // Проверка прав доступа (для изменения других пользователей)
  if (user.id !== id) {
    await requireCanEditUser(event, id);
  }

  const patch: any = {};

  // Обычный пользователь может изменять только свои базовые данные
  if (user.id === id) {
    if (body?.email) patch.email = body.email;
    if (body?.name !== undefined) patch.name = body.name;
    if (body?.password && body.password.length >= 6) {
      patch.passwordHash = await argon2.hash(body.password, {
        type: argon2.argon2id,
      });
    }
  } else {
    // Админ может изменять любые данные других пользователей
    if (user.role === 'admin') {
      if (body?.email) patch.email = body.email;
      if (body?.name !== undefined) patch.name = body.name;
      if (body?.password && body.password.length >= 6) {
        patch.passwordHash = await argon2.hash(body.password, {
          type: argon2.argon2id,
        });
      }
    }
  }

  // Только админ может изменить роль
  if (body?.roleId !== undefined) {
    if (user.role !== 'admin') {
      throw createError({
        statusCode: 403,
        statusMessage: 'Forbidden: Only admin can change user role',
      });
    }
    patch.roleId = body.roleId;
  }

  if (!Object.keys(patch).length) {
    throw createError({ statusCode: 400, statusMessage: 'Nothing to update' });
  }

  const updated = await db
    .update(users)
    .set(patch)
    .where(eq(users.id, id))
    .returning();

  if (!updated.length) {
    throw createError({ statusCode: 404, statusMessage: 'Not found' });
  }

  // Убираем passwordHash из ответа
  const { passwordHash, ...safeUser } = updated[0];

  // Ротация session ID при смене пароля (критичная операция)
  const isPasswordChange = body?.password && body.password.length >= 6;
  if (isPasswordChange) {
    const isSelf = user.id === id;

    if (isSelf) {
      // Пользователь меняет свой пароль - ротируем его сессию
      const newSid = await rotateSessionId(
        event,
        id,
        user.locale || undefined
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
