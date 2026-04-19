function normalizeBaseUrl(value: string) {
  return value.replace(/\/+$/, '');
}

export function isHttpUrl(value: string) {
  return /^https?:\/\//i.test(value);
}

export function isLocalBundleOrigin(origin: string) {
  return /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(origin);
}

export function resolveAppAssetBaseUrl(params: {
  isDev: boolean;
  isNativeRuntime: boolean;
  origin?: string | null;
  apiBaseUrl?: string | null;
  appUrl?: string | null;
}) {
  const origin =
    typeof params.origin === 'string' && isHttpUrl(params.origin)
      ? params.origin.trim()
      : '';
  const apiBaseUrl =
    typeof params.apiBaseUrl === 'string' ? params.apiBaseUrl.trim() : '';
  const appUrl = typeof params.appUrl === 'string' ? params.appUrl.trim() : '';

  // Для native dev route ассетов приложения должен идти в текущий origin
  // WebView, даже если это localhost через adb reverse. Иначе Android-device
  // подставляет appUrl (например, local.mentala.app), который на телефоне
  // может не резолвиться и ломает playback у локальной сборки.
  if (params.isDev && params.isNativeRuntime && origin) {
    return normalizeBaseUrl(origin);
  }

  const baseUrl = apiBaseUrl || appUrl || origin;
  return baseUrl ? normalizeBaseUrl(baseUrl) : '';
}

export function resolveMediaBaseUrl(params: {
  isDev: boolean;
  isNativeRuntime: boolean;
  origin?: string | null;
  apiBaseUrl?: string | null;
  mediaBaseUrl?: string | null;
}) {
  const origin =
    typeof params.origin === 'string' && isHttpUrl(params.origin)
      ? params.origin.trim()
      : '';
  const apiBaseUrl =
    typeof params.apiBaseUrl === 'string' ? params.apiBaseUrl.trim() : '';
  const mediaBaseUrl =
    typeof params.mediaBaseUrl === 'string' ? params.mediaBaseUrl.trim() : '';

  const shouldUseOriginInDev =
    params.isDev &&
    Boolean(origin) &&
    !isLocalBundleOrigin(origin) &&
    (params.isNativeRuntime || (Boolean(apiBaseUrl) && apiBaseUrl !== origin));

  const baseUrl = params.isDev
    ? shouldUseOriginInDev
      ? origin
      : apiBaseUrl || mediaBaseUrl || origin
    : mediaBaseUrl || apiBaseUrl || origin;

  return baseUrl ? normalizeBaseUrl(baseUrl) : '';
}
