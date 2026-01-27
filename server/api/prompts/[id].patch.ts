import { readBody, setResponseStatus } from 'h3';
import { db } from '@@/server/infrastructure/db/client';
import { userPrompts } from '@@/server/infrastructure/db/schema';
import { PromptUpdateDto } from '@/shared/dto';
import { getSessionUser } from '@@/server/application/auth/session';
import { and, eq } from 'drizzle-orm';

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
  const body = await readBody(event);
  const parsed = PromptUpdateDto.safeParse(body);
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

  // Если меняем тип или активность → обработать деактивацию остальных
  if (data.isActive) {
    // Узнаём тип записи
    const [prev] = await db
      .select()
      .from(userPrompts)
      .where(
        and(eq(userPrompts.id, id), eq(userPrompts.userId, Number(sessionResult.user.id)))
      )
      .limit(1);
    const theType = data.type || prev?.type;
    if (!theType) {
      setResponseStatus(event, 400);
      return { error: true, message: 'Unknown type' } as const;
    }
    await db
      .update(userPrompts)
      .set({ isActive: false, updatedAt: now })
      .where(
        and(
          eq(userPrompts.userId, Number(sessionResult.user.id)),
          eq(userPrompts.type, theType)
        )
      );
  }

  const [row] = await db
    .update(userPrompts)
    .set({
      title: data.title as any,
      content: data.content as any,
      lang: data.lang as any,
      type: data.type as any,
      isActive: data.isActive as any,
      updatedAt: now,
    })
    .where(
      and(eq(userPrompts.id, id), eq(userPrompts.userId, Number(sessionResult.user.id)))
    )
    .returning();

  return { item: row };
});
