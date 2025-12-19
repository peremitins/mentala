import { defineEventHandler, getRouterParam, createError } from 'h3';
import { db } from '../../infrastructure/db/client';
import { users } from '../../infrastructure/db/schema';
import { eq, sql } from 'drizzle-orm';
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

  // Проверка прав доступа
  await requireCanEditUser(event, id);

  // Админ не может удалить сам себя (защита от случайного удаления)
  if (user.role === 'admin' && user.id === id) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Admin cannot delete own account',
    });
  }

  // Проверка: нельзя удалить последнего админа
  if (user.role === 'admin' && user.id !== id) {
    const targetUser = await db
      .select({ roleId: users.roleId })
      .from(users)
      .where(eq(users.id, id))
      .limit(1);

    if (targetUser[0]?.roleId === 'admin') {
      const adminCountResult = await db
        .select({ count: sql<number>`count(*)` })
        .from(users)
        .where(eq(users.roleId, 'admin'));

      const adminCount = Number(adminCountResult[0]?.count || 0);
      if (adminCount <= 1) {
        throw createError({
          statusCode: 400,
          statusMessage: 'Cannot delete last admin',
        });
      }
    }
  }

  const deleted = await db.delete(users).where(eq(users.id, id)).returning();

  if (!deleted.length) {
    throw createError({ statusCode: 404, statusMessage: 'Not found' });
  }

  return { ok: true };
});
