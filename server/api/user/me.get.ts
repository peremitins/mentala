import { getSessionUserWithRole } from '@/server/utils/require-role';

export default defineEventHandler(async (event) => {
  const user = await getSessionUserWithRole(event);

  // Если пользователь авторизован - возвращаем его данные
  if (user?.id) {
    return {
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        locale: user.locale,
        role: user.role,
        isBlocked: user.isBlocked,
        emailVerifiedAt: user.emailVerifiedAt,
        hasPassword: !!user.passwordHash,
      },
    };
  }

  // Если пользователь не авторизован - возвращаем null
  return { user: null };
});
