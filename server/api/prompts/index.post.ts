import { defineEventHandler, readBody, setResponseStatus } from 'h3';
import { db } from '@@/server/infrastructure/db/client';
import { userPrompts } from '@@/server/infrastructure/db/schema';
import { PromptCreateDto } from '@/shared/dto';
import { getSessionUser } from '@@/server/application/auth/session';
import { and, eq } from 'drizzle-orm';

export default defineEventHandler(async (event) => {
  const sessionResult = await getSessionUser(event);
  if (!sessionResult?.user?.id) {
    setResponseStatus(event, 401);
    return { error: true, message: 'Unauthorized' } as const;
  }
  const body = await readBody(event);
  const parsed = PromptCreateDto.safeParse(body);
  if (!parsed.success) {
    setResponseStatus(event, 400);
    return {
      error: true,
      message: 'Validation error',
      issues: parsed.error.issues,
    } as const;
  }
  const data = parsed.data;
  const now = new Date();

  // Если создаём активный — деактивируем остальные этого типа
  if (data.isActive) {
    await db
      .update(userPrompts)
      .set({ isActive: false, updatedAt: now })
      .where(
        and(
          eq(userPrompts.userId, Number(sessionResult.user.id)),
          eq(userPrompts.type, data.type)
        )
      );
  }
  const [row] = await db
    .insert(userPrompts)
    .values({
      userId: Number(sessionResult.user.id),
      type: data.type,
      title: data.title,
      content: data.content,
      lang: data.lang || 'ru',
      isActive: Boolean(data.isActive),
      createdAt: now,
      updatedAt: now,
    })
    .returning();
  return { item: row };
});
