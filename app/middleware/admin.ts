import { useAuthStore } from '@/app/stores/auth';
import { createError } from 'h3';

/**
 * Middleware для админских страниц
 * TODO: Заменить на проверку role === 'admin' когда будет реализована система ролей
 *
 * Сейчас: проверяет через серверный API endpoint /api/admin/me
 * В будущем: будет проверять auth.user.role === 'admin'
 */
export default defineNuxtRouteMiddleware(async (to) => {
  // Проверяем авторизацию
  const auth = useAuthStore();
  if (!auth.user) {
    try {
      await auth.me();
    } catch {
      // Игнорируем ошибки
    }
  }

  if (!auth.user) {
    return navigateTo('/auth');
  }

  // Проверяем, является ли пользователь админом через серверный API
  // Это безопаснее, чем читать process.env на клиенте
  // TODO: Когда будет реализована система ролей, заменить на:
  // if (auth.user.role !== 'admin') {
  //   throw createError({ statusCode: 403, statusMessage: 'Forbidden' });
  // }
  try {
    const { $api } = useNuxtApp();
    const result = await $api<{ isAdmin: boolean }>('/api/admin/me', {
      method: 'GET',
    });

    if (!result?.isAdmin) {
      throw createError({ statusCode: 403, statusMessage: 'Forbidden' });
    }
  } catch (error: any) {
    if (error?.statusCode === 403 || error?.statusCode === 401) {
      throw createError({ statusCode: 403, statusMessage: 'Forbidden' });
    }
    throw error;
  }
});
