import { defineEventHandler, readBody, createError } from 'h3';
import { db } from '@/server/infrastructure/db/client';
import { users } from '@/server/infrastructure/db/schema';
import argon2 from 'argon2';
import { requireRole } from '@/server/utils/require-role';

export default defineEventHandler(async (event) => {
  await requireRole(event, 'admin');

  const validRoles = new Set(['admin', 'user', 'moderator', 'support']);
  const body = await readBody<{
    email?: string;
    name?: string;
    password?: string;
    roleId?: string;
    emailVerified?: boolean;
  }>(event);

  if (!body?.email) {
    throw createError({ statusCode: 400, statusMessage: 'email is required' });
  }

  if (!body?.password || body.password.length < 6) {
    throw createError({
      statusCode: 400,
      statusMessage: 'password is required and must be at least 6 characters',
    });
  }

  if (body?.roleId && !validRoles.has(body.roleId)) {
    throw createError({
      statusCode: 400,
      statusMessage: 'roleId is invalid',
    });
  }

  const values: any = {
    email: body.email.toLowerCase().trim(),
    name: body?.name?.trim() || null,
    roleId: body?.roleId || 'user',
    // Для review-аккаунтов админ может сразу пометить email подтверждённым.
    emailVerifiedAt: body?.emailVerified ? new Date() : null,
    passwordHash: await argon2.hash(body.password, {
      type: argon2.argon2id,
    }),
  };

  const inserted = await db.insert(users).values(values).returning();

  // Не возвращаем passwordHash в ответе
  const { passwordHash, ...item } = inserted[0];
  void passwordHash; // Явно игнорируем для линтера
  return { item };
});
