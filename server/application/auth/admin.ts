import { createError } from 'h3';
import { getSessionUser } from './session';
import { getUserRole } from './roles';

/**
 * Получить список email админов из env переменной ADMIN_EMAILS (для обратной совместимости)
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
 * Проверяет роль пользователя из БД (roleId === 'admin')
 * Если система ролей еще не настроена, использует ADMIN_EMAILS как fallback
 *
 * @throws {401} Если пользователь не авторизован
 * @throws {403} Если пользователь не является админом
 * @returns User объект админа
 */
export async function requireAdmin(event: any) {
  const session = await getSessionUser(event);
  if (!session?.user?.id) {
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized' });
  }

  try {
    // Пытаемся использовать систему ролей
    const role = await getUserRole(session.user.id);
    if (role === 'admin') {
      return session.user;
    }
  } catch (error) {
    // Если система ролей еще не настроена, используем fallback на ADMIN_EMAILS
    const admins = getAdminEmails();
    if (admins.size > 0) {
      const email = String(session.user.email || '').toLowerCase();
      if (admins.has(email)) {
        return session.user;
      }
    }
  }

  throw createError({ statusCode: 403, statusMessage: 'Forbidden' });
}
