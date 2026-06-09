import { defineNuxtPlugin } from 'nuxt/app';
import {
  Capacitor,
  registerPlugin,
  type PluginListenerHandle,
} from '@capacitor/core';

type NativeSafeAreaInsets = {
  top: number;
  right: number;
  bottom: number;
  left: number;
};

type MentalaSafeAreaPlugin = {
  getInsets(): Promise<NativeSafeAreaInsets>;
  // Форсирует свежий проход WindowInsets + перелейаут WebView на native-слое.
  // Опционален: в старых нативных сборках метода может не быть.
  refreshInsets?(): Promise<NativeSafeAreaInsets>;
  addListener(
    eventName: 'safeAreaChanged',
    listenerFunc: (insets: NativeSafeAreaInsets) => void
  ): Promise<PluginListenerHandle>;
};

// Кастомное событие, которым прикладные части (например app-lock после
// разблокировки) просят пересчитать safe-area. Биометрический BiometricPrompt
// показывается внутри той же Activity и не вызывает onResume, поэтому
// автоматический refresh инсетов после него не срабатывает.
const SAFE_AREA_REFRESH_EVENT = 'mentala:safe-area-refresh';

// Отложенные повторы: системная анимация бара/возврат фокуса после оверлея
// завершаются не мгновенно, поэтому добиваем refresh через несколько кадров.
const REFRESH_RETRY_DELAYS_MS = [0, 150, 400];

const MentalaSafeArea =
  registerPlugin<MentalaSafeAreaPlugin>('MentalaSafeArea');

function canUseNativeSafeAreaBridge() {
  if (typeof window === 'undefined') return false;
  if (!Capacitor.isNativePlatform()) return false;
  if (Capacitor.getPlatform() !== 'android') return false;
  return Capacitor.isPluginAvailable('MentalaSafeArea');
}

function normalizeInset(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.round(value));
}

function applyNativeSafeAreaInsets(insets: NativeSafeAreaInsets) {
  if (typeof document === 'undefined') return;

  const root = document.documentElement;
  root.style.setProperty(
    '--native-safe-area-inset-top',
    `${normalizeInset(insets.top)}px`
  );
  root.style.setProperty(
    '--native-safe-area-inset-right',
    `${normalizeInset(insets.right)}px`
  );
  root.style.setProperty(
    '--native-safe-area-inset-bottom',
    `${normalizeInset(insets.bottom)}px`
  );
  root.style.setProperty(
    '--native-safe-area-inset-left',
    `${normalizeInset(insets.left)}px`
  );
}

export default defineNuxtPlugin(async () => {
  if (!canUseNativeSafeAreaBridge()) {
    return;
  }

  // Форсирует свежее чтение инсетов на native-слое (с фолбэком на getInsets,
  // если refreshInsets недоступен в старой нативной сборке) и переприменяет
  // CSS-переменные.
  async function requestNativeRefresh() {
    try {
      const refresh = MentalaSafeArea.refreshInsets ?? MentalaSafeArea.getInsets;
      const insets = await refresh.call(MentalaSafeArea);
      applyNativeSafeAreaInsets(insets);
    } catch (error) {
      console.warn('[NativeSafeArea] refresh failed:', error);
    }
  }

  // Запускает refresh несколько раз с нарастающей задержкой, чтобы поймать
  // момент после завершения системной анимации/возврата фокуса.
  let scheduledTimers: ReturnType<typeof setTimeout>[] = [];
  function scheduleRefreshBurst() {
    scheduledTimers.forEach((t) => clearTimeout(t));
    scheduledTimers = REFRESH_RETRY_DELAYS_MS.map((delay) =>
      setTimeout(() => void requestNativeRefresh(), delay)
    );
  }

  try {
    const initialInsets = await MentalaSafeArea.getInsets();
    applyNativeSafeAreaInsets(initialInsets);

    await MentalaSafeArea.addListener('safeAreaChanged', (insets) => {
      applyNativeSafeAreaInsets(insets);
    });

    // Триггеры, после которых геометрия вьюпорта могла «протухнуть» без
    // полноценного onResume (системные оверлеи вроде BiometricPrompt,
    // возврат фокуса в WebView, ресайз окна).
    const onVisibility = () => {
      if (document.visibilityState === 'visible') scheduleRefreshBurst();
    };
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('focus', scheduleRefreshBurst);
    window.addEventListener('resize', scheduleRefreshBurst);
    window.addEventListener(SAFE_AREA_REFRESH_EVENT, scheduleRefreshBurst);
  } catch (error) {
    console.warn('[NativeSafeArea] Failed to initialize:', error);
  }
});
