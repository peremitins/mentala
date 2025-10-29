import { getSessionUser } from '@/server/application/auth/session';
import { readPrivacy } from '@/server/utils/storage';

export default defineEventHandler(async (event) => {
  const user = await getSessionUser(event);

  // Если пользователь авторизован - возвращаем его данные
  if (user?.id) {
    const privacy = readPrivacy(String(user.id));
    return {
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        locale: user.locale,
        saveHistory: privacy.saveHistory,
        retentionDays: privacy.retentionDays,
      },
    };
  }

  // Если пользователь не авторизован - возвращаем null
  return { user: null };
});
