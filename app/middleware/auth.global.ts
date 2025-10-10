import { useAuthStore } from '@/app/stores/auth';

export default defineNuxtRouteMiddleware(async (to) => {
  const publicRoutes = ['/auth', '/error'];
  if (publicRoutes.includes(to.path)) return;
  const auth = useAuthStore();
  // if (!auth.user) await auth.me();
  // if (!auth.user) return navigateTo('/auth');
});
