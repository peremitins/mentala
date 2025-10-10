import { getSessionUser } from '@/server/application/auth/session';

export default defineEventHandler(async (event) => {
  const user = await getSessionUser(event);
  return {
    user: user
      ? { id: user.id, email: user.email, name: user.name, locale: user.locale }
      : null,
  };
});
