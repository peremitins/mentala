import { getSessionUserWithRole } from '@/server/utils/require-role';

export default defineEventHandler(async (event) => {
  const user = await getSessionUserWithRole(event);

  // Если пользователь авторизован - возвращаем его данные
  if (user?.id) {
    const onboarding = (user as any)?.onboarding || {};
    return {
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
        emailVerifiedAt: user.emailVerifiedAt,
        hasPassword: !!user.passwordHash,
        sceneSettings: (user as any)?.sceneSettings || {},
      },
    };
  }

  // Если пользователь не авторизован - возвращаем null
  return { user: null };
});
