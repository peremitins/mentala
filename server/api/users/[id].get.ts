import { defineEventHandler, getRouterParam, createError } from 'h3';
import { db } from '../../infrastructure/db/client';
import { users } from '../../infrastructure/db/schema';
import { eq } from 'drizzle-orm';
import { getSessionUserWithRole, requireCanViewUser } from '@/server/utils/require-role';

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
  await requireCanViewUser(event, id);

  const rows = await db
    .select({
      id: users.id,
      email: users.email,
      name: users.name,
      locale: users.locale,
      roleId: users.roleId,
      isBlocked: users.isBlocked,
      createdAt: users.createdAt,
      updatedAt: users.updatedAt,
    })
    .from(users)
    .where(eq(users.id, id))
    .limit(1);

  if (!rows.length) {
    throw createError({ statusCode: 404, statusMessage: 'Not found' });
  }

  return { item: rows[0] };
});
