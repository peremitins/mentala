import { ref } from 'vue';
import { usePushSettings } from '@/app/composables/usePushSettings';
import { useWebPush } from '@/app/composables/useWebPush';

type PendingEnableHandler = (() => Promise<void>) | null;
export type WebPushPermissionDialogReason =
  | 'denied'
  | 'unsupported'
  | 'registration_failed';

export function usePushPermissionGate() {
  const pushSettings = usePushSettings();
  const webPush = useWebPush();
  const showPushDeniedModal = ref(false);
  const showWebPushPermissionDialog = ref(false);
  const webPushPermissionDialogReason =
    ref<WebPushPermissionDialogReason>('denied');
  let pendingEnableHandler: PendingEnableHandler = null;

  function setPushDeniedModalOpen(value: boolean) {
    showPushDeniedModal.value = value;
    if (!value) {
      pendingEnableHandler = null;
    }
  }

  function setWebPushPermissionDialogOpen(value: boolean) {
    showWebPushPermissionDialog.value = value;
  }

  function openWebPushPermissionDialog(reason: WebPushPermissionDialogReason) {
    webPushPermissionDialogReason.value = reason;
    showWebPushPermissionDialog.value = true;
  }

  async function ensureWebPushEnabled(): Promise<boolean> {
    if (!webPush.isBrowserCapable() || !(await webPush.isSupported())) {
      openWebPushPermissionDialog('unsupported');
      return false;
    }

    let permission = webPush.getPermissionStatus();

    if (permission === 'default') {
      // В web/PWA этот вызов должен оставаться первым await после клика.
      permission = await webPush.requestPermission();
    }

    if (permission !== 'granted') {
      if (permission === 'denied') {
        openWebPushPermissionDialog('denied');
      }
      return false;
    }

    const result = await webPush.enableWebPushWithPermission();
    if (!result.enabled) {
      openWebPushPermissionDialog(result.reason);
      return false;
    }

    showWebPushPermissionDialog.value = false;
    return true;
  }

  /**
   * Проверяет, можно ли включать app-level push.
   * Системный prompt вызывается только по явному действию пользователя.
   */
  async function ensureAppPushEnabled(options?: {
    onGrantedFromSettings?: () => Promise<void>;
  }): Promise<boolean> {
    if (!pushSettings.isNative.value) {
      pendingEnableHandler = options?.onGrantedFromSettings ?? null;
      const enabled = await ensureWebPushEnabled();
      if (enabled) {
        pendingEnableHandler = null;
      }
      return enabled;
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
    let returnHandled = false;
    let removeVisibilityHandler: (() => void) | null = null;
    let removeAppStateHandler: (() => void) | null = null;

    const refreshOnReturn = async () => {
      if (returnHandled) {
        return;
      }
      returnHandled = true;
      removeVisibilityHandler?.();
      removeVisibilityHandler = null;
      removeAppStateHandler?.();
      removeAppStateHandler = null;

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
        void refreshOnReturn();
      };
      document.addEventListener('visibilitychange', handler);
      removeVisibilityHandler = () => {
        document.removeEventListener('visibilitychange', handler);
      };
    }

    if (pushSettings.isNative.value) {
      const { App } = await import('@capacitor/app');
      const listener = await App.addListener(
        'appStateChange',
        ({ isActive }) => {
          if (!isActive) {
            return;
          }
          void refreshOnReturn();
        }
      );
      removeAppStateHandler = () => {
        listener.remove();
      };
    }

    await pushSettings.openAppSettings();
  }

  return {
    pushSettings,
    showPushDeniedModal,
    showWebPushPermissionDialog,
    webPushPermissionDialogReason,
    setPushDeniedModalOpen,
    setWebPushPermissionDialogOpen,
    ensureAppPushEnabled,
    openSystemSettings,
  };
}
