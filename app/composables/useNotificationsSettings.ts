/**
 * Composable для работы с настройками уведомлений
 */
import { ref } from 'vue';
import type {
  UserPreferencesDto,
  UpdateUserPreferencesDto,
  NotificationPreferencesDto,
  UpdateNotificationPreferencesDto,
  NotificationKind,
  RegisterTokenDto,
  SnoozeRequestDto,
  CreateInteractionDto,
} from '@/shared/dto/notifications';

export function useNotificationsSettings() {
  const loading = ref(false);
  const error = ref<string | null>(null);

  // ==========================================
  // Глобальные настройки (addressing, tone)
  // ==========================================

  const fetchGlobalPreferences =
    async (): Promise<UserPreferencesDto | null> => {
      try {
        loading.value = true;
        error.value = null;
        const { $api } = useNuxtApp();
        const data = await $api<UserPreferencesDto>(
          '/api/settings/preferences',
          {
            method: 'GET',
          }
        );
        return data;
      } catch (e: any) {
        error.value = e.message || 'Failed to fetch global preferences';
        return null;
      } finally {
        loading.value = false;
      }
    };

  const updateGlobalPreferences = async (
    dto: UpdateUserPreferencesDto
  ): Promise<UserPreferencesDto | null> => {
    try {
      loading.value = true;
      error.value = null;
      const { $api } = useNuxtApp();
      const data = await $api<UserPreferencesDto>('/api/settings/preferences', {
        method: 'PUT',
        body: dto,
      });
      return data;
    } catch (e: any) {
      error.value = e.message || 'Failed to update global preferences';
      return null;
    } finally {
      loading.value = false;
    }
  };

  // ==========================================
  // Локальные настройки (по типу: therapy / habits)
  // ==========================================

  const fetchNotificationPreferences = async (
    kind: NotificationKind,
    options?: { habitId?: string; topicKey?: string }
  ): Promise<NotificationPreferencesDto | null> => {
    try {
      loading.value = true;
      error.value = null;
      const { $api } = useNuxtApp();
      let url = `/api/notifications/prefs/${kind}`;
      const params = new URLSearchParams();
      if (options?.habitId) {
        params.append('habitId', options.habitId);
      }
      if (options?.topicKey) {
        params.append('topicKey', options.topicKey);
      }
      if (params.toString()) {
        url += `?${params.toString()}`;
      }
      const data = await $api<NotificationPreferencesDto>(url, {
        method: 'GET',
      });
      return data;
    } catch (e: any) {
      error.value = e.message || 'Failed to fetch notification preferences';
      return null;
    } finally {
      loading.value = false;
    }
  };

  const updateNotificationPreferences = async (
    kind: NotificationKind,
    dto: UpdateNotificationPreferencesDto
  ): Promise<NotificationPreferencesDto | null> => {
    try {
      loading.value = true;
      error.value = null;
      const { $api } = useNuxtApp();
      const data = await $api<NotificationPreferencesDto>(
        `/api/notifications/prefs/${kind}`,
        {
          method: 'PUT',
          body: dto,
        }
      );
      return data;
    } catch (e: any) {
      error.value = e.message || 'Failed to update notification preferences';
      return null;
    } finally {
      loading.value = false;
    }
  };

  // ==========================================
  // Регистрация токена устройства
  // ==========================================

  const registerToken = async (dto: RegisterTokenDto): Promise<boolean> => {
    try {
      loading.value = true;
      error.value = null;
      await $fetch('/api/notifications/register-token', {
        method: 'POST',
        body: dto,
      });
      return true;
    } catch (e: any) {
      error.value = e.message || 'Failed to register token';
      return false;
    } finally {
      loading.value = false;
    }
  };

  // ==========================================
  // Snooze (отложить уведомление)
  // ==========================================

  const snoozeNotification = async (
    dto: SnoozeRequestDto
  ): Promise<boolean> => {
    try {
      loading.value = true;
      error.value = null;
      await $fetch('/api/notifications/snooze', {
        method: 'POST',
        body: dto,
      });
      return true;
    } catch (e: any) {
      error.value = e.message || 'Failed to snooze notification';
      return false;
    } finally {
      loading.value = false;
    }
  };

  // ==========================================
  // Быстрый тест (создать слот через 1 минуту)
  // ==========================================

  const scheduleQuickTest = async (
    kind: NotificationKind
  ): Promise<string | null> => {
    try {
      loading.value = true;
      error.value = null;
      const response = await $fetch<{
        success: boolean;
        slotId: string;
        scheduledAt: string;
        message: string;
      }>('/api/notifications/test-quick', {
        method: 'POST',
        body: { kind },
      });
      return response.message;
    } catch (e: any) {
      error.value = e.message || 'Failed to schedule quick test';
      return null;
    } finally {
      loading.value = false;
    }
  };

  // ==========================================
  // Трекинг взаимодействия с уведомлением
  // ==========================================

  const trackInteraction = async (
    dto: CreateInteractionDto
  ): Promise<boolean> => {
    try {
      await $fetch('/api/notifications/interaction', {
        method: 'POST',
        body: dto,
      });
      return true;
    } catch (e: any) {
      console.error('Failed to track interaction:', e);
      return false;
    }
  };

  return {
    loading,
    error,
    fetchGlobalPreferences,
    updateGlobalPreferences,
    fetchNotificationPreferences,
    updateNotificationPreferences,
    registerToken,
    snoozeNotification,
    scheduleQuickTest,
    trackInteraction,
  };
}

/**
 * Автоматическое определение timezone из браузера/устройства
 */
export function detectTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone;
  } catch {
    return 'Europe/Moscow'; // fallback
  }
}
