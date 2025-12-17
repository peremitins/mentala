import { defineStore } from 'pinia';
import { Capacitor } from '@capacitor/core';
import { useChatStore } from '@/app/stores/chat';
import { useChatSettingsStore } from '@/app/stores/chatSettings';
import { useSpeechStore } from '@/app/stores/speech';
import { useHeygenStore } from '@/app/stores/heygen';
import { useSubscriptionStore } from '@/app/stores/subscription';
import { useUserHabitsStore } from '@/app/stores/userHabits';
import { useTherapyTopicsStore } from '@/app/stores/therapyTopics';
import { useLoadersStore } from '@/app/stores/loaders';
import { usePromptsStore } from '@/app/stores/prompts';
import { useNotificationsStore } from '@/app/stores/notifications';
import { useUserStore } from '@/app/stores/user';
import { useTTS } from '@/app/composables/useTTS';
import { useSpeechEngine } from '@/app/composables/useSpeechEngine';

const SESSION_TOKEN_KEY = 'mentala.session.token';

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
    /**
     * Останавливает все активные запросы и озвучки
     */
    async _stopAllActiveRequests() {
      try {
        // 1. Останавливаем TTS озвучку
        const { stop: stopTTS } = useTTS();
        stopTTS();

        // 2. Останавливаем chat stream запросы
        const chat = useChatStore();
        chat.stopChatStream();

        // 3. Останавливаем HeyGen сессию
        const heygen = useHeygenStore();
        if (heygen.isConnected || heygen.isStarting) {
          heygen.stopSession();
        }

        // 4. Останавливаем микрофон, если активен
        const speechStore = useSpeechStore();
        if (speechStore.isListening) {
          const { stop: stopSpeech } = useSpeechEngine();
          await stopSpeech();
        }
      } catch (err) {
        console.error('[Auth Store] Error stopping active requests:', err);
      }
    },

    /**
     * Сохраняет текущую сессию чата в фоне (не блокирует выполнение)
     */
    _saveSessionInBackground() {
      const chat = useChatStore();
      if (chat.sessionId && chat.messages && chat.messages.length > 0) {
        void chat.finishAndSave().catch((err) => {
          console.error('[Auth Store] Background finishAndSave failed:', err);
        });
      }
    },

    /**
     * Сбрасывает состояние всех stores через $reset()
     * Важно: auth store сбрасывается отдельно через _resetAuthState()
     */
    _resetAllStores() {
      try {
        // Сбрасываем все stores в порядке зависимостей
        useChatStore().$reset();
        useChatSettingsStore().$reset();
        useSpeechStore().$reset();
        useHeygenStore().$reset();
        useSubscriptionStore().$reset();
        useUserHabitsStore().$reset();
        useTherapyTopicsStore().$reset();
        useLoadersStore().$reset();
        usePromptsStore().$reset();
        useNotificationsStore().$reset();
        useUserStore().$reset();
      } catch (err) {
        console.error('[Auth Store] Error resetting stores:', err);
        // Продолжаем выполнение даже если какой-то store не удалось сбросить
      }
    },

    /**
     * Очищает токен сессии из localStorage
     */
    _clearSessionToken() {
      if (typeof window !== 'undefined') {
        localStorage.removeItem(SESSION_TOKEN_KEY);
      }
    },

    /**
     * Сбрасывает состояние auth store
     */
    _resetAuthState() {
      this.user = null;
      this.isLoggedIn = false;
    },

    async logout() {
      // 1. Останавливаем все активные запросы и озвучки
      await this._stopAllActiveRequests();

      // 2. Сохраняем текущую сессию в фоне (не блокируем logout)
      this._saveSessionInBackground();

      // 3. Сбрасываем все stores
      this._resetAllStores();

      // 4. Выполняем запрос на разлогин
      await useAPI('/api/auth/logout', {
        method: 'POST',
      });

      // 5. Очищаем токен из localStorage
      this._clearSessionToken();

      // 6. Сбрасываем состояние auth store
      this._resetAuthState();

      // 7. Переходим на страницу авторизации
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
