import { defineStore } from 'pinia';
import { Capacitor } from '@capacitor/core';
import { useChatStore } from '@/app/stores/chat';

const SESSION_TOKEN_KEY = 'mentai.session.token';

export const useAuthStore = defineStore('auth', {
  state: () => ({ user: null as any, loading: false, isLoggedIn: false }),
  actions: {
    async me() {
      try {
        const response: any = await useAPI('/api/user/me', {
          method: 'GET',
        });

        this.user = response?.user ?? null;
        this.isLoggedIn = !!this.user;

        return this.user;
      } catch (error) {
        this.user = null;
        this.isLoggedIn = false;
        console.warn('Failed to fetch user:', error);
        throw error;
      }
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

        // Сохраняем токен сессии в localStorage для использования в заголовке
        // Это fallback если cookies не работают (например, cross-domain)
        if (typeof window !== 'undefined') {
          const sessionToken = (response as any)?.sessionToken;
          if (sessionToken) {
            localStorage.setItem(SESSION_TOKEN_KEY, sessionToken);
          }
        }

        // Устанавливаем пользователя из ответа
        if (response?.user) {
          this.user = response.user;
          this.isLoggedIn = true;
        }

        // Переходим на главную
        await navigateTo('/');
      } catch (error) {
        console.error('Login error:', error);
        throw error;
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

        // Устанавливаем пользователя из ответа
        if (response?.user) {
          this.user = response.user;
          this.isLoggedIn = true;
        }

        // Переходим на главную
        await navigateTo('/');
      } catch (error) {
        console.error('Registration error:', error);
        throw error;
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
      // Очищаем токен из localStorage для Capacitor
      if (typeof window !== 'undefined' && Capacitor.isNativePlatform()) {
        localStorage.removeItem(SESSION_TOKEN_KEY);
      }
      this.user = null;
      this.isLoggedIn = false;
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
