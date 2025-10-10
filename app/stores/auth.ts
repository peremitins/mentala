import { defineStore } from 'pinia';
import { useI18n } from 'vue-i18n';

export const useAuthStore = defineStore('auth', {
  state: () => ({ user: null as any, loading: false }),
  actions: {
    async me() {
      const { data } = await useAPI('/api/user/me');

      this.user = (data.value as any)?.user ?? null;

      return this.user;
    },
    async loginEmail(payload: {
      email: string;
      password: string;
      locale?: string;
    }) {
      this.loading = true;
      try {
        const { status } = await useAPI('/api/auth/email/login', {
          method: 'POST',
          body: payload,
        });

        if (status.value === 'success') {
          await navigateTo('/');
        }
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
        const { status } = await useAPI('/api/auth/email/register', {
          method: 'POST',
          body: payload,
        });

        if (status.value === 'success') {
          await navigateTo('/');
        }
      } finally {
        this.loading = false;
      }
    },
    async logout() {
      await useAPI('/api/auth/logout', {
        method: 'POST',
      });
      this.user = null;
      navigateTo('/auth');
    },
    oauth(provider: string, locale?: string) {
      // const redirect_uri = encodeURIComponent(window.location.origin);
      // const qs = new URLSearchParams({
      //   redirect_uri,
      //   locale: locale || '',
      // }).toString();
      // window.location.href = `/api/auth/${provider}/start?${qs}`;
      const back = `${location.origin}/`; // вернёмся на главную
      window.location.assign(
        `/api/auth/google/start?redirect_uri=${encodeURIComponent(back)}&locale=${locale}`
      );
    },
  },
});
