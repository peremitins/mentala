import { Capacitor, registerPlugin } from '@capacitor/core';
import { normalizeStorefrontCountryCode } from '@/shared/utils/storefront';

type StorefrontPlugin = {
  getStorefrontCountryCode: () => Promise<{ countryCode: string | null }>;
};

// Регистрируем нативный плагин. В web / в сборках без плагина вызов упадёт —
// это нормально, мы обработаем ошибку и вернём null.
const Storefront = registerPlugin<StorefrontPlugin>('Storefront');
const STOREFRONT_CACHE_KEY = 'mentai.ios.storefront.country_code.v1';
const STOREFRONT_CACHE_TS_KEY = 'mentai.ios.storefront.updated_at.v1';
const STOREFRONT_CACHE_TTL_MS = 4 * 60 * 60 * 1000; // 4 часа

function readCachedStorefront(): string | null | undefined {
  if (typeof window === 'undefined') return undefined;

  try {
    const rawUpdatedAt = localStorage.getItem(STOREFRONT_CACHE_TS_KEY);
    const updatedAt = Number(rawUpdatedAt);
    if (!Number.isFinite(updatedAt) || updatedAt <= 0) return undefined;

    if (Date.now() - updatedAt > STOREFRONT_CACHE_TTL_MS) {
      return undefined;
    }

    const cachedCountryCode = localStorage.getItem(STOREFRONT_CACHE_KEY);
    // Если значения нет, не считаем это валидным кэшем:
    // storefront нужно запросить заново, иначе можно зафиксировать WW-flow.
    if (cachedCountryCode == null) return undefined;

    return normalizeStorefrontCountryCode(cachedCountryCode);
  } catch {
    return undefined;
  }
}

function writeCachedStorefront(value: string | null) {
  if (typeof window === 'undefined') return;

  try {
    if (value) {
      localStorage.setItem(STOREFRONT_CACHE_KEY, value);
      localStorage.setItem(STOREFRONT_CACHE_TS_KEY, String(Date.now()));
    } else {
      // Для null очищаем кэш полностью, чтобы не "залипать" в fallback-сценарии.
      localStorage.removeItem(STOREFRONT_CACHE_KEY);
      localStorage.removeItem(STOREFRONT_CACHE_TS_KEY);
    }
  } catch {
    // ignore
  }
}

export async function getIosStorefrontCountryCode(options?: {
  forceRefresh?: boolean;
}): Promise<string | null> {
  if (typeof window === 'undefined') return null;
  if (!Capacitor.isNativePlatform()) return null;
  if (Capacitor.getPlatform() !== 'ios') return null;

  if (!options?.forceRefresh) {
    const cachedStorefront = readCachedStorefront();
    if (cachedStorefront !== undefined) {
      return cachedStorefront;
    }
  }

  try {
    const result = await Storefront.getStorefrontCountryCode();
    const normalizedCountryCode = normalizeStorefrontCountryCode(
      result?.countryCode
    );
    writeCachedStorefront(normalizedCountryCode);
    return normalizedCountryCode;
  } catch (error) {
    // Плагин может отсутствовать в web/dev-сборках — это допустимый кейс.
    console.warn('[Storefront] Failed to get iOS storefront country code:', {
      error,
    });

    // Ошибку не кэшируем, чтобы следующая попытка могла получить реальный storefront.
    return null;
  }
}
