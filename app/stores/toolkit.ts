import { defineStore } from 'pinia';
import type { UserToolkitItem } from '@/shared/dto/toolkit';
import { useLoadersStore } from '@/app/stores/loaders';
import { useToast } from '@/app/composables/useToast';

interface ToolkitState {
  items: UserToolkitItem[];
  error: string | null;
  hasFetched: boolean;
}

export const useToolkitStore = defineStore('toolkit', {
  state: (): ToolkitState => ({
    items: [],
    error: null,
    hasFetched: false,
  }),
  getters: {
    // Группы для раздела «Мой набор».
    practices: (state) => state.items.filter((i) => i.type === 'practice'),
    phrases: (state) => state.items.filter((i) => i.type === 'phrase'),
    chats: (state) => state.items.filter((i) => i.type === 'ai_chat'),
    isEmpty: (state) => state.items.length === 0,
  },
  actions: {
    async load(force = false) {
      const loaders = useLoadersStore();
      if (loaders.isSkeletonLoading) {
        return;
      }
      if (!force && this.hasFetched) {
        return;
      }

      this.error = null;
      try {
        const { $api } = useNuxtApp();
        const data = await $api<UserToolkitItem[]>('/api/toolkit');
        this.items = data;
        this.hasFetched = true;
      } catch (error: any) {
        this.error = error?.message || 'Не удалось загрузить набор';
        console.error('[ToolkitStore] load error:', error);
        if (error?.statusCode !== 401) {
          useToast(error?.message || 'Не удалось загрузить набор');
        }
      }
    },

    async addPhrase(content: string): Promise<UserToolkitItem> {
      const { $api } = useNuxtApp();
      try {
        const item = await $api<UserToolkitItem>('/api/toolkit', {
          method: 'POST',
          body: { content },
        });
        // Если фраза уже была (дедуп) — обновим локально, иначе добавим в начало.
        const index = this.items.findIndex((i) => i.id === item.id);
        if (index !== -1) {
          this.items[index] = item;
        } else {
          this.items.unshift(item);
        }
        return item;
      } catch (error: any) {
        console.error('[ToolkitStore] addPhrase error:', error);
        useToast(error?.message || 'Не удалось добавить фразу');
        throw error;
      }
    },

    async updatePhrase(id: number, content: string): Promise<UserToolkitItem> {
      const { $api } = useNuxtApp();
      try {
        const updated = await $api<UserToolkitItem>(`/api/toolkit/${id}`, {
          method: 'PATCH',
          body: { content },
        });
        const index = this.items.findIndex((i) => i.id === id);
        if (index !== -1) {
          this.items[index] = updated;
        }
        return updated;
      } catch (error: any) {
        console.error('[ToolkitStore] updatePhrase error:', error);
        useToast(error?.message || 'Не удалось обновить фразу');
        throw error;
      }
    },

    async remove(id: number): Promise<void> {
      const { $api } = useNuxtApp();
      // Оптимистично убираем из списка, при ошибке возвращаем.
      const index = this.items.findIndex((i) => i.id === id);
      const removed = index !== -1 ? this.items[index] : null;
      if (index !== -1) {
        this.items.splice(index, 1);
      }
      try {
        await $api(`/api/toolkit/${id}`, { method: 'DELETE' });
      } catch (error: any) {
        console.error('[ToolkitStore] remove error:', error);
        if (removed) {
          this.items.splice(index, 0, removed);
        }
        useToast(error?.message || 'Не удалось убрать элемент');
        throw error;
      }
    },
  },
});
