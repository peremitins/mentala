import { eq } from 'drizzle-orm';
import { breathPracticesCustom } from '@/server/infrastructure/db/schema';
import { db } from '@/server/infrastructure/db/client';
import { getSessionUser } from '@/server/application/auth/session';
import type { BreathCustomPractice } from '@/app/lib/breathPracticesCatalog';

/**
 * GET /api/breath-practices/custom
 * Получить список кастомных дыхательных практик пользователя
 */
export default defineEventHandler(async (event): Promise<BreathCustomPractice[]> => {
  const sessionResult = await getSessionUser(event);
  if (!sessionResult?.user?.id) {
    throw createError({
      statusCode: 401,
      message: 'Unauthorized',
    });
  }
  const userId = sessionResult.user.id;

  const practices = await db
    .select()
    .from(breathPracticesCustom)
    .where(eq(breathPracticesCustom.userId, userId))
    .orderBy(breathPracticesCustom.createdAt);

  return practices.map((practice) => ({
    id: practice.id,
    name: practice.name,
    phases: practice.phases as BreathCustomPractice['phases'],
    createdAt: practice.createdAt.toISOString(),
    updatedAt: practice.updatedAt.toISOString(),
  }));
});
