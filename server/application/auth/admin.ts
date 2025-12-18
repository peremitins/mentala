import { createError } from 'h3';
import { getSessionUser } from './session';

/**
 * Получить список email админов из env переменной ADMIN_EMAILS
 * Формат: ADMIN_EMAILS=user1@example.com,user2@example.com
 */
function getAdminEmails(): Set<string> {
  return new Set(
    String(process.env.ADMIN_EMAILS || '')
      .split(',')
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean)
  );
}

/**
 * Требует, чтобы текущий пользователь был админом
 * Проверяет email пользователя против ADMIN_EMAILS env переменной
 *
 * TODO: Когда будет реализована система ролей, заменить на проверку role === 'admin'
 *
 * @throws {401} Если пользователь не авторизован
 * @throws {403} Если пользователь не является админом
 * @throws {500} Если ADMIN_EMAILS не настроен
 * @returns User объект админа
 */
export async function requireAdmin(event: any) {
  const session = await getSessionUser(event);
  if (!session?.user?.id) {
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized' });
  }

  const admins = getAdminEmails();
  if (!admins.size) {
    throw createError({
      statusCode: 500,
      statusMessage: 'ADMIN_EMAILS is not set',
    });
  }

  const email = String(session.user.email || '').toLowerCase();
  if (!admins.has(email)) {
    throw createError({ statusCode: 403, statusMessage: 'Forbidden' });
  }

  return session.user;
}
