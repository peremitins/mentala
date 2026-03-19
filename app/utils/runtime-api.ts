import { Capacitor } from '@capacitor/core';

export type RuntimeApiBaseOptions = {
  apiBase?: string | null;
  isDev?: boolean;
  appOrigin?: string | null;
  isCapacitor?: boolean;
  platform?: string | null;
};

function normalizeUrl(value?: string | null): string {
  return typeof value === 'string' ? value.trim().replace(/\/+$/, '') : '';
}

export function isHttpOrigin(origin?: string | null): boolean {
  return /^https?:\/\//i.test(String(origin || '').trim());
}

export function isLocalBundleOrigin(origin?: string | null): boolean {
  return /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(
    String(origin || '').trim()
  );
}

export function resolveRuntimeApiBaseUrl(
  params: RuntimeApiBaseOptions
): string {
  const apiBase = normalizeUrl(params.apiBase);
  const appOrigin = normalizeUrl(params.appOrigin);
  const isCapacitor =
    typeof params.isCapacitor === 'boolean'
      ? params.isCapacitor
      : Capacitor.isNativePlatform();
  const platform = String(params.platform || Capacitor.getPlatform() || 'web');

  const shouldUseOriginAsApiBase =
    isCapacitor &&
    params.isDev === true &&
    appOrigin.length > 0 &&
    apiBase.length > 0 &&
    apiBase !== appOrigin
      ? !isLocalBundleOrigin(appOrigin) &&
        !(platform === 'ios' && !isHttpOrigin(appOrigin))
      : false;

  return shouldUseOriginAsApiBase ? appOrigin : apiBase;
}

export function resolveRuntimeApiUrl(
  path: string,
  params: RuntimeApiBaseOptions
): string {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  return `${resolveRuntimeApiBaseUrl(params)}${normalizedPath}`;
}

export function resolveClientPlatformHeader(
  platform?: string | null
): 'web' | 'ios' | 'android' {
  if (platform === 'ios') return 'ios';
  if (platform === 'android') return 'android';
  return 'web';
}

export function resolveClientTimezone(fallback = 'Europe/Moscow'): string {
  try {
    if (
      typeof Intl !== 'undefined' &&
      Intl.DateTimeFormat &&
      typeof Intl.DateTimeFormat === 'function'
    ) {
      const resolved = Intl.DateTimeFormat().resolvedOptions();
      if (typeof resolved.timeZone === 'string' && resolved.timeZone.trim()) {
        return resolved.timeZone;
      }
    }
  } catch (error) {
    console.warn(
      '[Runtime API] Failed to get timezone from Intl API, using fallback:',
      error
    );
  }

  return fallback;
}
