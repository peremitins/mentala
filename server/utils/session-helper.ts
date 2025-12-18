import { getSessionUser } from '@/server/application/auth/session';

/**
 * Хелпер для получения пользователя из сессии
 * Обновляет старый паттерн getSessionUser(event) на новый { user, channel }
 */
export async function getUserFromSession(event: any) {
  const sessionResult = await getSessionUser(event);
  return sessionResult?.user || null;
}

