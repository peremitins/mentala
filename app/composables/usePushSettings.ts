/**
 * Composable для управления Push-уведомлениями.
 *
 * Три уровня, которые нужно синхронизировать:
 * 1. Системное разрешение (Android/iOS permission)
 * 2. Серверный флаг (pushNotificationsEnabled в users)
 * 3. Локальное состояние UI (переключатель)
 *
 * Формула эффективного состояния:
 * effectivePushEnabled = (permission === 'granted') && (serverFlag === true) && (токен зарегистрирован)
 * Переключатель отображает эффективное состояние (с учётом токена).
 */
import { ref, computed } from 'vue';
import { Capacitor } from '@capacitor/core';
import { PushNotifications } from '@capacitor/push-notifications';
import { useAuthStore } from '@/app/stores/auth';
import { useNotifications } from '@/app/composables/useNotifications';

export type PushPermissionStatus = 'granted' | 'denied' | 'prompt';

const PUSH_TOKEN_STORAGE_KEY = 'pushToken';

export function usePushSettings() {
  const auth = useAuthStore();
  const { checkPermissions, cancelAll } = useNotifications();

  const pushPermissionStatus = ref<PushPermissionStatus | null>(null);
  const storedToken = ref<string | null>(null);
  const isChecking = ref(false);
  const isToggling = ref(false);

  const isNative = computed(
    () =>
      typeof Capacitor !== 'undefined' &&
      (Capacitor.getPlatform() === 'ios' ||
        Capacitor.getPlatform() === 'android')
  );

  /** Эффективное состояние: permission granted И serverFlag true */
  const toggleChecked = computed(() => {
    if (!isNative.value) return false;
    if (pushPermissionStatus.value !== 'granted') return false;
    if (auth.user?.pushNotificationsEnabled === false) return false;
    return Boolean(storedToken.value);
  });

  /** Обновляет локальный кэш токена из localStorage */
  function syncStoredToken() {
    if (typeof window === 'undefined') {
      storedToken.value = null;
      return;
    }
    const raw = window.localStorage.getItem(PUSH_TOKEN_STORAGE_KEY);
    const value = typeof raw === 'string' ? raw.trim() : '';
    storedToken.value = value || null;
  }

  /** Удаляет токен из localStorage и из локального кэша */
  function clearStoredToken() {
    if (typeof window !== 'undefined') {
      window.localStorage.removeItem(PUSH_TOKEN_STORAGE_KEY);
    }
    storedToken.value = null;
  }

  /** Таймаут проверки разрешений, чтобы не зависнуть при недоступности плагинов */
  const CHECK_PERMISSIONS_TIMEOUT_MS = 5000;

  /**
   * Синхронизирует серверный флаг pushNotificationsEnabled.
   * Не делает лишний PATCH, если значение уже совпадает.
   */
  async function syncPushPreference(value: boolean): Promise<boolean> {
    if (auth.user?.pushNotificationsEnabled === value) {
      return true;
    }
    try {
      await useAPI('/api/user/me', {
        method: 'PATCH',
        body: { pushNotificationsEnabled: value },
      });
      if (auth.user) {
        auth.user.pushNotificationsEnabled = value;
      }
      return true;
    } catch (e) {
      console.warn(
        `[usePushSettings] Не удалось синхронизировать pushNotificationsEnabled=${value}:`,
        e
      );
      return false;
    }
  }

  /**
   * Обновляет статус разрешений и состояние переключателя
   */
  async function refreshPermissionStatus() {
    if (!isNative.value) return;

    isChecking.value = true;
    try {
      const perms = await Promise.race([
        checkPermissions(),
        new Promise<{
          push: 'granted' | 'denied';
          local: 'granted' | 'denied';
        }>((_, reject) =>
          setTimeout(
            () => reject(new Error('checkPermissions timeout')),
            CHECK_PERMISSIONS_TIMEOUT_MS
          )
        ),
      ]);
      pushPermissionStatus.value =
        perms.push === 'granted'
          ? 'granted'
          : perms.push === 'denied'
            ? 'denied'
            : 'prompt';

      syncStoredToken();

      // Системное разрешение отклонено — синхронизируем сервер, если нужно.
      if (pushPermissionStatus.value === 'denied') {
        await syncPushPreference(false);
        clearStoredToken();
      }

      // Разрешение есть + сервер разрешает, но токена нет → пробуем восстановить регистрацию.
      if (
        pushPermissionStatus.value === 'granted' &&
        auth.user?.pushNotificationsEnabled !== false &&
        !storedToken.value
      ) {
        try {
          await PushNotifications.register();
          await ensureTokenRegisteredOnServer();
          syncStoredToken();
        } catch (error) {
          console.warn(
            '[usePushSettings] Не удалось восстановить push-токен:',
            error
          );
        }
      }
    } catch (error) {
      console.error('[usePushSettings] Ошибка проверки разрешений:', error);
      pushPermissionStatus.value = 'denied';
      clearStoredToken();
    } finally {
      isChecking.value = false;
    }
  }

  /**
   * Запрашивает системное разрешение на уведомления.
   * @returns true если разрешено, false если отказано
   */
  async function requestPermission(): Promise<boolean> {
    if (!isNative.value) return false;

    try {
      const perm = await PushNotifications.checkPermissions();
      if (perm.receive === 'granted') {
        pushPermissionStatus.value = 'granted';
        return true;
      }
      if (perm.receive === 'denied') {
        pushPermissionStatus.value = 'denied';
        await syncPushPreference(false);
        clearStoredToken();
        return false;
      }

      // prompt — запрашиваем
      const result = await PushNotifications.requestPermissions();
      const granted = result.receive === 'granted';
      pushPermissionStatus.value = granted ? 'granted' : 'denied';
      if (!granted) {
        await syncPushPreference(false);
        clearStoredToken();
        return false;
      }
      await refreshPermissionStatus();
      return granted;
    } catch (error) {
      console.error('[usePushSettings] Ошибка запроса разрешений:', error);
      return false;
    }
  }

  /**
   * Открывает системные настройки приложения (уведомления)
   */
  async function openAppSettings(): Promise<boolean> {
    if (!isNative.value) return false;

    try {
      const { NativeSettings, AndroidSettings, IOSSettings } = await import(
        'capacitor-native-settings'
      );
      const result = await NativeSettings.open({
        optionAndroid: AndroidSettings.AppNotification,
        optionIOS: IOSSettings.App,
      });
      return result?.status ?? false;
    } catch (error) {
      console.error('[usePushSettings] Ошибка открытия настроек:', error);
      return false;
    }
  }

  /**
   * Отключает push на уровне приложения: PATCH в /api/user/me,
   * удаляет токен с сервера, очищает локальный кэш, отменяет локальные уведомления.
   */
  async function disablePushInApp(): Promise<void> {
    if (!isNative.value) return;

    isToggling.value = true;
    try {
      // 1. Сохраняем предпочтение на бэкенде
      await syncPushPreference(false);

      // 2. Удаляем токен с сервера
      const token = storedToken.value;
      if (token) {
        await useAPI('/api/notifications/unregister-token', {
          method: 'POST',
          body: { token },
        });
      }

      clearStoredToken();
      await cancelAll();
      await refreshPermissionStatus();
    } catch (error) {
      console.error('[usePushSettings] Ошибка отключения push:', error);
      throw error;
    } finally {
      isToggling.value = false;
    }
  }

  /**
   * После PushNotifications.register() событие 'registration' приходит асинхронно.
   * Ждём появления токена в localStorage и явно отправляем на сервер.
   * Гарантирует регистрацию при возврате из системных настроек (Android/iOS).
   */
  async function ensureTokenRegisteredOnServer(): Promise<void> {
    if (!isNative.value) return;

    const maxWaitMs = 8000;
    const pollIntervalMs = 400;
    let elapsed = 0;

    while (elapsed < maxWaitMs) {
      const token =
        typeof window !== 'undefined'
          ? window.localStorage.getItem(PUSH_TOKEN_STORAGE_KEY)
          : null;
      if (token?.trim()) {
        storedToken.value = token.trim();
        try {
          const platform = (
            await import('@capacitor/core')
          ).Capacitor.getPlatform();
          if (platform !== 'ios' && platform !== 'android') return;

          await useAPI('/api/notifications/register-token', {
            method: 'POST',
            body: {
              token: token.trim(),
              platform: platform as 'ios' | 'android',
            },
          });
          return;
        } catch (error) {
          console.warn(
            '[usePushSettings] Повторная регистрация токена не удалась:',
            error
          );
        }
      }
      await new Promise((r) => setTimeout(r, pollIntervalMs));
      elapsed += pollIntervalMs;
    }
  }

  /**
   * Включает push: запрашивает разрешение, регистрирует токен, затем PATCH на бэк.
   */
  async function enablePushInApp(): Promise<boolean> {
    if (!isNative.value) return false;

    isToggling.value = true;
    try {
      const granted = await requestPermission();
      if (!granted) {
        return false;
      }

      await PushNotifications.register();
      await ensureTokenRegisteredOnServer();
      syncStoredToken();

      if (!storedToken.value) {
        console.warn(
          '[usePushSettings] Токен push не получен после разрешения, откладываем включение'
        );
        await refreshPermissionStatus();
        return false;
      }

      // Сохраняем предпочтение на бэкенде после успешной регистрации токена
      await syncPushPreference(true);

      await new Promise((r) => setTimeout(r, 500));
      await refreshPermissionStatus();

      return toggleChecked.value;
    } catch (error) {
      console.error('[usePushSettings] Ошибка включения push:', error);
      return false;
    } finally {
      isToggling.value = false;
    }
  }

  return {
    isNative,
    pushPermissionStatus,
    storedToken,
    toggleChecked,
    isChecking,
    isToggling,
    refreshPermissionStatus,
    requestPermission,
    openAppSettings,
    disablePushInApp,
    enablePushInApp,
    ensureTokenRegisteredOnServer,
    syncStoredToken,
    clearStoredToken,
  };
}
