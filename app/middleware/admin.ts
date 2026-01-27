import { useAuthStore } from '@/app/stores/auth';

/**
 * Middleware для админских страниц
 * Для страницы /users разрешает admin и moderator (read-only для moderator)
 * Для остальных админских страниц требуется только admin
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

  const userRole = auth.user.role || 'user';

  // Для страницы списка пользователей разрешаем admin и moderator
  if (to.path === '/users') {
    if (!['admin', 'moderator'].includes(userRole)) {
      return navigateTo('/');
    }
    return;
  }

  // Для страниц редактирования/создания пользователей - только admin
  if (to.path.startsWith('/users/')) {
    if (userRole !== 'admin') {
      return navigateTo('/users'); // Модератор может только смотреть список
    }
    return;
  }

  // Для остальных админских страниц требуется только admin
  if (userRole !== 'admin') {
    return navigateTo('/');
  }
});
