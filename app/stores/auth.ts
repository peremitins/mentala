import { defineStore } from 'pinia';
import { useI18n } from 'vue-i18n';
import { useChatStore } from '@/app/stores/chat';

interface User {
  user: any | null;
}

export const useAuthStore = defineStore('auth', {
  state: () => ({ user: null as any, loading: false, isLoggedIn: false }),
  actions: {
    async me() {
      const response: User = await useAPI('/api/user/me', {
        method: 'GET',
      });

      this.user = response?.user ?? null;
      this.isLoggedIn = !!this.user; // Устанавливаем isLoggedIn только если user не null

      return this.user;
    },
    async loginEmail(payload: {
      email: string;
      password: string;
      locale?: string;
    }) {
      this.loading = true;
      try {
        const response = await useAPI('/api/auth/email/login', {
          method: 'POST',
          body: payload,
        });

        await navigateTo('/');
      } finally {
        this.loading = false;
      }
    },
    async registerEmail(payload: {
      email: string;
      password: string;
      name?: string;
      locale?: string;
    }) {
      this.loading = true;
      try {
        const response = await useAPI('/api/auth/email/register', {
          method: 'POST',
          body: payload,
        });

        await navigateTo('/');
      } finally {
        this.loading = false;
      }
    },
    async logout() {
      try {
        const chat = useChatStore?.();
        await chat.finishAndSave();
      } catch {}
      await useAPI('/api/auth/logout', {
        method: 'POST',
      });
      this.user = null;
      navigateTo('/auth');
    },
    oauth(provider: string, locale?: string) {
      const back = `${location.origin}/`; // вернёмся на главную
      window.location.assign(
        `/api/auth/google/start?redirect_uri=${encodeURIComponent(back)}&locale=${locale}`
      );
    },
  },
});
