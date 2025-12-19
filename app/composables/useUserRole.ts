import { computed } from 'vue';
import { useAuthStore } from '@/app/stores/auth';

export function useUserRole() {
  const authStore = useAuthStore();

  const isAdmin = computed(() => {
    return authStore.user?.role === 'admin';
  });

  const isModerator = computed(() => {
    return authStore.user?.role === 'moderator';
  });

  const isSupport = computed(() => {
    return authStore.user?.role === 'support';
  });

  const isUser = computed(() => {
    return authStore.user?.role === 'user' || !authStore.user?.role;
  });

  const hasRole = (role: string | string[]) => {
    const roles = Array.isArray(role) ? role : [role];
    return roles.includes(authStore.user?.role || 'user');
  };

  const canViewAllUsers = computed(() => {
    return ['admin', 'moderator'].includes(authStore.user?.role || '');
  });

  const canManageUsers = computed(() => {
    return authStore.user?.role === 'admin';
  });

  const canBlockUsers = computed(() => {
    return ['admin', 'moderator'].includes(authStore.user?.role || '');
  });

  const isBlocked = computed(() => {
    return authStore.user?.isBlocked === true;
  });

  return {
    isAdmin,
    isModerator,
    isSupport,
    isUser,
    hasRole,
    canViewAllUsers,
    canManageUsers,
    canBlockUsers,
    isBlocked,
  };
}

