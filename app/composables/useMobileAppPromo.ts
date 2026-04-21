import { Capacitor } from '@capacitor/core';
import { openExternalBrowser } from '@/app/utils/openExternalBrowser';

const LEGACY_DISMISSED_KEY = 'mentala.pwa.install_show_after';
const IOS_GUIDE_DISMISSED_KEY = 'mentala.mobile-promo.ios-pwa.show-after';

const ANDROID_APP_PACKAGE_ID = 'com.mentala.app';
const GOOGLE_PLAY_URL = `https://play.google.com/store/apps/details?id=${ANDROID_APP_PACKAGE_ID}`;
const GOOGLE_PLAY_INTENT_URL = `intent://details?id=${ANDROID_APP_PACKAGE_ID}#Intent;scheme=market;package=com.android.vending;S.browser_fallback_url=${encodeURIComponent(
  GOOGLE_PLAY_URL
)};end`;
const ANDROID_APP_OPEN_URL = 'mentala://open?source=android_web_promo';

const PROMO_BLOCKED_PATH_PREFIXES = [
  '/subscription',
  '/payment-success',
  '/auth/external-session/consume',
] as const;

type MobilePromoKind = 'none' | 'ios-pwa' | 'android-app';
type PromoDismissKind = Exclude<MobilePromoKind, 'none'>;
type AndroidRelatedAppStatus =
  | 'unknown'
  | 'installed'
  | 'not-installed'
  | 'unsupported';
type AndroidPromoVariant = 'open-app' | 'google-play';

interface RelatedAppInfo {
  id?: string;
  platform?: string;
  url?: string;
  version?: string;
}

interface NavigatorWithInstalledRelatedApps extends Navigator {
  getInstalledRelatedApps?: () => Promise<RelatedAppInfo[]>;
}

let androidRelatedAppStatusCache: AndroidRelatedAppStatus | null = null;
let androidRelatedAppCheckPromise: Promise<AndroidRelatedAppStatus> | null =
  null;
let isAndroidPromoDismissedForRuntime = false;

function getNext10am(): number {
  const now = new Date();
  const next = new Date(now);
  next.setHours(10, 0, 0, 0);
  if (now >= next) next.setDate(next.getDate() + 1);
  return next.getTime();
}

function normalizePathname(pathname: string): string {
  const normalized = String(pathname || '').trim();
  if (!normalized || normalized === '/') return '/';
  return normalized.replace(/\/+$/, '');
}

function matchesPathPrefix(pathname: string, prefix: string): boolean {
  return pathname === prefix || pathname.startsWith(`${prefix}/`);
}

function getDismissKey(): string {
  return IOS_GUIDE_DISMISSED_KEY;
}

function isNativeCapacitorRuntime(): boolean {
  return Capacitor.isNativePlatform();
}

function detectIos(): boolean {
  if (typeof navigator === 'undefined') return false;

  const ua = navigator.userAgent.toLowerCase();
  return (
    /iphone|ipad|ipod/.test(ua) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
  );
}

function isSafariOnIos(): boolean {
  if (typeof navigator === 'undefined') return false;

  const ua = navigator.userAgent;
  return /Safari/.test(ua) && !/Chrome|CriOS|FxiOS/.test(ua);
}

function detectStandaloneMode(): boolean {
  if (typeof window === 'undefined') return false;

  return (
    (window.navigator as Navigator & { standalone?: boolean }).standalone ===
      true || window.matchMedia('(display-mode: standalone)').matches
  );
}

function isAndroidBrowser(): boolean {
  if (typeof navigator === 'undefined') return false;
  if (isNativeCapacitorRuntime()) return false;

  return /Android/i.test(navigator.userAgent);
}

function openUrlInCurrentTab(url: string) {
  if (typeof window === 'undefined') return;

  if (typeof window.location.assign === 'function') {
    window.location.assign(url);
    return;
  }

  window.location.href = url;
}

function isDismissed(kind: PromoDismissKind): boolean {
  if (kind === 'android-app') {
    return isAndroidPromoDismissedForRuntime;
  }

  if (typeof window === 'undefined') return false;

  const storage = window.localStorage;
  const currentRaw = storage.getItem(getDismissKey());
  const legacyRaw = storage.getItem(LEGACY_DISMISSED_KEY);
  const rawValue = currentRaw || legacyRaw;
  if (!rawValue) return false;

  return Date.now() < Number(rawValue);
}

function persistDismiss(kind: PromoDismissKind) {
  if (kind === 'android-app') {
    // Android native promo скрывается только до конца текущего web-runtime:
    // при reload страницы или новой авторизации оно должно показаться снова.
    isAndroidPromoDismissedForRuntime = true;
    return;
  }

  if (typeof window === 'undefined') return;

  window.localStorage.setItem(getDismissKey(), String(getNext10am()));
}

function resetAndroidRuntimeDismiss() {
  isAndroidPromoDismissedForRuntime = false;
}

async function resolveAndroidRelatedAppStatus(): Promise<AndroidRelatedAppStatus> {
  if (androidRelatedAppStatusCache) {
    return androidRelatedAppStatusCache;
  }

  if (androidRelatedAppCheckPromise) {
    return androidRelatedAppCheckPromise;
  }

  androidRelatedAppCheckPromise = (async () => {
    if (typeof window === 'undefined') return 'unknown';
    if (!isAndroidBrowser()) return 'unsupported';
    if (!window.isSecureContext) return 'unsupported';

    const navigatorWithApps = navigator as NavigatorWithInstalledRelatedApps;
    if (typeof navigatorWithApps.getInstalledRelatedApps !== 'function') {
      return 'unsupported';
    }

    try {
      const relatedApps = await navigatorWithApps.getInstalledRelatedApps();
      const isInstalled = relatedApps.some((app) => {
        return (
          String(app.platform || '')
            .trim()
            .toLowerCase() === 'play' &&
          String(app.id || '').trim() === ANDROID_APP_PACKAGE_ID
        );
      });

      return isInstalled ? 'installed' : 'not-installed';
    } catch (error) {
      console.warn(
        '[useMobileAppPromo] Не удалось проверить installed related apps:',
        error
      );
      return 'unknown';
    }
  })()
    .then((status) => {
      androidRelatedAppStatusCache = status;
      return status;
    })
    .finally(() => {
      androidRelatedAppCheckPromise = null;
    });

  return androidRelatedAppCheckPromise;
}

export function useMobileAppPromo() {
  const activePromoKind = ref<MobilePromoKind>('none');
  const androidRelatedAppStatus = ref<AndroidRelatedAppStatus>('unknown');

  const androidPromoVariant = computed<AndroidPromoVariant>(() => {
    return androidRelatedAppStatus.value === 'installed'
      ? 'open-app'
      : 'google-play';
  });

  function isPromoBlockedPath(pathname: string): boolean {
    const normalizedPath = normalizePathname(pathname);

    return PROMO_BLOCKED_PATH_PREFIXES.some((prefix) =>
      matchesPathPrefix(normalizedPath, prefix)
    );
  }

  function hideActiveOffer() {
    activePromoKind.value = 'none';
  }

  function dismissActiveOffer() {
    if (activePromoKind.value === 'none') return;

    persistDismiss(activePromoKind.value);
    hideActiveOffer();
  }

  async function prepareOffer(pathname: string): Promise<MobilePromoKind> {
    hideActiveOffer();

    if (typeof window === 'undefined') return 'none';
    if (isNativeCapacitorRuntime()) return 'none';
    if (detectStandaloneMode()) return 'none';
    if (isPromoBlockedPath(pathname)) return 'none';

    if (detectIos()) {
      if (!isSafariOnIos()) return 'none';
      if (isDismissed('ios-pwa')) return 'none';

      activePromoKind.value = 'ios-pwa';
      return activePromoKind.value;
    }

    if (!isAndroidBrowser()) {
      return 'none';
    }

    if (isDismissed('android-app')) {
      return 'none';
    }

    androidRelatedAppStatus.value = await resolveAndroidRelatedAppStatus();
    activePromoKind.value = 'android-app';

    return activePromoKind.value;
  }

  async function openAndroidApp(): Promise<boolean> {
    if (typeof window === 'undefined') return false;

    persistDismiss('android-app');
    hideActiveOffer();

    if (typeof window.location.assign === 'function') {
      window.location.assign(ANDROID_APP_OPEN_URL);
      return true;
    }

    window.location.href = ANDROID_APP_OPEN_URL;
    return true;
  }

  async function openGooglePlayStore(): Promise<void> {
    persistDismiss('android-app');
    hideActiveOffer();

    if (isAndroidBrowser()) {
      // На Android из web лучше сразу инициировать переход в приложение Google Play,
      // чтобы не зависеть от доступности play.google.com в браузере.
      openUrlInCurrentTab(GOOGLE_PLAY_INTENT_URL);
      return;
    }

    await openExternalBrowser(GOOGLE_PLAY_URL);
  }

  return {
    activePromoKind: readonly(activePromoKind),
    androidPromoVariant: readonly(androidPromoVariant),
    androidRelatedAppStatus: readonly(androidRelatedAppStatus),
    prepareOffer,
    dismissActiveOffer,
    hideActiveOffer,
    isPromoBlockedPath,
    openAndroidApp,
    openGooglePlayStore,
    resetAndroidRuntimeDismiss,
    googlePlayUrl: GOOGLE_PLAY_URL,
    googlePlayIntentUrl: GOOGLE_PLAY_INTENT_URL,
  };
}
