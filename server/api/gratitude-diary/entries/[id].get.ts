import { defineEventHandler, getRouterParam, setResponseStatus } from 'h3';
import { and, eq } from 'drizzle-orm';
import { db } from '@@/server/infrastructure/db/client';
import { gratitudeDiaryEntries } from '@@/server/infrastructure/db/schema';
import { getSessionUser } from '@@/server/application/auth/session';
import { assertGratitudeDiaryAccess } from '@/server/application/gratitude-diary/access';

export default defineEventHandler(async (event) => {
  const sessionResult = await getSessionUser(event);
  if (!sessionResult?.user?.id) {
    setResponseStatus(event, 401);
    return { error: true, message: 'Unauthorized' } as const;
  }

  await assertGratitudeDiaryAccess({
    userId: Number(sessionResult.user.id),
    roleId: sessionResult.user.roleId,
  });

  const idRaw = getRouterParam(event, 'id') || '';
  const entryId = Number(idRaw);
  if (!Number.isInteger(entryId) || entryId <= 0) {
    setResponseStatus(event, 400);
    return { error: true, message: 'Invalid entry id' } as const;
  }

  const rows = await db
    .select()
    .from(gratitudeDiaryEntries)
    .where(
      and(
        eq(gratitudeDiaryEntries.id, entryId),
        eq(gratitudeDiaryEntries.userId, Number(sessionResult.user.id))
      )
    )
    .limit(1);

  const item = rows[0];
  if (!item) {
    setResponseStatus(event, 404);
    return { error: true, message: 'Entry not found' } as const;
  }

  return { item };
});
