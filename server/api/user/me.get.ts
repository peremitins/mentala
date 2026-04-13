import { eq } from 'drizzle-orm';
import { getUserAssistantSettingsProjection } from '@/server/application/chat/assistant-persona.service';
import { getBillingSnapshot } from '@/server/application/subscriptions/entitlements.service';
import { db } from '@/server/infrastructure/db/client';
import { userPreferences } from '@/server/infrastructure/db/schema';
import { getSessionUserWithRole } from '@/server/utils/require-role';
import { toIsoString } from '@/server/utils/serialize';
import { UserMeDto } from '@/shared/dto/user';
import { resolveAddressing } from '@/shared/utils/addressing';

export default defineEventHandler(async (event) => {
  const user = await getSessionUserWithRole(event);

  // Если пользователь авторизован - возвращаем его данные
  if (user?.id) {
    const onboarding = (user as any)?.onboarding || {};
    const [billing, prefs, assistantSettings] = await Promise.all([
      getBillingSnapshot(user.id, (user as any)?.role),
      db
        .select({ addressing: userPreferences.addressing })
        .from(userPreferences)
        .where(eq(userPreferences.userId, user.id))
        .limit(1),
      getUserAssistantSettingsProjection(user.id, user.locale),
    ]);

    const response = {
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        // Возвращаем addressing в профиле, чтобы фронт не делал отдельный запрос.
        addressing: resolveAddressing(prefs[0]?.addressing),
        gender: (user as any)?.gender || null,
        ageRange: (user as any)?.ageRange || null,
        onboarding: {
          welcome: Boolean(onboarding?.welcome),
        },
        locale: user.locale,
        role: user.role,
        isBlocked: user.isBlocked,
        emailVerifiedAt: toIsoString(user.emailVerifiedAt),
        hasPassword: !!user.passwordHash,
        sceneSettings: (user as any)?.sceneSettings || {},
        marketingConsent: Boolean((user as any)?.marketingConsentAt),
        aiConsentAccepted: Boolean((user as any)?.aiConsentAccepted),
        aiConsentAcceptedAt: toIsoString((user as any)?.aiConsentAcceptedAt),
        aiConsentVersion: (user as any)?.aiConsentVersion || null,
        aiConsentLocale: (user as any)?.aiConsentLocale || null,
        pushNotificationsEnabled: Boolean(
          (user as any)?.pushNotificationsEnabled ?? true
        ),
        assistantSettings,
        billing,
      },
    };
    return UserMeDto.parse(response);
  }

  // Если пользователь не авторизован - возвращаем null
  return UserMeDto.parse({ user: null });
});
