/**
 * Composable для управления Push-уведомлениями.
 *
 * Три уровня, которые нужно синхронизировать:
 * 1. Системное разрешение (Android/iOS permission)
 * 2. Регистрация токена текущего native-устройства на сервере
 * 3. Локальное состояние UI (переключатель)
 *
 * Формула эффективного состояния:
 * effectivePushEnabled = (permission === 'granted') && (токен зарегистрирован)
 * Переключатель управляет только текущим native-устройством и не должен
 * отключать fallback на PWA/browser для того же пользователя.
 */
import { computed } from 'vue';
import { Capacitor } from '@capacitor/core';
import { PushNotifications } from '@capacitor/push-notifications';
import { useNotifications } from '@/app/composables/useNotifications';

export type PushPermissionStatus = 'granted' | 'denied' | 'prompt';

const PUSH_TOKEN_STORAGE_KEY = 'pushToken';
const NATIVE_PUSH_DISABLED_KEY = 'mentala.native.push.disabled';

export function usePushSettings() {
  const { checkPermissions, cancelAll } = useNotifications();

  const pushPermissionStatus = useState<PushPermissionStatus | null>(
    'native-push.permission-status',
    () => null
  );
  const storedToken = useState<string | null>('native-push.stored-token', () =>
    import.meta.client
      ? window.localStorage.getItem(PUSH_TOKEN_STORAGE_KEY)?.trim() || null
      : null
  );
  const isPushDisabled = useState<boolean>('native-push.disabled', () =>
    import.meta.client
      ? window.localStorage.getItem(NATIVE_PUSH_DISABLED_KEY) === 'true'
      : false
  );
  const isChecking = useState<boolean>('native-push.is-checking', () => false);
  const isToggling = useState<boolean>('native-push.is-toggling', () => false);

  const isNative = computed(
    () =>
      typeof Capacitor !== 'undefined' &&
      (Capacitor.getPlatform() === 'ios' ||
        Capacitor.getPlatform() === 'android')
  );

  function isPushDisabledInApp(): boolean {
    return isPushDisabled.value;
  }

  function setPushDisabledInApp(value: boolean) {
    isPushDisabled.value = value;
    if (typeof window === 'undefined') return;
    if (value) {
      window.localStorage.setItem(NATIVE_PUSH_DISABLED_KEY, 'true');
    } else {
      window.localStorage.removeItem(NATIVE_PUSH_DISABLED_KEY);
    }
  }

  function syncPushDisabledFlag() {
    if (typeof window === 'undefined') {
      isPushDisabled.value = false;
      return;
    }
    isPushDisabled.value =
      window.localStorage.getItem(NATIVE_PUSH_DISABLED_KEY) === 'true';
  }

  /** Эффективное состояние только для текущего native-устройства */
  const toggleChecked = computed(() => {
    if (!isNative.value) return false;
    if (pushPermissionStatus.value !== 'granted') return false;
    if (isPushDisabledInApp()) return false;
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

  async function unregisterStoredTokenFromServer(): Promise<void> {
    const token = storedToken.value;
    if (!token) return;

    try {
      await useAPI('/api/notifications/unregister-token', {
        method: 'POST',
        body: { token },
      });
    } catch (error) {
      console.warn(
        '[usePushSettings] Не удалось удалить native push-токен с сервера:',
        error
      );
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

      syncPushDisabledFlag();
      syncStoredToken();

      // Разрешение отключено на уровне ОС — токен этого устройства больше нельзя использовать.
      if (pushPermissionStatus.value === 'denied') {
        await unregisterStoredTokenFromServer();
        clearStoredToken();
      }

      // Разрешение есть, но локально токен потерян — пробуем восстановить регистрацию.
      if (
        pushPermissionStatus.value === 'granted' &&
        !storedToken.value &&
        !isPushDisabledInApp()
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
        await unregisterStoredTokenFromServer();
        clearStoredToken();
        return false;
      }

      // prompt — запрашиваем
      const result = await PushNotifications.requestPermissions();
      const granted = result.receive === 'granted';
      pushPermissionStatus.value = granted ? 'granted' : 'denied';
      if (!granted) {
        await unregisterStoredTokenFromServer();
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
   * Отключает push только на текущем native-устройстве:
   * удаляет токен с сервера, очищает локальный кэш, отменяет локальные уведомления.
   */
  async function disablePushInApp(): Promise<void> {
    if (!isNative.value) return;

    isToggling.value = true;
    try {
      setPushDisabledInApp(true);
      // Удаляем только endpoint этого устройства, сохраняя fallback на PWA/browser.
      await unregisterStoredTokenFromServer();

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

          const { resolveNativePushInstallationId } = await import(
            '@/app/utils/pushDeviceIdentity'
          );
          const installationId =
            await resolveNativePushInstallationId(platform);

          await useAPI('/api/notifications/register-token', {
            method: 'POST',
            body: {
              token: token.trim(),
              platform: platform as 'ios' | 'android',
              channelType: 'native',
              platformFamily: platform as 'ios' | 'android',
              ...(installationId ? { installationId } : {}),
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
   * Включает push для текущего native-устройства:
   * запрашивает разрешение и регистрирует токен этого устройства на сервере.
   */
  async function enablePushInApp(): Promise<boolean> {
    if (!isNative.value) return false;

    isToggling.value = true;
    try {
      setPushDisabledInApp(false);
      const granted = await requestPermission();
      if (!granted) {
        return false;
      }

      await PushNotifications.register();
      await ensureTokenRegisteredOnServer();
      syncStoredToken();
      syncPushDisabledFlag();

      if (!storedToken.value) {
        console.warn(
          '[usePushSettings] Токен push не получен после разрешения, откладываем включение'
        );
        await refreshPermissionStatus();
        return false;
      }

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
    isPushDisabledInApp,
  };
}
