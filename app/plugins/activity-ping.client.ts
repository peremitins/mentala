import { Capacitor } from '@capacitor/core';
import { watch } from 'vue';
import { defineNuxtPlugin } from 'nuxt/app';
import { useAuthStore } from '@/app/stores/auth';
import type {
  ActivityPingEventType,
  ActivityPingSourceType,
} from '@/shared/dto/activity';

const FOREGROUND_PING_DEBOUNCE_MS = 60_000;
const HEARTBEAT_PING_INTERVAL_MS = 15 * 60_000;

export default defineNuxtPlugin({
  name: 'activity-ping',
  dependsOn: ['pinia'],
  setup(nuxtApp) {
    if (typeof window === 'undefined') return;

    const auth = useAuthStore();
    let lastForegroundPingAt = 0;
    let startupSentForUserId: number | null = null;
    let isAppActive = true;

    async function sendPing(
      event: ActivityPingEventType,
      options: { force?: boolean; source?: ActivityPingSourceType } = {}
    ) {
      const userId = auth.user?.id;
      if (!userId || auth._isLogoutQuietPeriod()) return;

      const now = Date.now();
      const updatesLastSeen = event !== 'background';
      if (
        updatesLastSeen &&
        !options.force &&
        now - lastForegroundPingAt < FOREGROUND_PING_DEBOUNCE_MS
      ) {
        return;
      }

      if (updatesLastSeen) {
        lastForegroundPingAt = now;
      }

      try {
        await nuxtApp.$api('/api/activity/ping', {
          method: 'POST',
          body: {
            event,
            occurredAt: new Date(now).toISOString(),
            clientVisible: !isDocumentHidden(),
            clientFocused: isDocumentFocused(),
            source: options.source,
          },
        });
      } catch (error) {
        // Activity ping не должен ломать вход в приложение или возврат из фона.
        console.warn('[ActivityPing] Failed to send ping:', {
          event,
          error,
        });
      }
    }

    function sendForegroundPing() {
      void sendPing('foreground');
    }

    function sendBackgroundPing() {
      isAppActive = false;
      void sendPing('background', { force: true });
    }

    function isDocumentHidden() {
      return (
        typeof document !== 'undefined' && document.visibilityState === 'hidden'
      );
    }

    function isDocumentFocused() {
      if (typeof document === 'undefined') return true;
      if (typeof document.hasFocus !== 'function') return true;
      return document.hasFocus();
    }

    async function bindNativeAppStateListener() {
      try {
        const { App } = await import('@capacitor/app');
        await App.addListener('appStateChange', ({ isActive }) => {
          isAppActive = isActive;
          if (isActive) {
            sendForegroundPing();
            return;
          }
          sendBackgroundPing();
        });
      } catch (error) {
        console.warn(
          '[ActivityPing] Failed to bind Capacitor App listener:',
          error
        );
      }
    }

    watch(
      () => auth.user?.id ?? null,
      (userId) => {
        if (!userId) {
          startupSentForUserId = null;
          lastForegroundPingAt = 0;
          return;
        }
        if (startupSentForUserId === userId) return;

        startupSentForUserId = userId;
        void sendPing('startup', { force: true });
      },
      { immediate: true }
    );

    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') {
          isAppActive = true;
          sendForegroundPing();
          return;
        }
        if (document.visibilityState === 'hidden') {
          sendBackgroundPing();
        }
      });
    }

    window.setInterval(() => {
      if (isDocumentHidden() || !isDocumentFocused()) {
        if (isAppActive) {
          sendBackgroundPing();
        }
        return;
      }
      if (!isAppActive) return;

      void sendPing('heartbeat');
    }, HEARTBEAT_PING_INTERVAL_MS);

    window.addEventListener('focus', () => {
      isAppActive = true;
      sendForegroundPing();
    });
    window.addEventListener('blur', sendBackgroundPing);
    window.addEventListener('pagehide', sendBackgroundPing);

    if (
      typeof navigator !== 'undefined' &&
      'serviceWorker' in navigator &&
      typeof navigator.serviceWorker?.addEventListener === 'function'
    ) {
      navigator.serviceWorker.addEventListener('message', (event) => {
        const data = event.data as { type?: string } | null;
        if (data?.type !== 'MENTALA_NOTIFICATION_CLICK') return;
        void sendPing('foreground', {
          force: true,
          source: 'notification_click',
        });
      });
    }

    if (!Capacitor.isNativePlatform()) return;

    void bindNativeAppStateListener();
  },
});
