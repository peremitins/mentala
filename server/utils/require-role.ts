/**
 * Middleware для проверки ролей и прав доступа
 */

import { createError } from 'h3';
import { getSessionUser } from '@/server/application/auth/session';
import { getUserRole, canViewUser, canEditUser } from '@/server/application/auth/roles';
import type { UserRole } from '@/server/application/auth/roles';

/**
 * Middleware для проверки роли пользователя
 * Использование: requireRole(event, 'admin') или requireRole(event, ['admin', 'moderator'])
 */
export async function requireRole(
  event: any,
  requiredRole: UserRole | UserRole[]
): Promise<void> {
  const session = await getSessionUser(event);

  if (!session?.user?.id) {
    throw createError({
      statusCode: 401,
      statusMessage: 'Unauthorized',
    });
  }

  const role = await getUserRole(session.user.id);
  const roles = Array.isArray(requiredRole) ? requiredRole : [requiredRole];
  const hasRequiredRole = roles.includes(role);

  if (!hasRequiredRole) {
    throw createError({
      statusCode: 403,
      statusMessage: 'Forbidden: Insufficient permissions',
    });
  }
}

/**
 * Получить пользователя с ролью из сессии
 * Оптимизировано: использует roleId из сессии, если доступен, иначе делает запрос в БД
 */
export async function getSessionUserWithRole(event: any) {
  const session = await getSessionUser(event);
  if (!session?.user?.id) {
    return null;
  }

  // Если roleId уже есть в user (из БД), используем его
  if ((session.user as any).roleId) {
    return {
      ...session.user,
      role: (session.user as any).roleId || 'user',
    };
  }

  // Иначе делаем запрос в БД (fallback для старых сессий)
  const { getUserRole } = await import('@/server/application/auth/roles');
  const role = await getUserRole(session.user.id);

  return {
    ...session.user,
    role,
  };
}

/**
 * Проверить, что пользователь может получить доступ к данным другого пользователя
 * Правила:
 * - admin, moderator, support: могут просматривать любых пользователей
 * - user: может просматривать только себя
 */
export async function requireCanViewUser(
  event: any,
  targetUserId: number
): Promise<void> {
  const session = await getSessionUser(event);

  if (!session?.user?.id) {
    throw createError({
      statusCode: 401,
      statusMessage: 'Unauthorized',
    });
  }

  const canView = await canViewUser(session.user.id, targetUserId);

  if (!canView) {
    throw createError({
      statusCode: 403,
      statusMessage: 'Forbidden: Access denied',
    });
  }
}

/**
 * Проверить, что пользователь может изменять данные другого пользователя
 * Правила:
 * - admin: может изменять любых пользователей
 * - user: может изменять только себя
 * - moderator, support: не могут изменять других пользователей
 */
export async function requireCanEditUser(
  event: any,
  targetUserId: number
): Promise<void> {
  const session = await getSessionUser(event);

  if (!session?.user?.id) {
    throw createError({
      statusCode: 401,
      statusMessage: 'Unauthorized',
    });
  }

  const canEdit = await canEditUser(session.user.id, targetUserId);

  if (!canEdit) {
    throw createError({
      statusCode: 403,
      statusMessage: 'Forbidden: Only admin can edit other users',
    });
  }
}

