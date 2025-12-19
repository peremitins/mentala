/**
 * Функции для работы с ролями пользователей
 */

import { db } from '@/server/infrastructure/db/client';
import { users } from '@/server/infrastructure/db/schema';
import { eq } from 'drizzle-orm';

export type UserRole = 'admin' | 'user' | 'moderator' | 'support';

/**
 * Получить роль пользователя
 */
export async function getUserRole(userId: number): Promise<UserRole> {
  const user = await db
    .select({ roleId: users.roleId })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  if (!user.length) {
    throw new Error(`User ${userId} not found`);
  }

  return (user[0].roleId || 'user') as UserRole;
}

/**
 * Проверить, имеет ли пользователь указанную роль
 */
export async function hasRole(
  userId: number,
  role: UserRole
): Promise<boolean> {
  const userRole = await getUserRole(userId);
  return userRole === role;
}

/**
 * Проверить, является ли пользователь администратором
 */
export async function isAdmin(userId: number): Promise<boolean> {
  return hasRole(userId, 'admin');
}

/**
 * Проверить, может ли пользователь просматривать данные другого пользователя
 */
export async function canViewUser(
  viewerId: number,
  targetUserId: number
): Promise<boolean> {
  const viewerRole = await getUserRole(viewerId);

  // Админ, модератор и support могут просматривать любых пользователей
  if (['admin', 'moderator', 'support'].includes(viewerRole)) {
    return true;
  }

  // Обычный пользователь может просматривать только себя
  return viewerId === targetUserId;
}

/**
 * Проверить, может ли пользователь изменять данные другого пользователя
 */
export async function canEditUser(
  editorId: number,
  targetUserId: number
): Promise<boolean> {
  const editorRole = await getUserRole(editorId);

  // Только админ может изменять других пользователей
  if (editorRole === 'admin') {
    return true;
  }

  // Обычный пользователь может изменять только себя
  return editorId === targetUserId;
}

/**
 * Проверить, заблокирован ли пользователь
 */
export async function isUserBlocked(userId: number): Promise<boolean> {
  const user = await db
    .select({ isBlocked: users.isBlocked })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  if (!user.length) {
    return true; // Если пользователь не найден, считаем заблокированным
  }

  return user[0].isBlocked || false;
}

