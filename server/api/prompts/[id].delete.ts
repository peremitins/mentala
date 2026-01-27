import { setResponseStatus } from 'h3';
import { db } from '@@/server/infrastructure/db/client';
import { userPrompts } from '@@/server/infrastructure/db/schema';
import { and, eq } from 'drizzle-orm';
import { getSessionUser } from '@@/server/application/auth/session';

export default defineEventHandler(async (event) => {
  const sessionResult = await getSessionUser(event);
  if (!sessionResult?.user?.id) {
    setResponseStatus(event, 401);
    return { error: true, message: 'Unauthorized' } as const;
  }
  const id = Number(event.context.params?.id);
  if (!id) {
    setResponseStatus(event, 400);
    return { error: true, message: 'Invalid id' } as const;
  }
  const [row] = await db
    .delete(userPrompts)
    .where(
      and(
        eq(userPrompts.id, id),
        eq(userPrompts.userId, Number(sessionResult.user.id))
      )
    )
    .returning();
  return { item: row };
});
