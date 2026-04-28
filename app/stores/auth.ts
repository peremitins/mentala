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
import { useUiSettingsStore } from '@/app/stores/uiSettings';
import { useTTS } from '@/app/composables/useTTS';
import { useSpeechEngine } from '@/app/composables/useSpeechEngine';
import { useMeditationPlayer } from '@/app/composables/useMeditationPlayer';
import { useSceneAudio } from '@/app/composables/useSceneAudio';
import { getErrorDiagnosticsLog } from '@/app/utils/errorDiagnostics';
import { AuthRegisterResponseDto } from '@/shared/dto/auth';
import type { UserBilling, UserMeDto } from '@/shared/dto/user';

type AuthUser = NonNullable<UserMeDto['user']>;

const SESSION_TOKEN_KEY = 'mentai.session.token';
const GOOGLE_WEB_CLIENT_ID_REGEX = /\.apps\.googleusercontent\.com$/i;
const GOOGLE_IOS_CLIENT_ID_REGEX = /\.apps\.googleusercontent\.com$/i;

function normalizeErrorPart(value: unknown): string {
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value).trim();
  }
  return '';
}

function extractGoogleLoginErrorMessage(error: any): string {
  const candidates = [
    error?.message,
    error?.errorMessage,
    error?.statusMessage,
    error?.data?.message,
    error?.data?.errorMessage,
    error?.data?.statusMessage,
    error?.response?._data?.message,
    error?.response?._data?.errorMessage,
    error?.response?._data?.statusMessage,
    error?.cause?.message,
  ];

  for (const candidate of candidates) {
    const text = normalizeErrorPart(candidate);
    if (text) return text;
  }

  return '';
}

function mapGoogleLoginError(error: any): string {
  const rawMessage = extractGoogleLoginErrorMessage(error);
  const rawCode =
    error?.code ??
    error?.data?.code ??
    error?.response?._data?.code ??
    error?.cause?.code ??
    '';
  const code = normalizeErrorPart(rawCode);
  const text = `${code} ${rawMessage}`.toLowerCase();
  const isDeveloperError =
    text.includes('developer_error') ||
    /\bstatus(?:\s*code)?\s*[:=]?\s*10\b/.test(text) ||
    code === '10';

  if (
    text.includes('sign_in_cancelled') ||
    text.includes('user canceled') ||
    text.includes('user cancelled') ||
    text.includes('12501')
  ) {
    return 'Вход отменён пользователем';
  }
  if (
    text.includes('cannot find provider') ||
    text.includes('provider was not initialized') ||
    text.includes('no provider was initialized')
  ) {
    return 'Google провайдер не инициализирован. Проверь `NUXT_OAUTH_GOOGLE_CLIENT_ID` и пересобери Android (`pnpm run generate && npx cap sync android`).';
  }
  if (
    text.includes('google.clientid is null or empty') ||
    text.includes('web client id')
  ) {
    return 'Не задан или некорректен Google Web Client ID. Проверь `NUXT_OAUTH_GOOGLE_CLIENT_ID`.';
  }
  if (
    text.includes('неверный google токен') ||
    text.includes('invalid google token') ||
    text.includes('id token verification failed') ||
    (text.includes('/api/auth/google/native') && text.includes('401'))
  ) {
    return 'Google токен отклонён сервером. Проверь, что на клиенте и сервере совпадают `NUXT_OAUTH_GOOGLE_CLIENT_ID` и `NUXT_PUBLIC_GOOGLE_IOS_CLIENT_ID`, а mobile release bundle пересобран без stale Nuxt cache.';
  }
  if (isDeveloperError) {
    return 'Google отклонил вход (DEVELOPER_ERROR). Проверь SHA-1 (debug/release) и package name в Android OAuth client, а также что используется Web Client ID.';
  }
  if (text.includes('network') || text.includes('12500')) {
    return 'Не удалось подключиться к Google. Проверь интернет и Google Play Services.';
  }
  if (rawMessage) return rawMessage;
  return 'Не удалось войти через Google';
}

function maskGoogleClientId(value: string): string {
  const normalized = value.trim();
  if (!normalized) return '<empty>';

  const prefix =
    normalized.split('.apps.googleusercontent.com')[0] || normalized;
  if (prefix.length <= 10) return prefix;

  return `${prefix.slice(0, 6)}...${prefix.slice(-6)}`;
}

export const useAuthStore = defineStore('auth', {
  state: () => ({
    user: null as AuthUser | null,
    loading: false,
    isLoggedIn: false,
    // Флаг, чтобы безопасно блокировать фоновые эффекты во время logout.
    isLoggingOut: false,
  }),
  actions: {
    setBillingSnapshot(billing: UserBilling | null) {
      if (!this.user) return;
      this.user = {
        ...this.user,
        billing: billing || undefined,
      };
    },
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
        console.warn(
          'Не удалось получить пользователя:',
          getErrorDiagnosticsLog(error)
        );
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

        try {
          // Подтягиваем полный профиль, чтобы забрать sceneSettings и прочие данные.
          await this.me();
          const sceneSettings = useSceneSettingsStore();
          await sceneSettings.loadFromUser();
        } catch {
          // Если профайл не загрузился, всё равно пускаем в приложение.
        }

        // Перепривязываем push-токен к текущей сессии (native + PWA)
        await this._registerPushTokenForSession();
        void this._ensureWebPushAfterLogin();

        // Переходим на главную
        await navigateTo('/');
      } catch (error) {
        console.error('Ошибка входа:', getErrorDiagnosticsLog(error));
        throw error;
      } finally {
        this.loading = false;
      }
    },
    async loginWithGoogle(locale?: string) {
      if (typeof window === 'undefined') return;

      const { Capacitor } = await import('@capacitor/core');
      const isCapacitor = Capacitor.isNativePlatform();
      const platform = Capacitor.getPlatform();

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
          const syncPlatform = platform === 'android' ? 'android' : 'ios';
          throw new Error(
            `Нативный плагин SocialLogin не найден. Выполни \`npx cap sync ${syncPlatform}\`, затем Clean/Rebuild и переустанови приложение.`
          );
        }

        if (!webClientId || !GOOGLE_WEB_CLIENT_ID_REGEX.test(webClientId)) {
          throw new Error(
            'Не задан или некорректен Google Web Client ID. Проверь NUXT_OAUTH_GOOGLE_CLIENT_ID.'
          );
        }

        // Логируем только признаки наличия client id, без утечки самих значений.
        console.info(
          '[Auth][Google] Native init:',
          JSON.stringify({
            platform,
            webClientId: maskGoogleClientId(webClientId),
            iosClientId: maskGoogleClientId(iosClientId),
          })
        );

        const googleConfig: Record<string, any> = {
          webClientId,
          mode: 'online',
        };

        if (platform === 'ios') {
          if (!iosClientId || !GOOGLE_IOS_CLIENT_ID_REGEX.test(iosClientId)) {
            throw new Error(
              'Для iOS не настроен Google Client ID. Добавь `NUXT_PUBLIC_GOOGLE_IOS_CLIENT_ID` (iOS OAuth client) и пересобери iOS приложение.'
            );
          }
          googleConfig.iOSClientId = iosClientId;
          // iOSServerClientId НЕ задаём: он включает веб-OAuth flow (ASWebAuthenticationSession),
          // что вызывает consent-экраны Google. Наш сервер использует только idToken,
          // serverAuthCode не нужен.
        }

        await SocialLogin.initialize({ google: googleConfig });

        if (platform === 'ios') {
          // Очищаем keychain перед входом, чтобы избежать stale-сессии от предыдущей
          // сборки (dev/TestFlight/prod) с другим iOSClientId. Без iOSServerClientId
          // повторный вход использует нативный picker — consent-экраны не появляются.
          try {
            await SocialLogin.logout({ provider: 'google' });
          } catch {
            // Если активной сессии нет — игнорируем.
          }
        }

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

        try {
          // Подтягиваем полный профиль, чтобы забрать sceneSettings и прочие данные.
          await this.me();
          const sceneSettings = useSceneSettingsStore();
          await sceneSettings.loadFromUser();
        } catch {
          // Игнорируем, чтобы не ломать логин.
        }

        // Перепривязываем push-токен к текущей сессии (native + PWA)
        await this._registerPushTokenForSession();
        void this._ensureWebPushAfterLogin();

        await navigateTo('/');
        return response;
      } catch (error) {
        console.error(
          'Ошибка нативного входа Google:',
          getErrorDiagnosticsLog(error)
        );
        const mappedMessage = mapGoogleLoginError(error);
        console.error('[Auth] Google login mapped error:', mappedMessage);

        const mappedError = new Error(mappedMessage);
        (mappedError as any).cause = error;
        throw mappedError;
      } finally {
        this.loading = false;
      }
    },
    async loginWithApple() {
      if (typeof window === 'undefined') return;

      const { Capacitor } = await import('@capacitor/core');
      if (!Capacitor.isNativePlatform() || Capacitor.getPlatform() !== 'ios') {
        throw new Error('Sign in with Apple доступен только на iOS');
      }

      this.loading = true;
      try {
        const { SocialLogin } = await import('@capgo/capacitor-social-login');

        if (!Capacitor.isPluginAvailable('SocialLogin')) {
          throw new Error(
            'Нативный плагин SocialLogin не найден. Выполни `npx cap sync ios`, затем Clean/Rebuild.'
          );
        }

        await SocialLogin.initialize({ apple: {} });

        const loginResponse: any = await SocialLogin.login({
          provider: 'apple',
          options: {},
        });

        // Плагин @capgo/capacitor-social-login возвращает поле idToken (не identityToken)
        const identityToken =
          loginResponse?.result?.idToken ??
          loginResponse?.result?.identityToken;
        if (!identityToken) {
          throw new Error('Apple identityToken missing');
        }

        const givenName =
          loginResponse?.result?.profile?.givenName || undefined;
        const familyName =
          loginResponse?.result?.profile?.familyName || undefined;

        const response: any = await useAPI('/api/auth/apple/native', {
          method: 'POST',
          body: {
            identityToken,
            firstName: givenName,
            lastName: familyName,
          },
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

        try {
          await this.me();
          const sceneSettings = useSceneSettingsStore();
          await sceneSettings.loadFromUser();
        } catch {
          // Игнорируем, чтобы не ломать логин.
        }

        await this._registerPushTokenForSession();
        void this._ensureWebPushAfterLogin();
        await navigateTo('/');
        return response;
      } catch (error) {
        console.error(
          'Ошибка нативного входа Apple:',
          getErrorDiagnosticsLog(error)
        );
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
      // Юридические согласия, обязательные для регистрации
      acceptTerms: boolean;
      acceptPrivacy: boolean;
      // Маркетинговое согласие опционально
      marketingConsent?: boolean;
    }) {
      this.loading = true;
      try {
        const response = await useAPI('/api/auth/email/register', {
          method: 'POST',
          body: payload,
        });
        return AuthRegisterResponseDto.parse(response);
      } catch (error) {
        console.error('Ошибка регистрации:', getErrorDiagnosticsLog(error));
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

        try {
          // Подтягиваем полный профиль, чтобы забрать sceneSettings и прочие данные.
          await this.me();
          const sceneSettings = useSceneSettingsStore();
          await sceneSettings.loadFromUser();
        } catch {
          // Игнорируем, чтобы не блокировать верификацию.
        }

        // Перепривязываем push-токен к текущей сессии (native + PWA)
        await this._registerPushTokenForSession();
        void this._ensureWebPushAfterLogin();

        const redirectTo =
          options && 'redirect' in options ? options.redirect : '/';
        if (redirectTo) {
          await navigateTo(redirectTo);
        }
        return response as any;
      } catch (error) {
        console.error('Ошибка проверки email:', getErrorDiagnosticsLog(error));
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

        // Перепривязываем push-токен к текущей сессии (native + PWA)
        await this._registerPushTokenForSession();
        void this._ensureWebPushAfterLogin();

        return response as any;
      } catch (error) {
        console.error(
          'Ошибка привязки OAuth по паролю:',
          getErrorDiagnosticsLog(error)
        );
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

        // Перепривязываем push-токен к текущей сессии (native + PWA)
        await this._registerPushTokenForSession();
        void this._ensureWebPushAfterLogin();

        return response as any;
      } catch (error) {
        console.error(
          'Ошибка восстановления пароля:',
          getErrorDiagnosticsLog(error)
        );
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

        // Перепривязываем push-токен к текущей сессии (native + PWA)
        await this._registerPushTokenForSession();
        void this._ensureWebPushAfterLogin();

        return response;
      } catch (error) {
        console.error(
          'Ошибка привязки OAuth по коду:',
          getErrorDiagnosticsLog(error)
        );
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

        // 4. Гарантированно выключаем фон и медитации перед logout.
        const { stop: stopMeditation } = useMeditationPlayer();
        const { resetRuntimeState: resetSceneAudioRuntime } = useSceneAudio();
        await resetSceneAudioRuntime();
        await stopMeditation(false);
      } catch (err) {
        console.error('[Auth Store] Ошибка остановки активных запросов:', err);
      }
    },

    /**
     * Завершает активную therapy-сессию до logout.
     *
     * На logout больше не запускаем user-summary: transcript уже сохранён на
     * сервере и будет восстановлен/обработан штатным lifecycle позже.
     *
     * Здесь важно именно дождаться `end`, пока авторизация ещё валидна,
     * иначе запрос может потеряться после очистки session token.
     */
    async _endChatSessionBeforeLogout() {
      const chat = useChatStore();
      if (!chat.therapySessionId) {
        return;
      }

      try {
        await chat.endTherapySession();
      } catch (err) {
        console.error(
          '[Auth Store] Завершение therapy session перед logout не удалось:',
          err
        );
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
        useUiSettingsStore().$reset();
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
     * Регистрирует push-токен для текущей сессии (только native)
     */
    async _registerPushTokenForSession() {
      if (typeof window === 'undefined') return;

      try {
        const { Capacitor } = await import('@capacitor/core');
        const platform = Capacitor.getPlatform();
        if (platform !== 'ios' && platform !== 'android') return;

        const token = window.localStorage.getItem('pushToken');
        if (!token) return;
        const sessionToken = window.localStorage.getItem(SESSION_TOKEN_KEY);
        if (!sessionToken) return;

        const { resolveNativePushInstallationId } = await import(
          '@/app/utils/pushDeviceIdentity'
        );
        const installationId = await resolveNativePushInstallationId(platform);

        await useAPI('/api/notifications/register-token', {
          method: 'POST',
          body: {
            token,
            platform,
            channelType: 'native',
            platformFamily: platform,
            ...(installationId ? { installationId } : {}),
          },
          headers: {
            'X-Session-Token': sessionToken,
          },
        });
      } catch (error) {
        console.error(
          '[Auth Store] Не удалось зарегистрировать push-токен:',
          getErrorDiagnosticsLog(error)
        );
      }
    },

    /**
     * Отключает push-уведомления на текущем устройстве (только native)
     */
    async _unregisterPushTokenForDevice() {
      if (typeof window === 'undefined') return;

      try {
        const { Capacitor } = await import('@capacitor/core');
        const platform = Capacitor.getPlatform();
        if (platform !== 'ios' && platform !== 'android') return;

        const token = window.localStorage.getItem('pushToken');
        if (!token) return;
        const sessionToken = window.localStorage.getItem(SESSION_TOKEN_KEY);
        if (!sessionToken) return;

        await useAPI('/api/notifications/unregister-token', {
          method: 'POST',
          body: {
            token,
          },
          headers: {
            'X-Session-Token': sessionToken,
          },
        });
      } catch (error) {
        console.error(
          '[Auth Store] Не удалось отключить push-токен:',
          getErrorDiagnosticsLog(error)
        );
      }
    },

    /**
     * Деактивирует web push токен (PWA) при logout.
     * Не вызывается на нативных платформах — там работает _unregisterPushTokenForDevice.
     */
    async _deactivateWebPushToken() {
      if (typeof window === 'undefined') return;
      try {
        const { Capacitor } = await import('@capacitor/core');
        if (Capacitor.isNativePlatform()) return; // native — не наш случай

        const { useWebPush } = await import('@/app/composables/useWebPush');
        const webPush = useWebPush();
        await webPush.deactivateOnLogout();
      } catch (error) {
        // Не блокируем logout
        console.warn('[Auth Store] Web push deactivate error:', error);
      }
    },

    /**
     * Перепривязывает web push токен к новой сессии после login.
     * Не запрашивает разрешение — только переregister если оно уже выдано.
     */
    async _ensureWebPushAfterLogin() {
      if (typeof window === 'undefined') return;
      try {
        const { Capacitor } = await import('@capacitor/core');
        if (Capacitor.isNativePlatform()) return;

        const { useWebPush } = await import('@/app/composables/useWebPush');
        const webPush = useWebPush();
        await webPush.ensureRegisteredAfterLogin();
      } catch (error) {
        console.warn('[Auth Store] Web push re-register error:', error);
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
      this.isLoggingOut = true;
      let logoutRequest: Promise<void> | null = null;

      try {
        // 1. Останавливаем все активные запросы и озвучки
        await this._stopAllActiveRequests();

        // 2. До очистки auth корректно останавливаем billing-сессию.
        await this._endChatSessionBeforeLogout();

        // 3. Отключаем push-уведомления на текущем устройстве до разлогина
        await this._unregisterPushTokenForDevice();

        // 4. Деактивируем web push токен (PWA) до разлогина
        await this._deactivateWebPushToken();

        // 5. Делаем запрос на разлогин в фоне, чтобы UI не зависал.
        logoutRequest = (async () => {
          try {
            await useAPI('/api/auth/logout', {
              method: 'POST',
            });
          } catch (error) {
            console.error(
              '[Auth Store] Ошибка logout:',
              getErrorDiagnosticsLog(error)
            );
          }
        })();

        // 6. Сбрасываем auth-состояние заранее, чтобы не запускался фон.
        this._resetAuthState();

        // 7. Сбрасываем все stores
        this._resetAllStores();

        // 8. Очищаем токен из localStorage
        this._clearSessionToken();

        // 9. Переходим на страницу авторизации — UI разблокирован немедленно.
        await navigateTo('/auth');
      } catch (error) {
        console.error(
          '[Auth Store] Logout завершился с ошибкой:',
          getErrorDiagnosticsLog(error)
        );
        try {
          await navigateTo('/auth');
        } catch {
          // Игнорируем, если роутер недоступен.
        }
      } finally {
        this.isLoggingOut = false;
        if (logoutRequest) {
          void logoutRequest;
        }
      }
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
