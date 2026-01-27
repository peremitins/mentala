import { defineStore } from 'pinia';
import type { BreathCustomPractice, BreathPhase } from '@/app/lib/breathPracticesCatalog';
import { useLoadersStore } from '@/app/stores/loaders';
import { useToast } from '@/app/composables/useToast';

interface BreathPracticesState {
  customPractices: BreathCustomPractice[];
  error: string | null;
  hasFetched: boolean; // Флаг что данные уже загружались хотя бы раз
}

export const useBreathPracticesStore = defineStore('breath-practices', {
  state: (): BreathPracticesState => ({
    customPractices: [],
    error: null,
    hasFetched: false,
  }),
  getters: {
    customById: (state) => (id: string) =>
      state.customPractices.find((practice) => practice.id === id) || null,
  },
  actions: {
    async load(force = false) {
      const loaders = useLoadersStore();

      // Защита от одновременных вызовов
      if (loaders.isSkeletonLoading) {
        return;
      }

      // Если уже загружали данные и не принудительное обновление - пропускаем
      if (!force && this.hasFetched) {
        return;
      }

      this.error = null;
      try {
        const { $api } = useNuxtApp();
        const data = await $api<BreathCustomPractice[]>('/api/breath-practices/custom');
        this.customPractices = data;
        this.hasFetched = true;
      } catch (error: any) {
        this.error = error?.message || 'Не удалось загрузить практики';
        console.error('[BreathPracticesStore] load error:', error);
        // Не показываем toast при первой загрузке, если пользователь не авторизован
        if (error?.statusCode !== 401) {
          useToast(error?.message || 'Не удалось загрузить практики');
        }
      }
    },

    async addCustom(name: string, phases: BreathPhase[]): Promise<BreathCustomPractice> {
      const { $api } = useNuxtApp();
      try {
        const practice = await $api<BreathCustomPractice>('/api/breath-practices/custom', {
          method: 'POST',
          body: { name, phases },
        });
        this.customPractices.unshift(practice);
        return practice;
      } catch (error: any) {
        console.error('[BreathPracticesStore] addCustom error:', error);
        useToast(error?.message || 'Не удалось сохранить практику');
        throw error;
      }
    },

    async updateCustom(
      id: string,
      payload: { name?: string; phases?: BreathPhase[] }
    ): Promise<BreathCustomPractice> {
      const { $api } = useNuxtApp();
      try {
        const updated = await $api<BreathCustomPractice>(
          `/api/breath-practices/custom/${id}`,
          {
            method: 'PUT',
            body: payload,
          }
        );
        this.updateLocal(updated);
        return updated;
      } catch (error: any) {
        console.error('[BreathPracticesStore] updateCustom error:', error);
        useToast(error?.message || 'Не удалось обновить практику');
        throw error;
      }
    },

    async removeCustom(id: string): Promise<void> {
      const { $api } = useNuxtApp();
      try {
        await $api(`/api/breath-practices/custom/${id}`, { method: 'DELETE' });
        this.customPractices = this.customPractices.filter(
          (practice) => practice.id !== id
        );
      } catch (error: any) {
        console.error('[BreathPracticesStore] removeCustom error:', error);
        useToast(error?.message || 'Не удалось удалить практику');
        throw error;
      }
    },

    updateLocal(practice: BreathCustomPractice) {
      const index = this.customPractices.findIndex((p) => p.id === practice.id);
      if (index !== -1) {
        this.customPractices[index] = practice;
      } else {
        this.customPractices.push(practice);
      }
    },
  },
});
