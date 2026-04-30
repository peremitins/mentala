import {
  MARKETING_ATTRIBUTION_STORAGE_KEY,
  MARKETING_ATTRIBUTION_TTL_MS,
  extractMarketingAttributionFromQuery,
  normalizeMarketingAttribution,
} from '@/shared/utils/marketingAttribution';
import type { MarketingAttributionDto } from '@/shared/dto/marketing-attribution';

type StoredMarketingAttribution = {
  value: MarketingAttributionDto;
  expiresAt: number;
  submittedAt?: string;
};

function getClientStorage(): Storage | null {
  if (typeof window === 'undefined') {
    return null;
  }

  try {
    return window.localStorage ?? null;
  } catch {
    return null;
  }
}

function safeRemoveStoredMarketingAttribution(): void {
  try {
    getClientStorage()?.removeItem(MARKETING_ATTRIBUTION_STORAGE_KEY);
  } catch {
    // localStorage может быть заблокирован политиками браузера.
  }
}

function getAttributionFingerprint(
  attribution: MarketingAttributionDto
): string {
  return JSON.stringify({
    utmSource: attribution.utmSource ?? null,
    utmMedium: attribution.utmMedium ?? null,
    utmCampaign: attribution.utmCampaign ?? null,
    utmContent: attribution.utmContent ?? null,
    utmTerm: attribution.utmTerm ?? null,
    gclid: attribution.gclid ?? null,
    yclid: attribution.yclid ?? null,
    fbclid: attribution.fbclid ?? null,
    ttclid: attribution.ttclid ?? null,
  });
}

function readStoredMarketingAttribution(): StoredMarketingAttribution | null {
  const storage = getClientStorage();
  if (!storage) {
    return null;
  }

  try {
    const raw = storage.getItem(MARKETING_ATTRIBUTION_STORAGE_KEY);
    if (!raw) {
      return null;
    }

    const parsed = JSON.parse(raw) as StoredMarketingAttribution;
    if (!parsed?.value || !parsed.expiresAt || parsed.expiresAt <= Date.now()) {
      safeRemoveStoredMarketingAttribution();
      return null;
    }

    const value = normalizeMarketingAttribution(parsed.value);
    if (!value) {
      safeRemoveStoredMarketingAttribution();
      return null;
    }

    return {
      ...parsed,
      value,
    };
  } catch {
    safeRemoveStoredMarketingAttribution();
    return null;
  }
}

function writeStoredMarketingAttribution(
  record: StoredMarketingAttribution
): void {
  const storage = getClientStorage();
  if (!storage) {
    return;
  }

  try {
    storage.setItem(MARKETING_ATTRIBUTION_STORAGE_KEY, JSON.stringify(record));
  } catch (error) {
    console.warn('[MarketingAttribution] Failed to persist touchpoint', error);
  }
}

export function getPendingMarketingAttribution():
  | MarketingAttributionDto
  | undefined {
  return readStoredMarketingAttribution()?.value;
}

export function markMarketingAttributionSubmitted(): void {
  const stored = readStoredMarketingAttribution();
  if (!stored) {
    return;
  }

  writeStoredMarketingAttribution({
    ...stored,
    submittedAt: new Date().toISOString(),
  });
}

export function captureMarketingAttributionFromQuery(
  query: Record<string, unknown>
): MarketingAttributionDto | undefined {
  if (typeof window === 'undefined') {
    return undefined;
  }

  const attribution = extractMarketingAttributionFromQuery(query, {
    landingUrl: window.location.href,
    referrer:
      typeof document !== 'undefined' && document.referrer
        ? document.referrer
        : undefined,
    capturedAt: new Date().toISOString(),
  });

  if (!attribution) {
    return getPendingMarketingAttribution();
  }

  const stored = readStoredMarketingAttribution();
  const isSameStoredAttribution =
    stored &&
    getAttributionFingerprint(stored.value) ===
      getAttributionFingerprint(attribution);

  writeStoredMarketingAttribution({
    value: attribution,
    expiresAt: Date.now() + MARKETING_ATTRIBUTION_TTL_MS,
    submittedAt: isSameStoredAttribution ? stored.submittedAt : undefined,
  });

  return attribution;
}

export async function submitAuthenticatedMarketingTouchOnce(): Promise<void> {
  const stored = readStoredMarketingAttribution();
  if (!stored || stored.submittedAt) {
    return;
  }

  try {
    await useAPI('/api/marketing-attribution/touch', {
      method: 'POST',
      body: { marketingAttribution: stored.value },
      suppressErrorToast: true,
    });
    markMarketingAttributionSubmitted();
  } catch (error) {
    console.warn('[MarketingAttribution] Authenticated touch failed', error);
  }
}

export function useMarketingAttribution() {
  const route = useRoute();

  return {
    captureFromCurrentRoute: () =>
      captureMarketingAttributionFromQuery(route.query),
    getPendingMarketingAttribution,
    markMarketingAttributionSubmitted,
    submitAuthenticatedMarketingTouchOnce,
  };
}
