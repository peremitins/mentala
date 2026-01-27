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
  const [target] = await db
    .select()
    .from(userPrompts)
    .where(
      and(eq(userPrompts.id, id), eq(userPrompts.userId, Number(sessionResult.user.id)))
    )
    .limit(1);
  if (!target) {
    setResponseStatus(event, 404);
    return { error: true, message: 'Not found' } as const;
  }
  const now = new Date();
  // деактивируем остальные этого типа
  await db
    .update(userPrompts)
    .set({ isActive: false, updatedAt: now })
    .where(
      and(
        eq(userPrompts.userId, Number(sessionResult.user.id)),
        eq(userPrompts.type, target.type)
      )
    );
  const [row] = await db
    .update(userPrompts)
    .set({ isActive: true, updatedAt: now })
    .where(
      and(eq(userPrompts.id, id), eq(userPrompts.userId, Number(sessionResult.user.id)))
    )
    .returning();
  return { item: row };
});
