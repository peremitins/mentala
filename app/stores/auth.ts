import { defineStore } from 'pinia';
import { useChatStore } from '@/app/stores/chat';
import { useChatSettingsStore } from '@/app/stores/chatSettings';
import { useSpeechStore } from '@/app/stores/speech';
import { useSubscriptionStore } from '@/app/stores/subscription';
import { useUserHabitsStore } from '@/app/stores/userHabits';
import { useTherapyTopicsStore } from '@/app/stores/therapyTopics';
import { useMeditationsStore } from '@/app/stores/meditations';
import { useLoadersStore } from '@/app/stores/loaders';
import { usePromptsStore } from '@/app/stores/prompts';
import { useNotificationsStore } from '@/app/stores/notifications';
import { useUserStore } from '@/app/stores/user';
import { useSceneSettingsStore } from '@/app/stores/sceneSettings';
import { useTTS } from '@/app/composables/useTTS';
import { useSpeechEngine } from '@/app/composables/useSpeechEngine';

const SESSION_TOKEN_KEY = 'mentai.session.token';
const GOOGLE_WEB_CLIENT_ID_REGEX = /\.apps\.googleusercontent\.com$/i;

function mapGoogleLoginError(error: any): string {
  const rawMessage = String(error?.message || error || '').trim();
  const code = String(error?.code || '').trim();
  const text = `${code} ${rawMessage}`.toLowerCase();

  if (text.includes('sign_in_cancelled') || text.includes('12501')) {
    return 'Вход отменён пользователем';
  }
  if (text.includes('developer_error') || text.includes('10')) {
    return 'Google отклонил вход (DEVELOPER_ERROR). Проверь SHA-1 (debug/release) и package name в Android OAuth client, а также что используется Web Client ID.';
  }
  if (text.includes('network') || text.includes('12500')) {
    return 'Не удалось подключиться к Google. Проверь интернет и Google Play Services.';
  }
  if (rawMessage) return rawMessage;
  return 'Не удалось войти через Google';
}

export const useAuthStore = defineStore('auth', {
  state: () => ({
    user: null as {
      id: number;
      email: string;
      name: string;
      gender?: 'male' | 'female' | null;
      ageRange?: 'under_30' | '30_45' | '45_plus' | 'unknown' | null;
      onboarding?: { welcome: boolean };
      locale?: string;
      role?: string;
      isBlocked?: boolean;
      emailVerifiedAt?: string | null;
      hasPassword?: boolean;
      // Настройки фоновой сцены приложения (страница Scene Selection).
      sceneSettings?: {
        sceneId?: string | null;
        volume?: number | null;
        backgroundPlayMinutes?: number | null;
        animateBackground?: boolean | null;
      };
    } | null,
    loading: false,
    isLoggedIn: false,
  }),
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
        console.warn('Не удалось получить пользователя:', error);
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

        // Сохраняем токен сессии в localStorage ТОЛЬКО для Capacitor
        // Для web используем только httpOnly cookie
        if (typeof window !== 'undefined') {
          const { Capacitor } = await import('@capacitor/core');
          const isCapacitor = Capacitor.isNativePlatform();
          if (isCapacitor) {
            const sessionToken = (response as any)?.sessionToken;
            if (sessionToken) {
              localStorage.setItem(SESSION_TOKEN_KEY, sessionToken);
            }
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
        console.error('Ошибка входа:', error);
        throw error;
      } finally {
        this.loading = false;
      }
    },
    async loginWithGoogle(locale?: string) {
      if (typeof window === 'undefined') return;

      const { Capacitor } = await import('@capacitor/core');
      const isCapacitor = Capacitor.isNativePlatform();

      if (!isCapacitor) {
        this.oauth('google', locale);
        return;
      }

      this.loading = true;
      try {
        const { SocialLogin } = await import('@capgo/capacitor-social-login');
        const config = useRuntimeConfig();
        const webClientId = String(
          config.public.googleWebClientId || ''
        ).trim();
        const iosClientId = String(
          config.public.googleIosClientId || ''
        ).trim();

        if (!Capacitor.isPluginAvailable('SocialLogin')) {
          throw new Error(
            'Нативный плагин SocialLogin не найден. Выполни `pnpm cap sync android`, затем Clean/Rebuild и переустанови приложение.'
          );
        }

        if (!webClientId || !GOOGLE_WEB_CLIENT_ID_REGEX.test(webClientId)) {
          throw new Error(
            'Не задан или некорректен Google Web Client ID. Проверь NUXT_PUBLIC_GOOGLE_WEB_CLIENT_ID.'
          );
        }

        const googleConfig: Record<string, any> = {
          webClientId,
          mode: 'online',
        };

        if (Capacitor.getPlatform() === 'ios' && iosClientId) {
          googleConfig.iOSClientId = iosClientId;
          googleConfig.iOSServerClientId = webClientId;
        }

        await SocialLogin.initialize({ google: googleConfig });
        const loginResponse: any = await SocialLogin.login({
          provider: 'google',
          options: {
            scopes: ['email', 'profile'],
          },
        });
        const idToken = loginResponse?.result?.idToken;
        if (!idToken) {
          throw new Error('Google idToken missing');
        }

        const response: any = await useAPI('/api/auth/google/native', {
          method: 'POST',
          body: { idToken },
        });

        if (response?.requiresAccountLinking) {
          const params = new URLSearchParams({
            token: response.linkingToken,
            email: response.email,
            back: '/',
          });
          await navigateTo(`/auth/link?${params.toString()}`);
          return response;
        }

        const sessionToken = response?.sessionToken;
        if (sessionToken) {
          localStorage.setItem(SESSION_TOKEN_KEY, sessionToken);
        }

        if (response?.user) {
          this.user = response.user;
          this.isLoggedIn = true;
        }

        await navigateTo('/');
        return response;
      } catch (error) {
        console.error('Ошибка нативного входа Google:', error);
        throw new Error(mapGoogleLoginError(error));
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
        return response as any;
      } catch (error) {
        console.error('Ошибка регистрации:', error);
        throw error;
      } finally {
        this.loading = false;
      }
    },
    async verifyEmailCode(
      payload: { email: string; code: string },
      options?: { redirect?: string | null }
    ) {
      this.loading = true;
      try {
        const response = await useAPI('/api/auth/email/verify', {
          method: 'POST',
          body: payload,
        });

        if (typeof window !== 'undefined') {
          const { Capacitor } = await import('@capacitor/core');
          const isCapacitor = Capacitor.isNativePlatform();
          if (isCapacitor) {
            const sessionToken = (response as any)?.sessionToken;
            if (sessionToken) {
              localStorage.setItem(SESSION_TOKEN_KEY, sessionToken);
            }
          }
        }

        if ((response as any)?.user) {
          this.user = (response as any).user;
          this.isLoggedIn = true;
        }

        const redirectTo =
          options && 'redirect' in options ? options.redirect : '/';
        if (redirectTo) {
          await navigateTo(redirectTo);
        }
        return response as any;
      } catch (error) {
        console.error('Ошибка проверки email:', error);
        throw error;
      } finally {
        this.loading = false;
      }
    },
    async resendEmailCode(payload: { email: string }) {
      return await useAPI('/api/auth/email/resend-code', {
        method: 'POST',
        body: payload,
      });
    },
    async requestEmailVerification(payload: { email: string }) {
      return await useAPI('/api/auth/email/request-verification', {
        method: 'POST',
        body: payload,
      });
    },
    async linkOAuthVerifyPassword(payload: {
      linkingToken: string;
      password: string;
    }) {
      this.loading = true;
      try {
        const response = await useAPI('/api/auth/oauth/link-verify-password', {
          method: 'POST',
          body: payload,
        });

        if (typeof window !== 'undefined') {
          const { Capacitor } = await import('@capacitor/core');
          const isCapacitor = Capacitor.isNativePlatform();
          if (isCapacitor) {
            const sessionToken = (response as any)?.sessionToken;
            if (sessionToken) {
              localStorage.setItem(SESSION_TOKEN_KEY, sessionToken);
            }
          }
        }

        if ((response as any)?.user) {
          this.user = (response as any).user;
          this.isLoggedIn = true;
        }

        return response as any;
      } catch (error) {
        console.error('Ошибка привязки OAuth по паролю:', error);
        throw error;
      } finally {
        this.loading = false;
      }
    },
    async linkOAuthSendCode(payload: { linkingToken: string }) {
      return await useAPI('/api/auth/oauth/link-send-code', {
        method: 'POST',
        body: payload,
      });
    },
    async requestPasswordReset(payload: { email: string }) {
      return await useAPI('/api/auth/password/forgot', {
        method: 'POST',
        body: payload,
      });
    },
    async resetPassword(payload: {
      token: string;
      password: string;
      confirmPassword: string;
    }) {
      this.loading = true;
      try {
        const response = await useAPI('/api/auth/password/reset', {
          method: 'POST',
          body: payload,
        });

        // Сохраняем токен сессии в localStorage ТОЛЬКО для Capacitor
        // Для web используем только httpOnly cookie
        if (typeof window !== 'undefined') {
          const { Capacitor } = await import('@capacitor/core');
          const isCapacitor = Capacitor.isNativePlatform();
          if (isCapacitor) {
            const sessionToken = (response as any)?.sessionToken;
            if (sessionToken) {
              localStorage.setItem(SESSION_TOKEN_KEY, sessionToken);
            }
          }
        }

        // Устанавливаем пользователя из ответа
        if (response?.user) {
          this.user = response.user;
          this.isLoggedIn = true;
        }

        return response as any;
      } catch (error) {
        console.error('Ошибка восстановления пароля:', error);
        throw error;
      } finally {
        this.loading = false;
      }
    },
    async validateResetToken(token: string) {
      return await useAPI(`/api/auth/password/reset/validate?token=${token}`, {
        method: 'GET',
      });
    },
    async linkOAuthVerifyCode(payload: { linkingToken: string; code: string }) {
      this.loading = true;
      try {
        const response = await useAPI('/api/auth/oauth/link-verify-code', {
          method: 'POST',
          body: payload,
        });

        // Обрабатываем ответ после успешной линковки
        if (typeof window !== 'undefined') {
          const { Capacitor } = await import('@capacitor/core');
          const isCapacitor = Capacitor.isNativePlatform();
          if (isCapacitor) {
            const sessionToken = response?.sessionToken;
            if (sessionToken) {
              localStorage.setItem(SESSION_TOKEN_KEY, sessionToken);
            }
          }
        }

        if ((response as any)?.user) {
          this.user = (response as any).user;
          this.isLoggedIn = true;
        }

        return response;
      } catch (error) {
        console.error('Ошибка привязки OAuth по коду:', error);
        throw error;
      } finally {
        this.loading = false;
      }
    },
    async linkOAuthCancel(payload: { linkingToken: string }) {
      return await useAPI('/api/auth/oauth/link-cancel', {
        method: 'POST',
        body: payload,
      });
    },
    async setPassword(payload: { password: string; confirmPassword: string }) {
      return await useAPI('/api/auth/password/set', {
        method: 'POST',
        body: payload,
      });
    },
    async changePassword(payload: {
      currentPassword: string;
      newPassword: string;
      confirmPassword: string;
    }) {
      return await useAPI('/api/auth/password/change', {
        method: 'POST',
        body: payload,
      });
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

        // 3. Останавливаем микрофон, если активен
        const speechStore = useSpeechStore();
        if (speechStore.isListening) {
          const { stop: stopSpeech } = useSpeechEngine();
          await stopSpeech();
        }
      } catch (err) {
        console.error('[Auth Store] Ошибка остановки активных запросов:', err);
      }
    },

    /**
     * Сохраняет текущую сессию чата в фоне (не блокирует выполнение)
     */
    _saveSessionInBackground() {
      const chat = useChatStore();
      if (chat.sessionId && chat.messages && chat.messages.length > 0) {
        void chat.finishAndSave().catch((err) => {
          console.error('[Auth Store] Фоновое сохранение не удалось:', err);
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
        useSubscriptionStore().$reset();
        useUserHabitsStore().$reset();
        useTherapyTopicsStore().$reset();
        useMeditationsStore().$reset();
        useLoadersStore().$reset();
        usePromptsStore().$reset();
        useNotificationsStore().$reset();
        useUserStore().$reset();
        useSceneSettingsStore().$reset();
      } catch (err) {
        console.error('[Auth Store] Ошибка сброса стора:', err);
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
      if (typeof window === 'undefined') return;
      const back = `${window.location.origin}/`; // вернёмся на главную
      const base =
        provider === 'vk' ? '/api/auth/vk/start' : '/api/auth/google/start';
      window.location.assign(
        `${base}?redirect_uri=${encodeURIComponent(back)}&locale=${locale}`
      );
    },
  },
});
