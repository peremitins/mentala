import { defineStore } from 'pinia';
import type {
  TherapyTopicDto,
  CreateTherapyTopicDto,
  UpdateTherapyTopicDto,
} from '@/shared/dto/notifications';
import { useToast } from '@/app/composables/useToast';

interface TherapyTopicsState {
  topics: TherapyTopicDto[];
  loading: boolean;
  error: string | null;
}

export const useTherapyTopicsStore = defineStore('therapy-topics', {
  state: (): TherapyTopicsState => ({
    topics: [],
    loading: false,
    error: null,
  }),
  getters: {
    byId: (state) => (id: string) =>
      state.topics.find((topic) => topic.id === id),
  },
  actions: {
    async fetchAll() {
      if (this.loading) return;
      this.loading = true;
      this.error = null;
      try {
        const { $api } = useNuxtApp();
        const data = await $api<TherapyTopicDto[]>('/api/therapy/custom');
        this.topics = data;
      } catch (error: any) {
        this.error = error?.message || 'Не удалось загрузить темы';
        console.error('[therapyTopics] fetchAll error:', error);
      } finally {
        this.loading = false;
      }
    },
    async create(payload: CreateTherapyTopicDto) {
      const { $api } = useNuxtApp();
      try {
        const topic = await $api<TherapyTopicDto>('/api/therapy/custom', {
          method: 'POST',
          body: payload,
        });
        this.topics.unshift(topic);
        return topic;
      } catch (error: any) {
        console.error('[therapyTopics] create error:', error);
        useToast(error?.message || 'Не удалось создать тему');
        throw error;
      }
    },
    async update(id: string, payload: UpdateTherapyTopicDto) {
      const { $api } = useNuxtApp();
      try {
        const updated = await $api<TherapyTopicDto>(
          `/api/therapy/custom/${id}`,
          {
            method: 'PUT',
            body: payload,
          }
        );
        this.updateLocal(updated);
        return updated;
      } catch (error: any) {
        console.error('[therapyTopics] update error:', error);
        useToast(error?.message || 'Не удалось обновить тему');
        throw error;
      }
    },
    async remove(id: string) {
      const { $api } = useNuxtApp();
      try {
        await $api(`/api/therapy/custom/${id}`, { method: 'DELETE' });
        this.topics = this.topics.filter((topic) => topic.id !== id);
      } catch (error: any) {
        console.error('[therapyTopics] remove error:', error);
        useToast(error?.message || 'Не удалось удалить тему');
        throw error;
      }
    },
    updateLocal(topic: TherapyTopicDto) {
      const index = this.topics.findIndex((t) => t.id === topic.id);
      if (index !== -1) {
        this.topics[index] = topic;
      } else {
        this.topics.push(topic);
      }
    },
  },
});
