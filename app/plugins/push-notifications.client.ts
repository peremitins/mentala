import { Capacitor } from '@capacitor/core';
import { PushNotifications } from '@capacitor/push-notifications';
import { LocalNotifications } from '@capacitor/local-notifications';
import { Preferences } from '@capacitor/preferences';
import { nextTick } from 'vue';
import type {
  InteractionAction,
  NotificationNavigation,
} from '@/shared/dto/notifications';
import { useAuthStore } from '@/app/stores/auth';

export default defineNuxtPlugin({
  name: 'push-notifications',
  dependsOn: ['pinia'],
  setup(nuxtApp) {
    // Работаем только на мобильных платформах
    const platform = Capacitor.getPlatform();
    if (platform === 'web') return;

    const NON_NAV_ACTIONS = new Set(['yes', 'no', 'later']);
    const PENDING_NAV_STORAGE_KEY = 'mentai.push.pendingNavigation';
    const PENDING_NAV_TTL_MS = 5 * 60 * 1000;
    const NAV_DEDUP_WINDOW_MS = 12 * 1000;
    const NAV_RETRY_DELAY_MS = 900;

    const canUsePreferences = Capacitor.isPluginAvailable('Preferences');
    const auth = useAuthStore();
    const isIos = platform === 'ios';
    const isAndroid = platform === 'android';
    const PUSH_TOKEN_STORAGE_KEY = 'pushToken';
    const APNS_TOKEN_STORAGE_KEY = 'pushToken.apns';
    const IOS_FCM_TOKEN_MAX_ATTEMPTS = 6;
    const IOS_FCM_TOKEN_RETRY_DELAY_MS = 1200;

    const wait = (ms: number) =>
      new Promise<void>((resolve) => {
        setTimeout(resolve, ms);
      });

    // Для iOS обязателен FCM token. APNs token сохраняем только для диагностики.
    async function resolveFcmToken(): Promise<string | null> {
      if (!isIos) return null;
      if (!Capacitor.isPluginAvailable('FCM')) {
        console.warn('[PushPlugin] FCM plugin is not available on iOS');
        return null;
      }
      try {
        const { FCM } = await import('@capacitor-community/fcm');
        const result = await FCM.getToken();
        const value =
          typeof result?.token === 'string' ? result.token.trim() : '';
        return value || null;
      } catch (error) {
        console.error('[PushPlugin] Failed to get FCM token:', error);
        return null;
      }
    }

    // На iOS FCM токен может появиться не мгновенно после APNs registration.
    // Делаем короткий retry, чтобы не терять первую регистрацию устройства.
    async function resolveFcmTokenWithRetry(): Promise<string | null> {
      for (let attempt = 1; attempt <= IOS_FCM_TOKEN_MAX_ATTEMPTS; attempt++) {
        const token = await resolveFcmToken();
        if (token) return token;
        if (attempt < IOS_FCM_TOKEN_MAX_ATTEMPTS) {
          await wait(IOS_FCM_TOKEN_RETRY_DELAY_MS);
        }
      }
      return null;
    }

    // Сохраняем отложенную навигацию, чтобы не потерять тап на холодном старте.
    type PendingNavigation = {
      targetPath: string;
      messageId?: string | null;
      createdAt: number;
    };

    let pendingNavigation: PendingNavigation | null = null;
    let isFlushingNavigation = false;
    let lastNavigation: {
      path: string;
      messageId?: string | null;
      at: number;
    } | null = null;

    function isTapAction(actionId?: string | null): boolean {
      // Считаем тапом все, что не является action-кнопкой snooze/yes/no/later.
      if (!actionId) return true;
      if (NON_NAV_ACTIONS.has(actionId)) return false;
      if (actionId.startsWith('snooze:')) return false;
      return true;
    }

    function normalizeNavigation(raw: unknown): NotificationNavigation | null {
      if (!raw || typeof raw !== 'object') return null;
      const type =
        typeof (raw as { type?: unknown }).type === 'string'
          ? String((raw as { type?: unknown }).type).trim()
          : '';
      if (!type) return null;

      if (type === 'home') {
        return { type: 'home' };
      }

      if (type === 'meditation_track') {
        const trackId =
          typeof (raw as { trackId?: unknown }).trackId === 'string'
            ? String((raw as { trackId?: unknown }).trackId).trim()
            : '';
        return trackId ? { type: 'meditation_track', trackId } : null;
      }

      if (type === 'breath_practices') {
        return { type: 'breath_practices' };
      }

      if (type === 'breath_practice') {
        const slug =
          typeof (raw as { slug?: unknown }).slug === 'string'
            ? String((raw as { slug?: unknown }).slug).trim()
            : '';
        return slug ? { type: 'breath_practice', slug } : null;
      }

      return null;
    }

    function resolveNavigation(
      data?: Record<string, any>
    ): NotificationNavigation | null {
      if (!data) return null;

      if (typeof data.navigation === 'string' && data.navigation.trim()) {
        try {
          const parsed = JSON.parse(data.navigation) as unknown;
          const normalized = normalizeNavigation(parsed);
          if (normalized) return normalized;
        } catch {
          // Ошибки парсинга не блокируют fallback.
        }
      }

      if (data.navigation && typeof data.navigation === 'object') {
        const normalized = normalizeNavigation(data.navigation);
        if (normalized) return normalized;
      }

      const navType =
        typeof data.navType === 'string' ? data.navType.trim() : '';
      const navId = typeof data.navId === 'string' ? data.navId.trim() : '';
      if (!navType) return null;

      if (navType === 'home') {
        return { type: 'home' };
      }

      if (navType === 'meditation_track' && navId) {
        return { type: 'meditation_track', trackId: navId };
      }

      if (navType === 'breath_practices') {
        return { type: 'breath_practices' };
      }

      if (navType === 'breath_practice' && navId) {
        return { type: 'breath_practice', slug: navId };
      }

      return null;
    }

    // Fallback по action-коду, если deepLink или navigation отсутствуют.
    function resolveActionTargetPath(
      payload?: Record<string, any>
    ): string | null {
      if (!payload) return null;
      const rawAction =
        typeof payload.action === 'string' ? payload.action.trim() : '';
      if (!rawAction) return null;
      const action = rawAction.toLowerCase();

      const readString = (value: unknown): string | null => {
        if (typeof value !== 'string') return null;
        const trimmed = value.trim();
        return trimmed ? trimmed : null;
      };

      if (
        action === 'open_meditations' ||
        action === 'open_meditations_collection'
      ) {
        return '/meditations';
      }

      if (action === 'open_meditation_track') {
        const trackId =
          readString(payload.trackId) ||
          readString(payload.navId) ||
          readString(payload.actionParams?.trackId);
        return trackId
          ? `/meditations?trackId=${encodeURIComponent(trackId)}`
          : '/meditations';
      }

      if (action === 'open_breath_practices') {
        return '/breath-practices';
      }

      if (action === 'open_breath_practice') {
        const practiceId =
          readString(payload.practiceId) ||
          readString(payload.slug) ||
          readString(payload.navId) ||
          readString(payload.actionParams?.practiceId);
        return practiceId
          ? `/breath-practices/${encodeURIComponent(practiceId)}`
          : '/breath-practices';
      }

      if (action === 'open_home') {
        return '/';
      }

      return null;
    }

    async function logMissingNavigation(
      payload: Record<string, any>
    ): Promise<void> {
      const safePayload = {
        slotId: payload?.slotId ?? null,
        messageId:
          payload?.['google.message_id'] ??
          payload?.messageId ??
          payload?.id ??
          null,
        deepLink: payload?.deepLink ?? null,
        action: payload?.action ?? null,
        navType: payload?.navType ?? null,
        navId: payload?.navId ?? null,
      };

      try {
        const Sentry = await import('@sentry/vue');
        Sentry.captureMessage('Нет данных для навигации по push', {
          level: 'warning',
          extra: safePayload,
        });
      } catch {
        console.warn('[PushPlugin] Missing navigation data:', safePayload);
      }
    }

    function buildPathFromNavigation(
      navigation: NotificationNavigation
    ): string {
      // Приводим navigation к пути внутри приложения.
      switch (navigation.type) {
        case 'meditation_track':
          return `/meditations?trackId=${encodeURIComponent(
            navigation.trackId
          )}`;
        case 'breath_practice':
          return `/breath-practices/${encodeURIComponent(
            navigation.slug
          )}${navigation.slug === '4-7-8' ? '?group=popular' : ''}`;
        case 'breath_practices':
          return '/breath-practices';
        default:
          return '/';
      }
    }

    function normalizeTargetPath(value: string): string {
      const trimmed = value.trim();
      if (!trimmed) return '/';

      let path = trimmed;
      if (/^https?:\/\//i.test(trimmed)) {
        try {
          const parsed = new URL(trimmed);
          path = `${parsed.pathname}${parsed.search}`;
        } catch {
          path = trimmed;
        }
      }

      // Убираем лишний "/" перед "?" (например: /meditations/?trackId=...).
      path = path.replace('/?', '?');

      if (!path.startsWith('/')) {
        path = `/${path}`;
      }

      return path || '/';
    }

    // Чем выше score, тем "сильнее" и конкретнее маршрут.
    function scoreTargetPath(targetPath: string): number {
      const normalized = normalizeTargetPath(targetPath);
      if (normalized.includes('trackId=')) return 4;
      if (/^\/breath-practices\/[^/?#]+/i.test(normalized)) return 4;
      if (normalized.startsWith('/meditations')) return 3;
      if (normalized.startsWith('/breath-practices')) return 3;
      if (normalized === '/' || normalized === '') return 1;
      return 2;
    }

    async function readStoredValue(key: string): Promise<string | null> {
      try {
        if (canUsePreferences) {
          const result = await Preferences.get({ key });
          return result?.value ?? null;
        }
        if (typeof window !== 'undefined') {
          return window.localStorage.getItem(key);
        }
        return null;
      } catch (error) {
        console.warn('[PushPlugin] Failed to read storage:', error);
        return null;
      }
    }

    async function writeStoredValue(
      key: string,
      value: string | null
    ): Promise<void> {
      try {
        if (canUsePreferences) {
          if (value === null) {
            await Preferences.remove({ key });
            return;
          }
          await Preferences.set({ key, value });
          return;
        }
        if (typeof window !== 'undefined') {
          if (value === null) {
            window.localStorage.removeItem(key);
            return;
          }
          window.localStorage.setItem(key, value);
        }
      } catch (error) {
        console.warn('[PushPlugin] Failed to write storage:', error);
      }
    }

    async function loadPendingNavigation(): Promise<PendingNavigation | null> {
      if (pendingNavigation) return pendingNavigation;
      const raw = await readStoredValue(PENDING_NAV_STORAGE_KEY);
      if (!raw) return null;
      try {
        const parsed = JSON.parse(raw) as PendingNavigation;
        if (!parsed?.targetPath) {
          await writeStoredValue(PENDING_NAV_STORAGE_KEY, null);
          return null;
        }
        if (Date.now() - parsed.createdAt > PENDING_NAV_TTL_MS) {
          await writeStoredValue(PENDING_NAV_STORAGE_KEY, null);
          return null;
        }
        pendingNavigation = parsed;
        return parsed;
      } catch {
        await writeStoredValue(PENDING_NAV_STORAGE_KEY, null);
        return null;
      }
    }

    async function savePendingNavigation(
      value: PendingNavigation | null
    ): Promise<void> {
      pendingNavigation = value;
      if (!value) {
        await writeStoredValue(PENDING_NAV_STORAGE_KEY, null);
        return;
      }
      await writeStoredValue(PENDING_NAV_STORAGE_KEY, JSON.stringify(value));
    }

    function resolveMessageId(
      payload: Record<string, any>,
      action: { notification?: { id?: string | number } }
    ): string | null {
      const raw =
        payload?.['google.message_id'] ??
        payload?.messageId ??
        payload?.id ??
        action?.notification?.id;
      if (raw === null || raw === undefined) return null;
      const value = String(raw).trim();
      return value ? value : null;
    }

    // Дедуплицируем быстрые повторы, чтобы не перетирать более точный маршрут.
    function choosePendingNavigation(
      current: PendingNavigation | null,
      nextValue: PendingNavigation
    ): PendingNavigation {
      if (!current) return nextValue;
      if (
        current.messageId &&
        nextValue.messageId &&
        current.messageId === nextValue.messageId
      ) {
        const currentScore = scoreTargetPath(current.targetPath);
        const nextScore = scoreTargetPath(nextValue.targetPath);
        return nextScore >= currentScore ? nextValue : current;
      }

      const currentScore = scoreTargetPath(current.targetPath);
      const nextScore = scoreTargetPath(nextValue.targetPath);
      if (
        Date.now() - current.createdAt < NAV_DEDUP_WINDOW_MS &&
        currentScore > nextScore
      ) {
        return current;
      }

      return nextValue;
    }

    async function ensureAuthReady(): Promise<void> {
      if (auth.user || auth.isLoggedIn) return;
      try {
        await auth.me();
      } catch {
        // Если авторизация недоступна, не блокируем навигацию.
      }
    }

    // Если уже навигировались недавно, не затираем менее точным переходом.
    function shouldSkipNavigation(
      targetPath: string,
      messageId?: string | null
    ): boolean {
      if (!lastNavigation) return false;
      if (
        messageId &&
        lastNavigation.messageId &&
        messageId === lastNavigation.messageId
      ) {
        return true;
      }
      const age = Date.now() - lastNavigation.at;
      if (age > NAV_DEDUP_WINDOW_MS) return false;
      const currentScore = scoreTargetPath(lastNavigation.path);
      const nextScore = scoreTargetPath(targetPath);
      return currentScore >= nextScore;
    }

    async function enqueueNavigation(
      targetPath: string,
      messageId?: string | null
    ): Promise<void> {
      const nextValue: PendingNavigation = {
        targetPath,
        messageId,
        createdAt: Date.now(),
      };
      const existing = await loadPendingNavigation();
      const selected = choosePendingNavigation(existing, nextValue);
      await savePendingNavigation(selected);
    }

    async function navigateToTarget(
      targetPath: string,
      messageId?: string | null
    ) {
      try {
        const normalized = normalizeTargetPath(targetPath);
        if (shouldSkipNavigation(normalized, messageId)) {
          return;
        }
        await ensureAuthReady();
        await nuxtApp.$router.isReady();
        if (nuxtApp.$router.currentRoute.value.fullPath === normalized) {
          return;
        }
        await nuxtApp.$router.push(normalized);
        await nextTick();

        const expected = nuxtApp.$router.resolve(normalized);
        setTimeout(() => {
          const current = nuxtApp.$router.currentRoute.value;
          if (current.path === expected.path) {
            if (current.fullPath !== expected.fullPath) {
              void nuxtApp.$router.replace(expected.fullPath);
            }
            return;
          }
        }, NAV_RETRY_DELAY_MS);

        lastNavigation = {
          path: normalized,
          messageId,
          at: Date.now(),
        };
      } catch (error) {
        console.error('[PushPlugin] Failed to navigate:', error);
      }
    }

    function resolveNavigationId(
      navigation: NotificationNavigation | null
    ): string | null {
      if (!navigation) return null;
      if ('trackId' in navigation) return navigation.trackId;
      if ('slug' in navigation) return navigation.slug;
      return null;
    }

    async function flushPendingNavigation(): Promise<void> {
      if (isFlushingNavigation) return;
      isFlushingNavigation = true;
      try {
        const pending = await loadPendingNavigation();
        if (!pending) return;
        await navigateToTarget(pending.targetPath, pending.messageId);
        await savePendingNavigation(null);
      } finally {
        isFlushingNavigation = false;
      }
    }

    // TODO: Раскомментировать когда Firebase будет настроен
    // TEMPORARY: Полностью отключаем push уведомления до настройки Firebase
    // console.warn('[PushPlugin] Push notifications temporarily disabled - Firebase not configured');
    // return;

    // Создаём канал уведомлений с высоким приоритетом для Android (O+)
    const ensureHighPriorityChannel = async () => {
      if (!isAndroid) {
        return;
      }
      try {
        await LocalNotifications.createChannel?.({
          id: 'mentai_high',
          name: 'Mentala High Priority',
          description: 'Важные уведомления Mentala',
          importance: 5, // IMPORTANCE_HIGH
          visibility: 1, // VISIBILITY_PUBLIC
          sound: 'default',
          lights: true,
          vibration: true,
        } as any);
      } catch (error) {
        // Канал может быть уже создан; не блокируем инициализацию push.
        console.warn(
          '[PushPlugin] Failed to ensure Android notification channel',
          error
        );
      }
    };

    // ==========================================
    // Обработчики Push уведомлений
    // ==========================================

    try {
      // Успешная регистрация токена
      PushNotifications.addListener('registration', async (token) => {
        const apnsToken = token.value;
        console.log('[PushPlugin] Registration success, token:', apnsToken);

        let effectiveToken = apnsToken;
        if (isIos) {
          const fcmToken = await resolveFcmTokenWithRetry();
          if (!fcmToken) {
            // На iOS без FCM токена пуши работать не будут.
            if (typeof window !== 'undefined' && apnsToken) {
              window.localStorage.setItem(APNS_TOKEN_STORAGE_KEY, apnsToken);
            }
            console.warn(
              '[PushPlugin] FCM token is required on iOS, skipping registration'
            );
            return;
          }
          effectiveToken = fcmToken;
          console.log('[PushPlugin] FCM token resolved for iOS');
        }

        if (!effectiveToken) {
          console.warn('[PushPlugin] Empty push token, skipping registration');
          return;
        }

        // Сохраняем локально
        if (typeof window !== 'undefined') {
          window.localStorage.setItem(PUSH_TOKEN_STORAGE_KEY, effectiveToken);
          if (isIos && apnsToken) {
            window.localStorage.setItem(APNS_TOKEN_STORAGE_KEY, apnsToken);
          }
        }

        // Регистрируем на сервере (только если есть сессия)
        try {
          const sessionToken =
            typeof window !== 'undefined'
              ? window.localStorage.getItem('mentai.session.token')
              : null;
          if (!sessionToken) {
            console.log(
              '[PushPlugin] Skip token registration: no session token yet'
            );
            return;
          }

          const platformHeader: 'ios' | 'android' = isIos ? 'ios' : 'android';

          await nuxtApp.$api('/api/notifications/register-token', {
            method: 'POST',
            body: {
              token: effectiveToken,
              platform: platformHeader,
            },
          });
          console.log('[PushPlugin] Token registered on server');
        } catch (error) {
          console.error(
            '[PushPlugin] Failed to register token on server:',
            error
          );
        }
      });

      // Ошибка регистрации
      PushNotifications.addListener('registrationError', (err) => {
        console.error('[PushPlugin] Registration error:', err);
      });

      // Push получен (приложение на переднем плане)
      PushNotifications.addListener(
        'pushNotificationReceived',
        (notification) => {
          console.log('[PushPlugin] Notification received:', notification);
          // Здесь можно показать локальное уведомление или обновить UI
        }
      );

      // Клик по уведомлению или нажатие на action
      PushNotifications.addListener(
        'pushNotificationActionPerformed',
        async (action) => {
          console.log(
            '[PushPlugin] Action performed:',
            action.actionId,
            action.notification
          );

          const { notification } = action;
          const data = notification.data as Record<string, any> | undefined;
          // На разных платформах данные могут оказаться в root, а не в data.
          // Собираем единый payload с приоритетом data.
          const payload = {
            ...(notification as Record<string, any>),
            ...(data ?? {}),
          } as Record<string, any>;
          const actionId = action.actionId || '';
          const isTap = isTapAction(actionId);
          const navigation = resolveNavigation(payload);
          const messageId = resolveMessageId(payload, action);

          // Трекинг взаимодействия
          if (payload?.slotId) {
            let actionType: InteractionAction = 'dismissed';

            // Определяем тип действия
            if (isTap) {
              actionType = 'open';
            } else if (actionId === 'yes') {
              actionType = 'yes';
            } else if (actionId === 'no') {
              actionType = 'no';
            } else if (actionId === 'later' || actionId.startsWith('snooze:')) {
              actionType = 'later';

              // Если это snooze — отправляем запрос на отложение
              const duration = actionId.replace('snooze:', '') as
                | '15m'
                | '1h'
                | '4h'
                | 'tomorrow';
              try {
                const nuxtApp = useNuxtApp();
                await nuxtApp.$api('/api/notifications/snooze', {
                  method: 'POST',
                  body: {
                    kind: payload.kind || 'therapy',
                    duration,
                    entityKey: payload.entityKey || null,
                  },
                });
                console.log('[PushPlugin] Notification snoozed:', duration);
              } catch (error) {
                console.error('[PushPlugin] Failed to snooze:', error);
              }
            }

            // Отправляем трекинг взаимодействия
            try {
              const nuxtApp = useNuxtApp();
              await nuxtApp.$api('/api/notifications/interaction', {
                method: 'POST',
                body: {
                  slotId: payload.slotId,
                  action: actionType,
                  at: new Date().toISOString(),
                  meta: {
                    platform,
                    actionId,
                    navigationType: navigation?.type ?? null,
                    navigationId: resolveNavigationId(navigation),
                  },
                },
              });
              console.log('[PushPlugin] Interaction tracked:', actionType);
            } catch (error) {
              console.error('[PushPlugin] Failed to track interaction:', error);
            }
          }

          // Навигация выполняется только при системном тапе.
          if (isTap) {
            const deepLink =
              typeof payload?.deepLink === 'string' && payload.deepLink.trim()
                ? payload.deepLink.trim()
                : null;
            const actionPath = resolveActionTargetPath(payload);
            const targetPath =
              deepLink ||
              actionPath ||
              (navigation ? buildPathFromNavigation(navigation) : '/');

            if (!deepLink && !actionPath && !navigation) {
              void logMissingNavigation(payload);
            }

            await enqueueNavigation(targetPath, messageId);
            await flushPendingNavigation();
          }
        }
      );
    } catch (error) {
      console.error('[PushPlugin] Failed to add push listeners:', error);
    }

    // Отложенная инициализация уведомлений после полной загрузки приложения
    const initNotifications = async () => {
      try {
        console.log('[PushPlugin] Starting notification initialization');
        await ensureHighPriorityChannel();

        // Проверка и запрос разрешений для локальных уведомлений
        const localPerm = await LocalNotifications.checkPermissions();
        if (localPerm.display !== 'granted') {
          await LocalNotifications.requestPermissions();
        }

        // Проверка и запрос разрешений
        const permStatus = await PushNotifications.checkPermissions();
        if (permStatus.receive === 'prompt') {
          await PushNotifications.requestPermissions();
        }

        // Пытаемся зарегистрировать push-уведомления
        console.log('[PushPlugin] Attempting to register push notifications');
        await PushNotifications.register();
      } catch (error: any) {
        // Проверяем, что это ошибка инициализации Firebase
        const errorMessage = error?.message || '';
        const isFirebaseError =
          errorMessage.includes('Firebase') ||
          errorMessage.includes('not initialized') ||
          errorMessage.includes('IllegalStateException');

        if (isFirebaseError) {
          console.warn('Push notifications не доступны: Firebase не настроен');
        } else {
          console.error('Error initializing notifications:', error);
        }
      }
    };

    // Используем Nuxt хук для отложенной инициализации после полной загрузки
    nuxtApp.hook('app:mounted', () => {
      console.log(
        '[PushPlugin] App mounted, scheduling notification init in 3s'
      );
      setTimeout(initNotifications, 3000);

      // Восстанавливаем отложенную навигацию, если тап пришёл до инициализации.
      void flushPendingNavigation();

      // Fallback polling отключен - используем только реальные FCM push-уведомления

      console.log(
        '[PushPlugin] Using FCM push notifications (fallback polling disabled)'
      );
    });
  },
});
