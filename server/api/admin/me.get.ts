import { defineEventHandler } from 'h3';
import { requireAdmin } from '@/server/application/auth/admin';

/**
 * Проверяет, является ли текущий пользователь админом
 * Используется клиентским middleware для проверки прав доступа
 */
export default defineEventHandler(async (event) => {
  try {
    await requireAdmin(event);
    return { isAdmin: true };
  } catch (error: any) {
    if (error?.statusCode === 401 || error?.statusCode === 403) {
      return { isAdmin: false };
    }
    throw error;
  }
});

