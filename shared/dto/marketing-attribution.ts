import { z } from 'zod';

const MARKETING_RAW_PARAM_KEYS = [
  'utm_source',
  'utm_medium',
  'utm_campaign',
  'utm_content',
  'utm_term',
  'gclid',
  'yclid',
  'fbclid',
  'ttclid',
] as const;

function cleanOptionalString(value: unknown, maxLength: number) {
  if (typeof value !== 'string') {
    return undefined;
  }

  const trimmed = value.trim();
  if (!trimmed || trimmed.length > maxLength) {
    return undefined;
  }

  return trimmed;
}

function cleanOptionalDateTime(value: unknown) {
  const trimmed = cleanOptionalString(value, 64);
  if (!trimmed) {
    return undefined;
  }

  const date = new Date(trimmed);
  return Number.isFinite(date.getTime()) ? date.toISOString() : undefined;
}

function optionalCleanString(maxLength: number) {
  return z
    .preprocess(
      (value) => cleanOptionalString(value, maxLength),
      z.string().optional()
    )
    .optional();
}

const shortMarketingValue = optionalCleanString(120);
const clickIdValue = optionalCleanString(255);
const urlValue = optionalCleanString(2048);

export const MarketingAttributionDto = z.object({
  utmSource: shortMarketingValue,
  utmMedium: shortMarketingValue,
  utmCampaign: shortMarketingValue,
  utmContent: shortMarketingValue,
  utmTerm: shortMarketingValue,
  gclid: clickIdValue,
  yclid: clickIdValue,
  fbclid: clickIdValue,
  ttclid: clickIdValue,
  landingUrl: urlValue,
  referrer: urlValue,
  capturedAt: z
    .preprocess(cleanOptionalDateTime, z.string().optional())
    .optional(),
  rawParams: z
    .preprocess((value) => {
      if (!value || typeof value !== 'object' || Array.isArray(value)) {
        return undefined;
      }

      const rawParams: Record<string, string> = {};
      const candidate = value as Record<string, unknown>;

      for (const key of MARKETING_RAW_PARAM_KEYS) {
        const cleaned = cleanOptionalString(candidate[key], 2048);
        if (cleaned) {
          rawParams[key] = cleaned;
        }
      }

      return Object.keys(rawParams).length ? rawParams : undefined;
    }, z.record(z.string()).optional())
    .optional(),
});

export type MarketingAttributionDto = z.infer<typeof MarketingAttributionDto>;
