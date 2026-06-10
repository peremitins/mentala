import { onBeforeUnmount, onMounted, ref } from 'vue';

const MOBILE_LANDSCAPE_QUERY =
  '(max-width: 940px) and (orientation: landscape) and (pointer: coarse)';
const PORTRAIT_ONLY_CLASS = 'app-portrait-only-landscape';

type LockableScreenOrientation = ScreenOrientation & {
  lock?: (orientation: OrientationLockType) => Promise<void>;
};

function getLockableScreenOrientation(): LockableScreenOrientation | null {
  if (typeof window === 'undefined') return null;

  const orientation = window.screen?.orientation as
    | LockableScreenOrientation
    | undefined;

  return typeof orientation?.lock === 'function' ? orientation : null;
}

export async function requestPortraitOrientationLock(): Promise<boolean> {
  const orientation = getLockableScreenOrientation();
  if (!orientation) return false;

  try {
    await orientation.lock('portrait');
    return true;
  } catch (error) {
    // В обычных вкладках Safari/Chrome lock часто запрещён браузером.
    if (import.meta.dev) {
      console.warn('[orientation] Portrait lock request was rejected:', error);
    }
    return false;
  }
}

export function setPortraitOnlyLandscapeFallback(active: boolean): void {
  if (typeof document === 'undefined') return;

  document.documentElement?.classList.toggle(PORTRAIT_ONLY_CLASS, active);
  document.body?.classList.toggle(PORTRAIT_ONLY_CLASS, active);
}

export function usePortraitOrientationLock() {
  const isLandscapeFallbackActive = ref(false);
  const isLockSupported = ref(false);
  let mediaQueryList: MediaQueryList | null = null;
  let removeMediaQueryListener: (() => void) | null = null;

  function syncLandscapeFallback() {
    const active = Boolean(mediaQueryList?.matches);
    isLandscapeFallbackActive.value = active;
    setPortraitOnlyLandscapeFallback(active);
  }

  onMounted(async () => {
    isLockSupported.value = Boolean(getLockableScreenOrientation());

    if (
      typeof window !== 'undefined' &&
      typeof window.matchMedia === 'function'
    ) {
      mediaQueryList = window.matchMedia(MOBILE_LANDSCAPE_QUERY);
      syncLandscapeFallback();

      const listener = () => syncLandscapeFallback();

      if (typeof mediaQueryList.addEventListener === 'function') {
        mediaQueryList.addEventListener('change', listener);
        removeMediaQueryListener = () =>
          mediaQueryList?.removeEventListener('change', listener);
      } else {
        mediaQueryList.addListener(listener);
        removeMediaQueryListener = () =>
          mediaQueryList?.removeListener(listener);
      }
    }

    await requestPortraitOrientationLock();
  });

  onBeforeUnmount(() => {
    removeMediaQueryListener?.();
    removeMediaQueryListener = null;
    mediaQueryList = null;
    isLandscapeFallbackActive.value = false;
    setPortraitOnlyLandscapeFallback(false);
  });

  return {
    isLandscapeFallbackActive,
    isLockSupported,
    requestPortraitOrientationLock,
  };
}
