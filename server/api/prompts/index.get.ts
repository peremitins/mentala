import { defineEventHandler, getQuery, setResponseStatus } from 'h3';
import { and, desc, eq } from 'drizzle-orm';
import { db } from '@@/server/infrastructure/db/client';
import { userPrompts } from '@@/server/infrastructure/db/schema';
import { PromptQueryDto } from '@/shared/dto';
import { getSessionUser } from '@@/server/application/auth/session';

export default defineEventHandler(async (event) => {
  const sessUser = await getSessionUser(event);
  if (!sessUser?.id) {
    setResponseStatus(event, 401);
    return { error: true, message: 'Unauthorized' } as const;
  }
  const q = getQuery(event);
  const parsed = PromptQueryDto.safeParse(q);
  const where =
    parsed.success && parsed.data.type
      ? and(
          eq(userPrompts.userId, Number(sessUser.id)),
          eq(userPrompts.type, parsed.data.type)
        )
      : eq(userPrompts.userId, Number(sessUser.id));
  const rows = await db
    .select()
    .from(userPrompts)
    .where(where)
    .orderBy(desc(userPrompts.updatedAt));
  return { items: rows };
});
