import { eq, and } from 'drizzle-orm';
import { breathPracticesCustom } from '@/server/infrastructure/db/schema';
import { db } from '@/server/infrastructure/db/client';
import { getSessionUser } from '@/server/application/auth/session';

/**
 * DELETE /api/breath-practices/custom/:id
 * Удалить кастомную дыхательную практику
 */
export default defineEventHandler(
  async (event): Promise<{ success: boolean }> => {
    const sessionResult = await getSessionUser(event);
    if (!sessionResult?.user?.id) {
      throw createError({
        statusCode: 401,
        message: 'Unauthorized',
      });
    }
    const userId = sessionResult.user.id;

    const id = getRouterParam(event, 'id');
    if (!id) {
      throw createError({
        statusCode: 400,
        message: 'ID практики обязателен',
      });
    }

    // Проверяем, существует ли практика и принадлежит ли она пользователю
    const [existing] = await db
      .select()
      .from(breathPracticesCustom)
      .where(
        and(
          eq(breathPracticesCustom.id, id),
          eq(breathPracticesCustom.userId, userId)
        )
      )
      .limit(1);

    if (!existing) {
      throw createError({
        statusCode: 404,
        message: 'Практика не найдена',
      });
    }

    await db
      .delete(breathPracticesCustom)
      .where(
        and(
          eq(breathPracticesCustom.id, id),
          eq(breathPracticesCustom.userId, userId)
        )
      );

    return { success: true };
  }
);
