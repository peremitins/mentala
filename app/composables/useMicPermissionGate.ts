import { computed, ref } from 'vue';
import { Capacitor } from '@capacitor/core';
import { isDocumentAvailable } from '@/app/utils/document';

export type MicPermissionState = 'granted' | 'denied' | 'prompt' | null;
export type MicPermissionDialogMode = 'native' | 'browser';

const WEB_MIC_DENIED_STORAGE_KEY = 'mentai.mic.web.denied';
const showMicDeniedModal = ref(false);

function isNativePlatform(): boolean {
  const platform = Capacitor.getPlatform();
  return platform === 'ios' || platform === 'android';
}

function isNativeIosPlatform(): boolean {
  return Capacitor.getPlatform() === 'ios';
}

function resolveStandalonePwa(): boolean {
  if (!isDocumentAvailable() || typeof window === 'undefined') {
    return false;
  }

  return (
    (window.navigator as Navigator & { standalone?: boolean }).standalone ===
      true || window.matchMedia('(display-mode: standalone)').matches
  );
}

function setWebDeniedFlag(value: boolean): void {
  if (typeof window === 'undefined') {
    return;
  }

  try {
    if (value) {
      window.localStorage.setItem(WEB_MIC_DENIED_STORAGE_KEY, '1');
      return;
    }

    window.localStorage.removeItem(WEB_MIC_DENIED_STORAGE_KEY);
  } catch (error) {
    console.warn('[MicPermissionGate] Failed to persist state:', error);
  }
}

function hasWebDeniedFlag(): boolean {
  if (typeof window === 'undefined') {
    return false;
  }

  try {
    return window.localStorage.getItem(WEB_MIC_DENIED_STORAGE_KEY) === '1';
  } catch {
    return false;
  }
}

function normalizePermissionState(value: unknown): MicPermissionState {
  return value === 'granted' || value === 'denied' || value === 'prompt'
    ? value
    : null;
}

function buildErrorSignature(error: unknown): string {
  const errorName = String((error as any)?.name || '');
  const errorMessage = String((error as any)?.message || '');

  return `${errorName} ${errorMessage}`.toLowerCase();
}

function isWebPermissionDeniedError(error: unknown): boolean {
  const normalized = buildErrorSignature(error);

  return (
    normalized.includes('notallowederror') ||
    normalized.includes('permission denied') ||
    normalized.includes('permission dismissed') ||
    normalized.includes('service-not-allowed')
  );
}

function isNativePermissionDeniedError(error: unknown): boolean {
  const errorCode = String((error as any)?.code || '');
  const normalized = buildErrorSignature(error);

  return (
    errorCode === 'PERMISSION_DENIED' ||
    normalized.includes('permission denied') ||
    normalized.includes('microphone permission denied') ||
    normalized.includes('user denied access to microphone') ||
    normalized.includes('user denied access to speech recognition') ||
    normalized.includes('missing permission')
  );
}

async function queryBrowserMicrophonePermission(): Promise<MicPermissionState> {
  if (typeof navigator === 'undefined') {
    return null;
  }

  if (!navigator.permissions?.query) {
    return hasWebDeniedFlag() ? 'denied' : null;
  }

  try {
    const status = await navigator.permissions.query({
      name: 'microphone' as PermissionName,
    });
    const state = normalizePermissionState(status.state);

    if (state === 'granted') {
      setWebDeniedFlag(false);
    } else if (state === 'denied') {
      setWebDeniedFlag(true);
    }

    return state;
  } catch {
    return hasWebDeniedFlag() ? 'denied' : null;
  }
}

export function useMicPermissionGate() {
  const dialogMode = computed<MicPermissionDialogMode>(() =>
    isNativePlatform() ? 'native' : 'browser'
  );
  const isStandalonePwa = computed(() => resolveStandalonePwa());

  function setMicDeniedModalOpen(value: boolean): void {
    showMicDeniedModal.value = value;
  }

  async function getPermissionState(): Promise<MicPermissionState> {
    if (isNativePlatform()) {
      return null;
    }

    return await queryBrowserMicrophonePermission();
  }

  async function ensureCanStartCapture(): Promise<boolean> {
    const state = await getPermissionState();
    if (state === 'denied') {
      showMicDeniedModal.value = true;
      return false;
    }

    return true;
  }

  async function handleStartFailure(
    error: unknown,
    options?: {
      priorPermissionState?: MicPermissionState;
    }
  ): Promise<boolean> {
    if (isNativePlatform()) {
      if ((error as any)?.code === 'PERMISSION_DENIED_FIRST') {
        // На iOS после системного prompt отказ может прилетать в разных формах
        // (speech plugin / WKWebView getUserMedia), поэтому всегда даём
        // fallback-инструкцию, даже если это первый отказ в текущей попытке.
        if (isNativeIosPlatform()) {
          showMicDeniedModal.value = true;
          return true;
        }

        return false;
      }

      if (
        isNativePermissionDeniedError(error) ||
        (isNativeIosPlatform() && isWebPermissionDeniedError(error))
      ) {
        showMicDeniedModal.value = true;
        return true;
      }

      return false;
    }

    if (!isWebPermissionDeniedError(error)) {
      return false;
    }

    const hadDeniedFlag = hasWebDeniedFlag();
    const currentState = await queryBrowserMicrophonePermission();

    if (currentState === 'granted') {
      setWebDeniedFlag(false);
      return false;
    }

    setWebDeniedFlag(true);

    if (
      options?.priorPermissionState === 'denied' ||
      hadDeniedFlag ||
      currentState === null
    ) {
      showMicDeniedModal.value = true;
      return true;
    }

    return false;
  }

  async function openMicSettings(): Promise<void> {
    showMicDeniedModal.value = false;

    if (!isNativePlatform()) {
      return;
    }

    const { setPersistentItem } = await import('@/app/utils/persistentStorage');
    const currentPath =
      typeof window !== 'undefined'
        ? window.location.pathname + window.location.search
        : '/';
    await setPersistentItem(
      'mentai.settings.returnRoute',
      JSON.stringify({
        path: currentPath,
        ts: Date.now(),
      })
    );

    const { NativeSettings, AndroidSettings, IOSSettings } = await import(
      'capacitor-native-settings'
    );
    await NativeSettings.open({
      optionAndroid: AndroidSettings.ApplicationDetails,
      optionIOS: IOSSettings.App,
    });
  }

  return {
    showMicDeniedModal,
    dialogMode,
    isStandalonePwa,
    setMicDeniedModalOpen,
    getPermissionState,
    ensureCanStartCapture,
    handleStartFailure,
    openMicSettings,
  };
}
