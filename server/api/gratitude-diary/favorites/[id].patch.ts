import {
  defineEventHandler,
  getRouterParam,
  readBody,
  setResponseStatus,
} from 'h3';
import { and, eq, sql } from 'drizzle-orm';
import { db } from '@@/server/infrastructure/db/client';
import { gratitudeDiaryFavoritePrompts } from '@@/server/infrastructure/db/schema';
import { getSessionUser } from '@@/server/application/auth/session';
import { assertGratitudeDiaryAccess } from '@/server/application/gratitude-diary/access';
import { GratitudeDiaryFavoriteUpdateDto } from '@/shared/dto';

export default defineEventHandler(async (event) => {
  const sessionResult = await getSessionUser(event);
  if (!sessionResult?.user?.id) {
    setResponseStatus(event, 401);
    return { error: true, message: 'Unauthorized' } as const;
  }

  const idRaw = getRouterParam(event, 'id') || '';
  const favoriteId = Number(idRaw);
  if (!Number.isInteger(favoriteId) || favoriteId <= 0) {
    setResponseStatus(event, 400);
    return { error: true, message: 'Invalid favorite id' } as const;
  }

  const body = await readBody(event);
  const parsed = GratitudeDiaryFavoriteUpdateDto.safeParse(body);
  if (!parsed.success) {
    setResponseStatus(event, 400);
    return {
      error: true,
      message: 'Validation error',
      issues: parsed.error.issues,
    } as const;
  }

  const userId = Number(sessionResult.user.id);
  await assertGratitudeDiaryAccess({
    userId,
    roleId: sessionResult.user.roleId,
  });

  // WHERE id = :id AND user_id = :userId AND prompt_type = 'custom'
  // Явная проверка prompt_type = 'custom' в SQL защищает от редактирования
  // каталожных промптов через баг или ручной запрос.
  const [item] = await db
    .update(gratitudeDiaryFavoritePrompts)
    .set({
      customText: parsed.data.customText,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(gratitudeDiaryFavoritePrompts.id, favoriteId),
        eq(gratitudeDiaryFavoritePrompts.userId, userId),
        sql`${gratitudeDiaryFavoritePrompts.promptType} = 'custom'`
      )
    )
    .returning();

  if (!item) {
    setResponseStatus(event, 404);
    return {
      error: true,
      message: 'Favorite not found or not editable',
    } as const;
  }

  return {
    item: {
      id: item.id,
      promptType: item.promptType as 'catalog' | 'custom',
      catalogPromptId: item.catalogPromptId,
      customText: item.customText,
      sortOrder: item.sortOrder,
      createdAt: item.createdAt.toISOString(),
    },
  };
});
