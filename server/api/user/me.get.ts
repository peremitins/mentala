import { getSessionUser } from '@/server/application/auth/session';

export default defineEventHandler(async (event) => {
  const sessionResult = await getSessionUser(event);

  // Если пользователь авторизован - возвращаем его данные
  if (sessionResult?.user?.id) {
    return {
      user: {
        id: sessionResult.user.id,
        email: sessionResult.user.email,
        name: sessionResult.user.name,
        locale: sessionResult.user.locale,
      },
    };
  }

  // Если пользователь не авторизован - возвращаем null
  return { user: null };
});
