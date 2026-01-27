import { defineStore } from 'pinia';

import type { UserPrompt, AiWorkMode, IPromptsStore } from '@/app/types';

export const usePromptsStore = defineStore('prompts', {
  state: (): IPromptsStore => ({
    items: [] as UserPrompt[],
    loading: false,
  }),
  actions: {
    async fetch(type?: AiWorkMode) {
      const { $api } = useNuxtApp();
      this.loading = true;
      try {
        const q = type ? `?type=${encodeURIComponent(type)}` : '';
        const res = await $api(`/api/prompts${q}`, { method: 'GET' });
        this.items = Array.isArray(res?.items) ? res.items : [];

        return this.items;
      } finally {
        this.loading = false;
      }
    },

    async create(
      payload: Partial<UserPrompt> & {
        title: string;
        type: AiWorkMode;
        content: string;
        lang?: string;
        isActive?: boolean;
      }
    ) {
      const { $api } = useNuxtApp();
      try {
        const res = await $api('/api/prompts', {
          method: 'POST',
          body: payload,
        });
        if (res?.item) this.items.unshift(res.item);
        return res?.item as UserPrompt;
      } catch (error) {
        console.error('Error creating prompt:', error);
        throw error;
      }
    },
    async update(id: number, payload: Partial<UserPrompt>) {
      const { $api } = useNuxtApp();
      try {
        const res = await $api(`/api/prompts/${id}`, {
          method: 'PATCH',
          body: payload,
        });
        const idx = this.items.findIndex((x) => x.id === id);
        if (idx !== -1 && res?.item) this.items[idx] = res.item;
        return res?.item as UserPrompt;
      } catch (error) {
        console.error('Error updating prompt:', error);
        throw error;
      }
    },
    async remove(id: number) {
      const { $api } = useNuxtApp();
      try {
        const res = await $api(`/api/prompts/${id}`, { method: 'DELETE' });
        this.items = this.items.filter((x) => x.id !== id);
        return res?.item as UserPrompt;
      } catch (error) {
        console.error('Error removing prompt:', error);
        throw error;
      }
    },
    async activate(id: number) {
      const { $api } = useNuxtApp();
      try {
        const res = await $api(`/api/prompts/${id}/activate`, {
          method: 'POST',
        });
        if (res?.item) {
          // Обновим все элементы этого типа
          const type = res.item.type as AiWorkMode;
          this.items = this.items.map((x) =>
            x.type === type ? { ...x, isActive: x.id === id } : x
          );

        }
        return res?.item as UserPrompt;
      } catch (error) {
        console.error('Error activating prompt:', error);
        throw error;
      }
    },
  },
});
