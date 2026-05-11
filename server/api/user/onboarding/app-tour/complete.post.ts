import { defineEventHandler, createError } from 'h3';
import { eq } from 'drizzle-orm';
import { db } from '@/server/infrastructure/db/client';
import { users } from '@/server/infrastructure/db/schema';
import { getSessionUser } from '@/server/application/auth/session';

/**
 * POST /api/user/onboarding/app-tour/complete
 *
 * Помечает продуктовый тур (App Tour) как пройденный.
 * Безусловно ставит users.onboarding.appTour = true (через JSONB merge),
 * сохраняя остальные поля онбординга (welcome, selectedTopics и т.д.).
 *
 * Тело запроса не требуется.
 */
export default defineEventHandler(async (event) => {
  // ВАЖНО: getSessionUser возвращает { user, session }, а не самого user.
  // Если обращаться к .id на обёртке — всегда undefined → 401.
  const sessionResult = await getSessionUser(event);
  if (!sessionResult?.user?.id) {
    throw createError({
      statusCode: 401,
      statusMessage: 'Unauthorized',
      data: { code: 'E_AUTH', message: 'Требуется авторизация' },
    });
  }

  const userId = sessionResult.user.id;

  await db.transaction(async (tx) => {
    const [current] = await tx
      .select({ onboarding: users.onboarding })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    const onboarding =
      current?.onboarding && typeof current.onboarding === 'object'
        ? { ...(current.onboarding as Record<string, unknown>) }
        : {};

    onboarding.appTour = true;

    await tx
      .update(users)
      .set({
        onboarding,
        updatedAt: new Date(),
      })
      .where(eq(users.id, userId));
  });

  return { ok: true };
});
