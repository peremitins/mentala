import { defineEventHandler, getRouterParam, readBody, createError } from 'h3';
import { requireRole } from '@/server/utils/require-role';
import { db } from '@/server/infrastructure/db/client';
import { users } from '@/server/infrastructure/db/schema';
import { eq } from 'drizzle-orm';

export default defineEventHandler(async (event) => {
  await requireRole(event, ['admin', 'moderator']);

  const id = Number(getRouterParam(event, 'id'));
  if (!Number.isFinite(id)) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid id' });
  }

  const body = await readBody<{ isBlocked: boolean }>(event);
  if (typeof body?.isBlocked !== 'boolean') {
    throw createError({
      statusCode: 400,
      statusMessage: 'isBlocked is required',
    });
  }

  const updated = await db
    .update(users)
    .set({ isBlocked: body.isBlocked })
    .where(eq(users.id, id))
    .returning();

  if (!updated.length) {
    throw createError({ statusCode: 404, statusMessage: 'Not found' });
  }

  const { passwordHash, ...safeUser } = updated[0];
  void passwordHash; // Явно игнорируем для линтера

  return {
    item: {
      id: safeUser.id,
      email: safeUser.email,
      name: safeUser.name,
      isBlocked: safeUser.isBlocked,
      roleId: safeUser.roleId,
      createdAt: safeUser.createdAt,
      updatedAt: safeUser.updatedAt,
    },
  };
});

