import { watch } from 'vue';
import { useRoute } from 'nuxt/app';
import { useAppLockStore } from '@/app/stores/appLock';
import { useAuthStore } from '@/app/stores/auth';
import { isAppLockSuppressedRoute } from '@/app/utils/appLockRoutes';

export default defineNuxtPlugin({
  name: 'app-lock',
  dependsOn: ['pinia'],
  setup() {
    const auth = useAuthStore();
    const appLock = useAppLockStore();
    const route = useRoute();

    watch(
      () => ({
        userId: auth.user?.id ?? null,
        path: route.path,
        logoutQuietUntil: auth.logoutQuietUntil,
        isLoggingOut: auth.isLoggingOut,
      }),
      (current, previous) => {
        void syncAppLockUser(
          appLock,
          auth,
          current.userId,
          previous?.userId,
          current.path
        );
      },
      { immediate: true }
    );

    bindWebLifecycle(appLock, auth, route);
    void bindNativeLifecycle(appLock, auth, route);
  },
});

async function syncAppLockUser(
  appLock: ReturnType<typeof useAppLockStore>,
  auth: ReturnType<typeof useAuthStore>,
  userId: number | null,
  previousUserId: number | null | undefined,
  routePath: string
) {
  try {
    if (auth._isLogoutQuietPeriod() || isAppLockSuppressedRoute(routePath)) {
      appLock.clearRuntime();
      return;
    }

    if (previousUserId && previousUserId !== userId) {
      // При смене пользователя очищаем только runtime-состояние. Persisted record
      // остаётся per-user, чтобы повторный вход не превращался в создание нового PIN.
      appLock.clearRuntime();
    }

    await appLock.initializeForUser(userId);
  } catch (error) {
    console.warn('[AppLock] Не удалось синхронизировать пользователя:', error);
    appLock.clearRuntime();
  }
}

function shouldHandleAppLockLifecycle(
  auth: ReturnType<typeof useAuthStore>,
  routePath: string
) {
  return !auth._isLogoutQuietPeriod() && !isAppLockSuppressedRoute(routePath);
}

function bindWebLifecycle(
  appLock: ReturnType<typeof useAppLockStore>,
  auth: ReturnType<typeof useAuthStore>,
  route: ReturnType<typeof useRoute>
) {
  if (typeof document === 'undefined' || typeof window === 'undefined') return;

  document.addEventListener('visibilitychange', () => {
    if (!shouldHandleAppLockLifecycle(auth, route.path)) return;

    if (document.visibilityState === 'hidden') {
      appLock.handleAppHidden();
      return;
    }

    appLock.handleAppVisible();
  });

  window.addEventListener('pagehide', () => {
    if (shouldHandleAppLockLifecycle(auth, route.path)) {
      appLock.handleAppHidden();
    }
  });
  window.addEventListener('pageshow', () => {
    if (shouldHandleAppLockLifecycle(auth, route.path)) {
      appLock.handleAppVisible();
    }
  });
}

async function bindNativeLifecycle(
  appLock: ReturnType<typeof useAppLockStore>,
  auth: ReturnType<typeof useAuthStore>,
  route: ReturnType<typeof useRoute>
) {
  try {
    const { Capacitor } = await import('@capacitor/core');
    if (!Capacitor.isNativePlatform()) return;

    const [{ App }, { PrivacyScreen }] = await Promise.all([
      import('@capacitor/app'),
      import('@capacitor/privacy-screen'),
    ]);

    if (Capacitor.isPluginAvailable('PrivacyScreen')) {
      await PrivacyScreen.enable({
        android: {
          dimBackground: true,
          privacyModeOnActivityHidden: 'dim',
        },
        ios: {
          blurEffect: 'dark',
        },
      });
    }

    await App.addListener('appStateChange', ({ isActive }) => {
      if (!shouldHandleAppLockLifecycle(auth, route.path)) return;

      if (isActive) {
        appLock.handleAppVisible();
        return;
      }

      appLock.handleAppHidden();
    });
  } catch (error) {
    console.warn('[AppLock] Не удалось включить native privacy screen:', error);
  }
}
