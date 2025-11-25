import { eq } from 'drizzle-orm';
import { userPreferences } from '@/server/infrastructure/db/schema';
import { db } from '@/server/infrastructure/db/client';
import type { UserPreferencesDto } from '@/shared/dto/notifications';
import { getSessionUser } from '@/server/application/auth/session';

/**
 * GET /api/settings/preferences
 * Получить глобальные настройки пользователя (addressing, tone)
 */
export default defineEventHandler(
  async (event): Promise<UserPreferencesDto> => {
    const user = await getSessionUser(event);
    if (!user?.id) {
      throw createError({
        statusCode: 401,
        message: 'Unauthorized',
      });
    }
    const userId = user.id;

    // Получаем настройки пользователя
    const [prefs] = await db
      .select()
      .from(userPreferences)
      .where(eq(userPreferences.userId, userId))
      .limit(1);

    // Если настроек нет — возвращаем дефолтные значения
    if (!prefs) {
      return {
        addressing: 'informal',
        tone: 'neutral',
      };
    }

    return {
      addressing: prefs.addressing as 'informal' | 'formal',
      tone: prefs.tone as
        | 'delicate'
        | 'neutral'
        | 'uplifting'
        | 'resolute'
        | 'demanding',
    };
  }
);
