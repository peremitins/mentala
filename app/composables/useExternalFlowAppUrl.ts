import { Capacitor } from '@capacitor/core';
import { computed } from 'vue';

function normalizeHttpBaseUrl(
  rawValue: string | null | undefined
): string | null {
  const value = String(rawValue || '').trim();
  if (!value) return null;

  try {
    const parsed = new URL(value);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return null;
    }

    const pathname =
      parsed.pathname && parsed.pathname !== '/'
        ? parsed.pathname.replace(/\/+$/, '')
        : '';

    return `${parsed.origin}${pathname}`;
  } catch {
    return null;
  }
}

/**
 * Выбирает app URL для redirect-flow во внешнем браузере.
 * В native/dev приоритет у NUXT_PUBLIC_DEVICE_APP_URL (LAN-адрес),
 * чтобы ссылки были доступны на реальных устройствах.
 */
export function useExternalFlowAppUrl() {
  const config = useRuntimeConfig();

  const isDev =
    (config.public as any).isDev === true ||
    (!import.meta.env?.PROD && import.meta.env?.MODE !== 'production');

  return computed(() => {
    const deviceAppUrl = normalizeHttpBaseUrl(
      String((config.public as any).deviceAppUrl || '')
    );
    const configuredAppUrl = normalizeHttpBaseUrl(
      String((config.public as any).appUrl || '')
    );
    const currentOrigin =
      typeof window !== 'undefined'
        ? normalizeHttpBaseUrl(window.location.origin)
        : null;

    if (isDev && Capacitor.isNativePlatform()) {
      return deviceAppUrl || currentOrigin || configuredAppUrl;
    }

    return currentOrigin || configuredAppUrl || deviceAppUrl;
  });
}
