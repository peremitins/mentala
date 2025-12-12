import { defineStore } from 'pinia';
import { useToast } from '@/app/composables/useToast';
import type { HabitDto, CreateHabitDto } from '@/shared/dto/notifications';
import { useLoadersStore } from '@/app/stores/loaders';

interface UserHabitsState {
  habits: HabitDto[];
  error: string | null;
  hasFetched: boolean; // Флаг что данные уже загружались хотя бы раз
}

export const useUserHabitsStore = defineStore('user-habits', {
  state: (): UserHabitsState => ({
    habits: [],
    error: null,
    hasFetched: false,
  }),
  getters: {
    byId: (state) => (id: string) =>
      state.habits.find((habit) => habit.id === id),
  },
  actions: {
    async fetchAll(force = false) {
      const loaders = useLoadersStore();

      // Защита от одновременных вызовов
      if (loaders.isSkeletonLoading) {
        return;
      }

      // Если уже загружали данные и не принудительное обновление - пропускаем
      if (!force && this.hasFetched) {
        return;
      }

      loaders.showSkeleton();
      this.error = null;
      try {
        const { $api } = useNuxtApp();
        const data = await $api<HabitDto[]>('/api/habits');
        this.habits = data;
        this.hasFetched = true;
      } catch (error: any) {
        this.error = error?.message || 'Не удалось загрузить привычки';
        console.error('[userHabits] fetchAll error:', error);
      } finally {
        loaders.hideSkeleton();
      }
    },
    async create(payload: CreateHabitDto) {
      const { $api } = useNuxtApp();
      try {
        const habit = await $api<HabitDto>('/api/habits', {
          method: 'POST',
          body: payload,
        });
        this.habits.unshift(habit);
        return habit;
      } catch (error: any) {
        console.error('[userHabits] create error:', error);
        useToast(error?.message || 'Не удалось создать привычку');
        throw error;
      }
    },
    updateLocal(habit: HabitDto) {
      const index = this.habits.findIndex((h) => h.id === habit.id);
      if (index !== -1) {
        this.habits[index] = habit;
      }
    },
    async remove(id: string) {
      const { $api } = useNuxtApp();
      try {
        await $api(`/api/habits/${id}`, { method: 'DELETE' });
        this.habits = this.habits.filter((habit) => habit.id !== id);
      } catch (error: any) {
        console.error('[userHabits] remove error:', error);
        useToast(error?.message || 'Не удалось удалить привычку');
        throw error;
      }
    },
  },
});
