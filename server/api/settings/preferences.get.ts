import { eq } from 'drizzle-orm';
import { userPreferences } from '@/server/infrastructure/db/schema';
import { db } from '@/server/infrastructure/db/client';
import type { UserPreferencesDto } from '@/shared/dto/notifications';
import { getSessionUser } from '@/server/application/auth/session';
import {
  DEFAULT_ASSISTANT_TONE,
  isAssistantToneWithUnknown,
} from '@/shared/constants/assistantTone';
import { resolveOnboardingReasons } from '@/shared/dto/onboarding';

/**
 * GET /api/settings/preferences
 * Получить глобальные настройки пользователя (addressing, tone)
 */
export default defineEventHandler(
  async (event): Promise<UserPreferencesDto> => {
    const sessionResult = await getSessionUser(event);
    if (!sessionResult?.user?.id) {
      throw createError({
        statusCode: 401,
        message: 'Unauthorized',
      });
    }
    const userId = sessionResult.user.id;

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
        tone: DEFAULT_ASSISTANT_TONE,
        meditationTimerMinutes: null,
        onboardingReasons: [],
      };
    }

    const tone = isAssistantToneWithUnknown(prefs.tone)
      ? prefs.tone
      : DEFAULT_ASSISTANT_TONE;

    return {
      addressing: prefs.addressing as 'informal' | 'formal',
      tone,
      meditationTimerMinutes: prefs.meditationTimerMinutes ?? null,
      onboardingReasons: resolveOnboardingReasons({
        reasons: prefs.onboardingReasons,
        reason: prefs.onboardingReason,
      }),
    };
  }
);
