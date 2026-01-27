import { defineStore } from 'pinia';
import type { NotificationPreferencesDto } from '@/shared/dto/notifications';

interface NotificationsState {
  preferences: NotificationPreferencesDto[];
  loading: boolean;
  error: string | null;
}

export const useNotificationsStore = defineStore('notifications', {
  state: (): NotificationsState => ({
    preferences: [],
    loading: false,
    error: null,
  }),

  getters: {
    /**
     * Подсчитывает общее количество уведомлений в день
     * (сумма всех включенных шаблонов, игнорируя legacy данные)
     */
    totalPerDay(state): number {
      return state.preferences
        .filter((p) => {
          // Пропускаем выключенные
          if (!p.enabled) return false;

          // Игнорируем legacy данные (без entityKey)
          if (!p.entityKey) return false;

          return true;
        })
        .reduce((sum, p) => sum + p.timesPerDay, 0);
    },

    /**
     * Проверяет, превышен ли порог уведомлений
     */
    isOverloaded(): boolean {
      return this.totalPerDay > 10;
    },

    /**
     * Получает preference по kind + entityKey
     */
    getPreference:
      (state) =>
      (
        kind: 'therapy' | 'habits',
        options?: { entityKey?: string }
      ): NotificationPreferencesDto | undefined => {
        return state.preferences.find((p) => {
          if (p.kind !== kind) return false;

          if (options?.entityKey) {
            return p.entityKey === options.entityKey;
          }

          return true;
        });
      },
  },

  actions: {
    /**
     * Загружает все preferences пользователя
     */
    async fetchAll() {
      this.loading = true;
      this.error = null;

      try {
        const { $api } = useNuxtApp();
        const data = await $api<NotificationPreferencesDto[]>(
          '/api/notifications/prefs'
        );
        this.preferences = data;
      } catch (e: any) {
        this.error = e.message || 'Failed to fetch preferences';
        console.error('[NotificationsStore] fetchAll error:', e);
      } finally {
        this.loading = false;
      }
    },

    /**
     * Обновляет локально preference после изменения
     * (для моментального обновления UI без перезагрузки)
     */
    updateLocal(updated: NotificationPreferencesDto) {
      const index = this.preferences.findIndex((p) => p.id === updated.id);
      if (index !== -1) {
        this.preferences[index] = updated;
      } else {
        // Если не найден — добавляем (новый preference)
        this.preferences.push(updated);
      }
    },

    /**
     * Удаляет preference локально
     */
    removeLocal(id: string) {
      this.preferences = this.preferences.filter((p) => p.id !== id);
    },

    /**
     * Сбрасывает состояние
     */
    reset() {
      this.preferences = [];
      this.loading = false;
      this.error = null;
    },
  },
});
