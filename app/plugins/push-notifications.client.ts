import { Capacitor } from '@capacitor/core';
import { PushNotifications } from '@capacitor/push-notifications';
import { LocalNotifications } from '@capacitor/local-notifications';
import { Preferences } from '@capacitor/preferences';
import { nextTick, watch } from 'vue';
import type {
  InteractionAction,
  NotificationNavigation,
} from '@/shared/dto/notifications';
import {
  buildAppNavigationPath,
  parseAppNavigationTarget,
  resolveGuaranteedTargetFromNotificationContext,
  resolveTargetFromLegacyNotificationNavigation,
  resolveTargetFromLegacySuggestedChipAction,
  type AppNavigationTarget,
} from '@/shared/navigation';
import { useAppNavigation } from '@/app/composables/useAppNavigation';
import { useAuthStore } from '@/app/stores/auth';
import { useMeditationPlayer } from '@/app/composables/useMeditationPlayer';

export default defineNuxtPlugin({
  name: 'push-notifications',
  dependsOn: ['pinia'],
  setup() {
    const nuxtApp = useNuxtApp();
    // Работаем только на мобильных платформах
    const platform = Capacitor.getPlatform();
    if (platform === 'web') return;

    const NON_NAV_ACTIONS = new Set(['yes', 'no', 'later']);
    const PENDING_NAV_STORAGE_KEY = 'mentai.push.pendingNavigation';
    const NATIVE_PUSH_LAUNCH_KEY = 'mentai.push.launchPayload';
    const PENDING_NAV_TTL_MS = 5 * 60 * 1000;
    const NATIVE_PUSH_LAUNCH_TTL_MS = 5 * 60 * 1000;
    const NAV_DEDUP_WINDOW_MS = 12 * 1000;
    const NAV_RETRY_DELAY_MS = 900;
    const AUTH_ENSURE_COOLDOWN_MS = 2500;

    const canUsePreferences = Capacitor.isPluginAvailable('Preferences');
    const auth = useAuthStore();
    const meditationPlayer = useMeditationPlayer();
    const { navigateToTarget: executeAppNavigation } = useAppNavigation();
    const isIos = platform === 'ios';
    const isAndroid = platform === 'android';
    const PUSH_TOKEN_STORAGE_KEY = 'pushToken';
    const APNS_TOKEN_STORAGE_KEY = 'pushToken.apns';
    const NATIVE_PUSH_DISABLED_KEY = 'mentala.native.push.disabled';
    const IOS_FCM_TOKEN_MAX_ATTEMPTS = 6;
    const IOS_FCM_TOKEN_RETRY_DELAY_MS = 1200;

    // В логах храним только короткий префикс токена, чтобы можно было
    // сопоставить устройство с серверной отправкой без утечки полного значения.
    function maskToken(value?: string | null, prefixLength = 24): string {
      const normalized = typeof value === 'string' ? value.trim() : '';
      if (!normalized) return 'empty';
      return `${normalized.slice(0, prefixLength)}...`;
    }

    function isNativePushDisabledInApp(): boolean {
      if (typeof window === 'undefined') return false;
      return window.localStorage.getItem(NATIVE_PUSH_DISABLED_KEY) === 'true';
    }

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

    async function registerTokenOnServer(
      token: string,
      platformHeader: 'ios' | 'android',
      reason: string
    ): Promise<void> {
      if (isNativePushDisabledInApp()) {
        console.log(
          '[PushPlugin] Skip token registration: native push disabled in app',
          {
            platform: platformHeader,
            reason,
          }
        );
        return;
      }

      const sessionToken =
        typeof window !== 'undefined'
          ? window.localStorage.getItem('mentai.session.token')
          : null;

      if (!sessionToken) {
        console.log('[PushPlugin] Skip token registration: no session token', {
          platform: platformHeader,
          reason,
        });
        return;
      }

      await nuxtApp.$api('/api/notifications/register-token', {
        method: 'POST',
        body: {
          token,
          platform: platformHeader,
        },
      });

      console.log('[PushPlugin] Token registered on server:', {
        platform: platformHeader,
        tokenPrefix: maskToken(token),
        reason,
      });
    }

    async function syncCurrentNativeToken(
      reason: string,
      options?: { forceServerSync?: boolean }
    ): Promise<void> {
      const forceServerSync = options?.forceServerSync === true;
      const platformHeader: 'ios' | 'android' = isIos ? 'ios' : 'android';

      let currentToken: string | null = null;

      if (isIos) {
        currentToken = await resolveFcmTokenWithRetry();
      } else if (typeof window !== 'undefined') {
        currentToken = window.localStorage.getItem(PUSH_TOKEN_STORAGE_KEY);
      }

      const normalizedToken =
        typeof currentToken === 'string' ? currentToken.trim() : '';
      if (!normalizedToken) {
        console.warn('[PushPlugin] Native token sync skipped: token is empty', {
          platform: platformHeader,
          reason,
        });
        return;
      }

      if (isNativePushDisabledInApp()) {
        console.log('[PushPlugin] Native token sync skipped: disabled in app', {
          platform: platformHeader,
          reason,
        });
        return;
      }

      const previousToken =
        typeof window !== 'undefined'
          ? window.localStorage.getItem(PUSH_TOKEN_STORAGE_KEY)?.trim() || ''
          : '';

      const tokenChanged = previousToken !== normalizedToken;

      if (typeof window !== 'undefined') {
        window.localStorage.setItem(PUSH_TOKEN_STORAGE_KEY, normalizedToken);
      }

      if (!tokenChanged && !forceServerSync) {
        console.log('[PushPlugin] Native token sync: token unchanged', {
          platform: platformHeader,
          tokenPrefix: maskToken(normalizedToken),
          reason,
        });
        return;
      }

      try {
        await registerTokenOnServer(normalizedToken, platformHeader, reason);
      } catch (error) {
        console.error('[PushPlugin] Failed to sync native token on server:', {
          platform: platformHeader,
          tokenPrefix: maskToken(normalizedToken),
          reason,
          error,
        });
      }
    }

    // Сохраняем отложенную навигацию, чтобы не потерять тап на холодном старте.
    type PendingNavigation = {
      targetPath: string;
      target?: AppNavigationTarget | null;
      messageId?: string | null;
      createdAt: number;
    };

    let pendingNavigation: PendingNavigation | null = null;
    let isFlushingNavigation = false;
    let navigationRetryTimer: ReturnType<typeof setTimeout> | null = null;
    let authEnsureInFlight: Promise<void> | null = null;
    let lastAuthEnsureAt = 0;
    let lastNavigation: {
      path: string;
      messageId?: string | null;
      at: number;
    } | null = null;

    function clearNavigationRetryTimer() {
      if (!navigationRetryTimer) return;
      clearTimeout(navigationRetryTimer);
      navigationRetryTimer = null;
    }

    function schedulePendingNavigationRetry(delayMs = NAV_RETRY_DELAY_MS) {
      if (navigationRetryTimer) return;
      navigationRetryTimer = setTimeout(() => {
        navigationRetryTimer = null;
        void flushPendingNavigation();
      }, delayMs);
    }

    function isTapAction(actionId?: string | null): boolean {
      // Считаем тапом все, что не является action-кнопкой snooze/yes/no/later.
      if (!actionId) return true;
      if (NON_NAV_ACTIONS.has(actionId)) return false;
      if (actionId.startsWith('snooze:')) return false;
      return true;
    }

    function readPayloadString(value: unknown): string | null {
      if (typeof value !== 'string') return null;
      const trimmed = value.trim();
      return trimmed ? trimmed : null;
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

      if (type === 'gratitude_diary') {
        return { type: 'gratitude_diary' };
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

      if (navType === 'gratitude_diary') {
        return { type: 'gratitude_diary' };
      }

      return null;
    }

    function resolveGuaranteedPayloadTarget(
      payload?: Record<string, any>
    ): AppNavigationTarget | null {
      if (!payload) return null;

      return resolveGuaranteedTargetFromNotificationContext({
        title: readPayloadString(payload.title),
        entityKey: readPayloadString(payload.entityKey),
        entityDisplayName: readPayloadString(payload.entityDisplayName),
      });
    }

    function resolveNavigationTarget(
      payload?: Record<string, any>
    ): AppNavigationTarget | null {
      if (!payload) return null;

      // Для уведомлений дневника благодарности контекст темы важнее
      // устаревшего navigationTarget=home в уже сохранённых слотах.
      const guaranteedTarget = resolveGuaranteedPayloadTarget(payload);
      if (guaranteedTarget) {
        return guaranteedTarget;
      }

      if (
        typeof payload.navigationTarget === 'string' &&
        payload.navigationTarget.trim()
      ) {
        try {
          const parsed = JSON.parse(payload.navigationTarget) as unknown;
          const normalized = parseAppNavigationTarget(parsed);
          if (normalized) return normalized;
        } catch {
          // Ошибки парсинга не блокируют legacy fallback.
        }
      }

      if (
        payload.navigationTarget &&
        typeof payload.navigationTarget === 'object'
      ) {
        const normalized = parseAppNavigationTarget(payload.navigationTarget);
        if (normalized) return normalized;
      }

      const navigation = resolveNavigation(payload);
      if (navigation) {
        return resolveTargetFromLegacyNotificationNavigation(navigation);
      }

      const actionParams =
        payload.actionParams && typeof payload.actionParams === 'object'
          ? payload.actionParams
          : payload;

      return resolveTargetFromLegacySuggestedChipAction({
        action: typeof payload.action === 'string' ? payload.action : undefined,
        params: {
          trackId:
            typeof actionParams.trackId === 'string'
              ? actionParams.trackId
              : undefined,
          collectionId:
            typeof actionParams.collectionId === 'string'
              ? actionParams.collectionId
              : undefined,
          practiceId:
            typeof actionParams.practiceId === 'string'
              ? actionParams.practiceId
              : typeof actionParams.slug === 'string'
                ? actionParams.slug
                : undefined,
          groupKey:
            typeof actionParams.groupKey === 'string'
              ? actionParams.groupKey
              : undefined,
          sosEntry:
            typeof actionParams.sosEntry === 'string'
              ? actionParams.sosEntry
              : undefined,
          topicKey:
            typeof actionParams.topicKey === 'string'
              ? actionParams.topicKey
              : undefined,
          habitKey:
            typeof actionParams.habitKey === 'string'
              ? actionParams.habitKey
              : undefined,
        },
      });
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

      if (
        action === 'open_meditations' ||
        action === 'open_meditations_collection'
      ) {
        return '/meditations';
      }

      if (action === 'open_meditation_track') {
        const trackId =
          readPayloadString(payload.trackId) ||
          readPayloadString(payload.navId) ||
          readPayloadString(payload.actionParams?.trackId);
        return trackId
          ? `/meditations?trackId=${encodeURIComponent(trackId)}`
          : '/meditations';
      }

      if (action === 'open_breath_practices') {
        return '/breath-practices';
      }

      if (action === 'open_breath_practice') {
        const practiceId =
          readPayloadString(payload.practiceId) ||
          readPayloadString(payload.slug) ||
          readPayloadString(payload.navId) ||
          readPayloadString(payload.actionParams?.practiceId);
        return practiceId
          ? `/breath-practices/${encodeURIComponent(practiceId)}`
          : '/breath-practices';
      }

      if (action === 'open_home') {
        return '/';
      }

      if (action === 'open_gratitude_diary') {
        return '/practices/gratitude-diary';
      }

      if (action === 'open_therapy') {
        return '/therapy';
      }

      if (action === 'open_therapy_topic') {
        const topicKey =
          readPayloadString(payload.topicKey) ||
          readPayloadString(payload.actionParams?.topicKey);
        return topicKey
          ? `/therapy/${encodeURIComponent(topicKey)}`
          : '/therapy';
      }

      if (action === 'open_habits') {
        return '/habits';
      }

      if (action === 'open_habit') {
        const habitKey =
          readPayloadString(payload.habitKey) ||
          readPayloadString(payload.actionParams?.habitKey);
        return habitKey ? `/habits/${encodeURIComponent(habitKey)}` : '/habits';
      }

      if (action === 'open_sos') {
        const entry =
          readPayloadString(payload.sosEntry) ||
          readPayloadString(payload.actionParams?.sosEntry);
        return entry
          ? `/quick-help?entry=${encodeURIComponent(entry)}`
          : '/quick-help';
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
        navigationTarget: payload?.navigationTarget ?? null,
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
      return buildAppNavigationPath(
        resolveTargetFromLegacyNotificationNavigation(navigation)
      );
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
          pendingNavigation = null;
          await writeStoredValue(PENDING_NAV_STORAGE_KEY, null);
          return null;
        }
        if (Date.now() - parsed.createdAt > PENDING_NAV_TTL_MS) {
          pendingNavigation = null;
          await writeStoredValue(PENDING_NAV_STORAGE_KEY, null);
          return null;
        }
        pendingNavigation = parsed;
        return parsed;
      } catch {
        pendingNavigation = null;
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
      action?: { notification?: { id?: string | number } }
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

    function normalizeNotificationPayload(
      notification?: Record<string, any> | null
    ): Record<string, any> {
      if (!notification || typeof notification !== 'object') {
        return {};
      }

      const root = { ...notification };
      const data =
        notification.data && typeof notification.data === 'object'
          ? notification.data
          : null;
      const extra =
        notification.extra && typeof notification.extra === 'object'
          ? notification.extra
          : null;

      return {
        ...root,
        ...(data ?? {}),
        ...(extra ?? {}),
      };
    }

    async function handleNotificationAction(args: {
      actionId?: string | null;
      notification?: Record<string, any> | null;
      payload?: Record<string, any> | null;
      messageId?: string | null;
    }): Promise<void> {
      const notification = args.notification ?? undefined;
      const payload =
        args.payload ?? normalizeNotificationPayload(notification);
      const actionId = args.actionId || '';
      const isTap = isTapAction(actionId);
      const navigation = resolveNavigation(payload);
      const messageId =
        args.messageId ?? resolveMessageId(payload, { notification });

      if (payload?.slotId) {
        let actionType: InteractionAction = 'dismissed';

        if (isTap) {
          actionType = 'open';
        } else if (actionId === 'yes') {
          actionType = 'yes';
        } else if (actionId === 'no') {
          actionType = 'no';
        } else if (actionId === 'later' || actionId.startsWith('snooze:')) {
          actionType = 'later';

          if (actionId.startsWith('snooze:')) {
            const duration = actionId.replace('snooze:', '') as
              | '15m'
              | '1h'
              | '4h'
              | 'tomorrow';
            try {
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
        }

        try {
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

      if (!isTap) return;

      try {
        await meditationPlayer.registerUserGesture();
      } catch (error) {
        console.warn(
          '[PushPlugin] Failed to register gesture for meditation audio:',
          error
        );
      }

      const navigationTarget = resolveNavigationTarget(payload);
      const deepLink =
        typeof payload?.deepLink === 'string' && payload.deepLink.trim()
          ? payload.deepLink.trim()
          : null;
      const actionPath = resolveActionTargetPath(payload);
      const targetPath =
        (navigationTarget ? buildAppNavigationPath(navigationTarget) : null) ||
        deepLink ||
        actionPath ||
        (navigation ? buildPathFromNavigation(navigation) : '/');

      if (!deepLink && !actionPath && !navigation) {
        void logMissingNavigation(payload);
      }

      await enqueueNavigation(targetPath, messageId, navigationTarget);
      await flushPendingNavigation();
    }

    async function consumeNativeLaunchNavigation(): Promise<void> {
      const raw = await readStoredValue(NATIVE_PUSH_LAUNCH_KEY);
      if (!raw) return;
      // Потребляем launch-payload один раз: дальнейшие ретраи делает pending queue.
      await writeStoredValue(NATIVE_PUSH_LAUNCH_KEY, null);

      let payload: Record<string, any> | null = null;
      try {
        const parsed = JSON.parse(raw) as Record<string, any>;
        payload = parsed && typeof parsed === 'object' ? parsed : null;
      } catch {
        return;
      }
      if (!payload) return;

      const createdAt = Number(payload.createdAt || 0);
      if (
        Number.isFinite(createdAt) &&
        createdAt > 0 &&
        Date.now() - createdAt > NATIVE_PUSH_LAUNCH_TTL_MS
      ) {
        return;
      }

      const navigationTarget = resolveNavigationTarget(payload);
      const navigation = resolveNavigation(payload);
      const deepLink =
        typeof payload.deepLink === 'string' && payload.deepLink.trim()
          ? payload.deepLink.trim()
          : null;
      const actionPath = resolveActionTargetPath(payload);
      const targetPath =
        (navigationTarget ? buildAppNavigationPath(navigationTarget) : null) ||
        deepLink ||
        actionPath ||
        (navigation ? buildPathFromNavigation(navigation) : null);
      if (!targetPath) return;

      const messageId = resolveMessageId(payload, {});
      // Для cold/warm старта из push заранее фиксируем жест,
      // чтобы автозапуск трека не терялся на iOS/WebAudio.
      try {
        await meditationPlayer.registerUserGesture();
      } catch (error) {
        console.warn(
          '[PushPlugin] Failed to register gesture from native launch payload:',
          error
        );
      }
      await enqueueNavigation(targetPath, messageId, navigationTarget);
      await flushPendingNavigation();
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
      if (authEnsureInFlight) {
        await authEnsureInFlight;
        return;
      }
      const now = Date.now();
      if (now - lastAuthEnsureAt < AUTH_ENSURE_COOLDOWN_MS) {
        return;
      }
      lastAuthEnsureAt = now;
      authEnsureInFlight = (async () => {
        try {
          await auth.me();
        } catch {
          // Если авторизация недоступна, не блокируем навигацию.
        } finally {
          authEnsureInFlight = null;
        }
      })();
      await authEnsureInFlight;
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
      const currentPath = normalizeTargetPath(lastNavigation.path);
      const nextPath = normalizeTargetPath(targetPath);
      return currentPath === nextPath;
    }

    async function enqueueNavigation(
      targetPath: string,
      messageId?: string | null,
      target?: AppNavigationTarget | null
    ): Promise<void> {
      const nextValue: PendingNavigation = {
        targetPath,
        target: target ?? null,
        messageId,
        createdAt: Date.now(),
      };
      const existing = await loadPendingNavigation();
      const selected = choosePendingNavigation(existing, nextValue);
      await savePendingNavigation(selected);
    }

    async function navigateToTarget(
      targetPath: string,
      target?: AppNavigationTarget | null,
      messageId?: string | null
    ): Promise<boolean> {
      try {
        const normalized = normalizeTargetPath(targetPath);
        if (shouldSkipNavigation(normalized, messageId)) {
          return true;
        }
        await ensureAuthReady();
        await nuxtApp.$router.isReady();

        if (target) {
          const result = await executeAppNavigation(
            {
              target,
              source: 'push',
              entryPoint: 'push_notification_tap',
              sourceMeta: {
                messageId: messageId ?? null,
              },
            },
            {
              replace: false,
            }
          );
          if (result.status === 'opened' || result.status === 'paywall') {
            lastNavigation = {
              path: normalized,
              messageId,
              at: Date.now(),
            };
            return true;
          }
          return false;
        }

        const expected = nuxtApp.$router.resolve(normalized);
        const expectedFullPath = expected.fullPath;
        if (nuxtApp.$router.currentRoute.value.fullPath === expectedFullPath) {
          lastNavigation = {
            path: expectedFullPath,
            messageId,
            at: Date.now(),
          };
          return true;
        }
        await nuxtApp.$router.push(expectedFullPath);
        await nextTick();
        if (nuxtApp.$router.currentRoute.value.fullPath !== expectedFullPath) {
          await wait(NAV_RETRY_DELAY_MS);
          await nuxtApp.$router.replace(expectedFullPath);
          await nextTick();
        }
        if (nuxtApp.$router.currentRoute.value.fullPath !== expectedFullPath) {
          return false;
        }

        lastNavigation = {
          path: expectedFullPath,
          messageId,
          at: Date.now(),
        };
        return true;
      } catch (error) {
        console.error('[PushPlugin] Failed to navigate:', error);
        return false;
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
        if (!pending) {
          clearNavigationRetryTimer();
          return;
        }
        const success = await navigateToTarget(
          pending.targetPath,
          pending.target,
          pending.messageId
        );
        if (success) {
          clearNavigationRetryTimer();
          await savePendingNavigation(null);
          return;
        }
        // В случае гонок middleware/инициализации не теряем pending-навигацию:
        // повторяем до TTL записи.
        const retryDelay =
          auth.user || auth.isLoggedIn
            ? NAV_RETRY_DELAY_MS
            : NAV_RETRY_DELAY_MS * 4;
        schedulePendingNavigationRetry(retryDelay);
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
          name: 'Ментала High Priority',
          description: 'Важные уведомления Ментала',
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
        console.log('[PushPlugin] Registration success (APNs/native token):', {
          platform,
          tokenPrefix: maskToken(apnsToken),
        });

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
          console.log('[PushPlugin] FCM token resolved for iOS:', {
            apnsTokenPrefix: maskToken(apnsToken),
            fcmTokenPrefix: maskToken(fcmToken),
          });
        }

        if (!effectiveToken) {
          console.warn('[PushPlugin] Empty push token, skipping registration');
          return;
        }

        if (isNativePushDisabledInApp()) {
          console.log(
            '[PushPlugin] Registration event ignored: native push disabled in app',
            {
              platform,
              tokenPrefix: maskToken(effectiveToken),
            }
          );
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
          const platformHeader: 'ios' | 'android' = isIos ? 'ios' : 'android';
          await registerTokenOnServer(
            effectiveToken,
            platformHeader,
            'registration_event'
          );
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

      // Push получен в активном приложении.
      // На Android системное уведомление уже строится нативным FCM-сервисом.
      // На iOS полагаемся на штатный native foreground-показ Capacitor.
      PushNotifications.addListener(
        'pushNotificationReceived',
        (notification) => {
          console.log('[PushPlugin] Notification received:', notification);
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
          const payload = normalizeNotificationPayload(
            notification as Record<string, any>
          );
          const messageId = resolveMessageId(payload, action);

          await handleNotificationAction({
            actionId: action.actionId,
            notification: notification as Record<string, any>,
            payload,
            messageId,
          });
        }
      );
    } catch (error) {
      console.error('[PushPlugin] Failed to add push listeners:', error);
    }

    async function trySyncDeniedToServer(): Promise<void> {
      const sessionToken =
        typeof window !== 'undefined'
          ? localStorage.getItem('mentai.session.token')
          : null;
      if (!sessionToken) return;
      try {
        const permStatus = await PushNotifications.checkPermissions();
        if (permStatus.receive !== 'denied') return;

        const token =
          typeof window !== 'undefined'
            ? window.localStorage.getItem(PUSH_TOKEN_STORAGE_KEY)?.trim() || ''
            : '';

        if (!token) return;

        try {
          await nuxtApp.$api('/api/notifications/unregister-token', {
            method: 'POST',
            body: { token },
          });
          if (typeof window !== 'undefined') {
            window.localStorage.removeItem(PUSH_TOKEN_STORAGE_KEY);
          }
        } catch (error) {
          console.warn(
            '[PushPlugin] Failed to unregister denied native token:',
            error
          );
        }
      } catch {
        // ignore
      }
    }

    // После старта приложения не показываем системный prompt автоматически.
    // Разрешение запрашивается только по явному действию пользователя из UI.
    // Здесь делаем только тихую синхронизацию denied/granted состояния.
    const initNotifications = async () => {
      try {
        console.log('[PushPlugin] Starting notification initialization');
        await ensureHighPriorityChannel();

        const permStatus = await PushNotifications.checkPermissions();

        if (permStatus.receive === 'denied') {
          await trySyncDeniedToServer();
          return;
        }

        if (permStatus.receive !== 'granted') {
          return;
        }

        if (isNativePushDisabledInApp()) {
          console.log(
            '[PushPlugin] Init register skipped: native push disabled in app'
          );
          return;
        }

        console.log('[PushPlugin] Permission granted, registering push');
        await PushNotifications.register();

        // Для iOS FCM token может стабилизироваться не в тот же тик, что APNs registration.
        // Поэтому повторно синхронизируем актуальный token после старта.
        if (isIos) {
          setTimeout(() => {
            void syncCurrentNativeToken('post_register_delayed_sync', {
              forceServerSync: true,
            });
          }, 10_000);
        }
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

      // Даже если registration event был до входа в аккаунт или токен успел обновиться позже,
      // при старте ещё раз выравниваем текущее native token состояние с backend.
      setTimeout(() => {
        void syncCurrentNativeToken('app_mounted_delayed_sync', {
          forceServerSync: false,
        });
      }, 12_000);

      // Восстанавливаем launch-переход из Android intent (холодный старт),
      // затем пробуем pending-навигацию из JS-очереди.
      void consumeNativeLaunchNavigation();

      // Восстанавливаем отложенную навигацию, если тап пришёл до инициализации.
      void flushPendingNavigation();
      setTimeout(() => {
        void flushPendingNavigation();
      }, NAV_RETRY_DELAY_MS);
      setTimeout(() => {
        void flushPendingNavigation();
      }, NAV_RETRY_DELAY_MS * 3);

      // На warm-start после тапа по push событие action иногда не приходит в JS.
      // Поэтому повторно читаем native launch payload при возврате в active.
      import('@capacitor/app')
        .then(({ App }) => {
          App.addListener('appStateChange', ({ isActive }) => {
            if (!isActive) return;
            void consumeNativeLaunchNavigation();
            void flushPendingNavigation();
            void syncCurrentNativeToken('app_became_active', {
              forceServerSync: false,
            });
            void trySyncDeniedToServer();
          });
        })
        .catch((error) => {
          console.warn(
            '[PushPlugin] Failed to bind appState listener for push fallback:',
            error
          );
        });

      // Fallback polling отключен - используем только реальные FCM push-уведомления

      console.log(
        '[PushPlugin] Using FCM push notifications (fallback polling disabled)'
      );
    });

    // Если переход был перехвачен middleware/инициализацией, повторяем pending-навигацию.
    nuxtApp.$router.afterEach(() => {
      void flushPendingNavigation();
    });

    /** Синхронизация при логине: если отказали до входа или PATCH не прошёл — повторяем при появлении сессии */
    function syncPushDeniedOnLogin() {
      void trySyncDeniedToServer();
    }

    watch(
      () => auth.isLoggedIn,
      (loggedIn) => {
        if (!loggedIn) return;
        void syncPushDeniedOnLogin();
        void syncCurrentNativeToken('login_sync', {
          forceServerSync: true,
        });
        void flushPendingNavigation();
      },
      { immediate: true }
    );
  },
});
