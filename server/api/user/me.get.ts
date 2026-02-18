import { getSessionUserWithRole } from '@/server/utils/require-role';
import { UserMeDto } from '@/shared/dto/user';
import { toIsoString } from '@/server/utils/serialize';
import { getBillingSnapshot } from '@/server/application/subscriptions/entitlements.service';

export default defineEventHandler(async (event) => {
  const user = await getSessionUserWithRole(event);

  // Если пользователь авторизован - возвращаем его данные
  if (user?.id) {
    const onboarding = (user as any)?.onboarding || {};
    const billing = await getBillingSnapshot(user.id, (user as any)?.role);
    const response = {
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
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
        billing,
      },
    };
    return UserMeDto.parse(response);
  }

  // Если пользователь не авторизован - возвращаем null
  return UserMeDto.parse({ user: null });
});
