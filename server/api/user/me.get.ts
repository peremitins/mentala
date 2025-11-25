import { getSessionUser } from '@/server/application/auth/session';

export default defineEventHandler(async (event) => {
  const user = await getSessionUser(event);

  // Если пользователь авторизован - возвращаем его данные
  if (user?.id) {
    return {
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        locale: user.locale,
      },
    };
  }

  // Если пользователь не авторизован - возвращаем null
  return { user: null };
});
