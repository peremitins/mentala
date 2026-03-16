import { ref } from 'vue';
import { usePushSettings } from '@/app/composables/usePushSettings';

type PendingEnableHandler = (() => Promise<void>) | null;

export function usePushPermissionGate() {
  const pushSettings = usePushSettings();
  const showPushDeniedModal = ref(false);
  let pendingEnableHandler: PendingEnableHandler = null;

  function setPushDeniedModalOpen(value: boolean) {
    showPushDeniedModal.value = value;
    if (!value) {
      pendingEnableHandler = null;
    }
  }

  /**
   * Проверяет, можно ли включать app-level push.
   * Системный prompt вызывается только по явному действию пользователя.
   */
  async function ensureAppPushEnabled(options?: {
    onGrantedFromSettings?: () => Promise<void>;
  }): Promise<boolean> {
    if (!pushSettings.isNative.value) {
      return true;
    }

    await pushSettings.refreshPermissionStatus();

    if (pushSettings.toggleChecked.value) {
      pendingEnableHandler = null;
      return true;
    }

    if (pushSettings.pushPermissionStatus.value === 'denied') {
      pendingEnableHandler = options?.onGrantedFromSettings ?? null;
      showPushDeniedModal.value = true;
      return false;
    }

    const enabled = await pushSettings.enablePushInApp();
    const permission = (pushSettings.pushPermissionStatus.value ?? null) as
      | 'granted'
      | 'denied'
      | 'prompt'
      | null;

    if (!enabled && permission === 'denied') {
      pendingEnableHandler = options?.onGrantedFromSettings ?? null;
      showPushDeniedModal.value = true;
      return false;
    }

    if (enabled) {
      pendingEnableHandler = null;
    }

    return enabled;
  }

  /**
   * Открывает системные настройки и, если пользователь дал доступ,
   * завершает отложенное действие включения.
   */
  async function openSystemSettings(): Promise<void> {
    if (!pushSettings.isNative.value) {
      return;
    }

    showPushDeniedModal.value = false;
    const deferredEnableHandler = pendingEnableHandler;
    pendingEnableHandler = null;

    const refreshOnReturn = async () => {
      await new Promise((resolve) => setTimeout(resolve, 500));
      await pushSettings.refreshPermissionStatus();

      if (pushSettings.pushPermissionStatus.value !== 'granted') {
        return;
      }

      const enabled = await pushSettings.enablePushInApp();
      if (enabled && deferredEnableHandler) {
        await deferredEnableHandler();
      }
    };

    if (typeof document !== 'undefined') {
      const handler = () => {
        if (document.visibilityState !== 'visible') {
          return;
        }
        document.removeEventListener('visibilitychange', handler);
        void refreshOnReturn();
      };
      document.addEventListener('visibilitychange', handler);
    }

    if (pushSettings.isNative.value) {
      const { App } = await import('@capacitor/app');
      const listener = await App.addListener(
        'appStateChange',
        ({ isActive }) => {
          if (!isActive) {
            return;
          }
          listener.remove();
          void refreshOnReturn();
        }
      );
    }

    await pushSettings.openAppSettings();
  }

  return {
    pushSettings,
    showPushDeniedModal,
    setPushDeniedModalOpen,
    ensureAppPushEnabled,
    openSystemSettings,
  };
}
