import { createError } from 'h3';
import argon2 from 'argon2';
import { eq } from 'drizzle-orm';
import { db } from '@/server/infrastructure/db/client';
import { users } from '@/server/infrastructure/db/schema';
import { getSessionUser } from '@/server/application/auth/session';
import { PasswordSetDto } from '@/shared/dto/auth';

export default defineEventHandler(async (event) => {
  const session = await getSessionUser(event);
  if (!session?.user?.id) {
    throw createError({ statusCode: 401, statusMessage: 'Не авторизован' });
  }

  const body = PasswordSetDto.parse(await readBody(event as any));
  if (body.password !== body.confirmPassword) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Пароли не совпадают',
    });
  }

  const existing = await db
    .select()
    .from(users)
    .where(eq(users.id, session.user.id))
    .limit(1);
  if (!existing.length) {
    throw createError({ statusCode: 404, statusMessage: 'Пользователь не найден' });
  }

  if (existing[0].passwordHash) {
    throw createError({
      statusCode: 409,
      statusMessage: 'Пароль уже установлен',
    });
  }

  const hash = await argon2.hash(body.password, { type: argon2.argon2id });
  await db
    .update(users)
    .set({ passwordHash: hash, updatedAt: new Date() })
    .where(eq(users.id, session.user.id));

  return { success: true };
});
