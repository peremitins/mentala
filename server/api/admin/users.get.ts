import { defineEventHandler, getQuery } from 'h3';
import { requireRole } from '@/server/utils/require-role';
import { db } from '@/server/infrastructure/db/client';
import { users } from '@/server/infrastructure/db/schema';
import { eq, or, like, desc, and, sql } from 'drizzle-orm';

export default defineEventHandler(async (event) => {
  await requireRole(event, ['admin', 'moderator']);

  const query = getQuery(event);
  const page = Number(query.page) || 1;
  const limit = Math.min(Number(query.limit) || 50, 100);
  const offset = (page - 1) * limit;
  const search = query.search as string | undefined;
  const roleId = query.roleId as string | undefined;

  const whereConditions: any[] = [];

  if (search) {
    whereConditions.push(
      or(like(users.email, `%${search}%`), like(users.name, `%${search}%`))!
    );
  }

  if (roleId) {
    whereConditions.push(eq(users.roleId, roleId));
  }

  const whereClause =
    whereConditions.length > 0 ? and(...whereConditions) : undefined;

  const [usersList, totalResult] = await Promise.all([
    db
      .select({
        id: users.id,
        email: users.email,
        name: users.name,
        roleId: users.roleId,
        isBlocked: users.isBlocked,
        createdAt: users.createdAt,
        lastLoginAt: users.lastLoginAt,
      })
      .from(users)
      .where(whereClause)
      .orderBy(desc(users.createdAt))
      .limit(limit)
      .offset(offset),
    db
      .select({ count: sql<number>`count(*)` })
      .from(users)
      .where(whereClause),
  ]);

  const total = Number(totalResult[0]?.count || 0);

  return {
    users: usersList,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  };
});

