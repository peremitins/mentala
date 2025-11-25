import { defineStore } from 'pinia';
import { useToast } from '@/app/composables/useToast';
import type { HabitDto, CreateHabitDto } from '@/shared/dto/notifications';

interface UserHabitsState {
  habits: HabitDto[];
  loading: boolean;
  error: string | null;
}

export const useUserHabitsStore = defineStore('user-habits', {
  state: (): UserHabitsState => ({
    habits: [],
    loading: false,
    error: null,
  }),
  getters: {
    byId: (state) => (id: string) =>
      state.habits.find((habit) => habit.id === id),
  },
  actions: {
    async fetchAll() {
      if (this.loading) return;
      this.loading = true;
      this.error = null;
      try {
        const { $api } = useNuxtApp();
        const data = await $api<HabitDto[]>('/api/habits');
        this.habits = data;
      } catch (error: any) {
        this.error = error?.message || 'Не удалось загрузить привычки';
        console.error('[userHabits] fetchAll error:', error);
      } finally {
        this.loading = false;
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
