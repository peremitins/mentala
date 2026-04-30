import {
  MarketingAttributionDto,
  type MarketingAttributionDto as MarketingAttributionPayload,
} from '../dto/marketing-attribution';

export const MARKETING_ATTRIBUTION_TTL_DAYS = 90;
export const MARKETING_ATTRIBUTION_TTL_MS =
  MARKETING_ATTRIBUTION_TTL_DAYS * 24 * 60 * 60 * 1000;

export const MARKETING_ATTRIBUTION_STORAGE_KEY =
  'mentala.marketing_attribution';

export const MARKETING_QUERY_PARAM_TO_FIELD = {
  utm_source: 'utmSource',
  utm_medium: 'utmMedium',
  utm_campaign: 'utmCampaign',
  utm_content: 'utmContent',
  utm_term: 'utmTerm',
  gclid: 'gclid',
  yclid: 'yclid',
  fbclid: 'fbclid',
  ttclid: 'ttclid',
} as const;

export const MARKETING_ATTRIBUTION_FIELD_TO_QUERY = {
  utmSource: 'utm_source',
  utmMedium: 'utm_medium',
  utmCampaign: 'utm_campaign',
  utmContent: 'utm_content',
  utmTerm: 'utm_term',
  gclid: 'gclid',
  yclid: 'yclid',
  fbclid: 'fbclid',
  ttclid: 'ttclid',
} as const;

type MarketingQueryParam = keyof typeof MARKETING_QUERY_PARAM_TO_FIELD;
type MarketingField = keyof typeof MARKETING_ATTRIBUTION_FIELD_TO_QUERY;

const MARKETING_FIELDS = Object.keys(
  MARKETING_ATTRIBUTION_FIELD_TO_QUERY
) as MarketingField[];
const MARKETING_QUERY_PARAMS = Object.keys(
  MARKETING_QUERY_PARAM_TO_FIELD
) as MarketingQueryParam[];

type QueryLike = Record<string, unknown>;

function toSingleString(value: unknown): string | undefined {
  if (Array.isArray(value)) {
    return toSingleString(value[0]);
  }

  if (typeof value === 'string') {
    return value;
  }

  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }

  return undefined;
}

function pickRawMarketingParams(query: QueryLike): Record<string, string> {
  const rawParams: Record<string, string> = {};

  for (const queryParam of MARKETING_QUERY_PARAMS) {
    const value = toSingleString(query[queryParam])?.trim();
    if (value) {
      rawParams[queryParam] = value;
    }
  }

  return rawParams;
}

function hasMeaningfulFields(payload: MarketingAttributionPayload): boolean {
  return MARKETING_FIELDS.some((field) => Boolean(payload[field]));
}

function appendMarketingFieldsToSearchParams(
  params: URLSearchParams,
  attribution: Partial<Record<MarketingField, unknown>>
): void {
  for (const field of MARKETING_FIELDS) {
    const value = toSingleString(attribution[field])?.trim();
    if (value) {
      params.set(MARKETING_ATTRIBUTION_FIELD_TO_QUERY[field], value);
    }
  }
}

function sanitizeMarketingLandingUrl(
  rawUrl: string,
  attribution: Partial<Record<MarketingField, unknown>>
): string {
  const params = new URLSearchParams();
  appendMarketingFieldsToSearchParams(params, attribution);

  try {
    const url = new URL(rawUrl);
    url.search = params.toString();
    url.hash = '';
    return url.toString();
  } catch {
    const hashIndex = rawUrl.indexOf('#');
    const urlWithoutHash = hashIndex >= 0 ? rawUrl.slice(0, hashIndex) : rawUrl;
    const queryIndex = urlWithoutHash.indexOf('?');
    const base =
      queryIndex >= 0 ? urlWithoutHash.slice(0, queryIndex) : urlWithoutHash;
    const search = params.toString();
    return search ? `${base}?${search}` : base;
  }
}

export function normalizeMarketingAttribution(
  input: unknown
): MarketingAttributionPayload | undefined {
  if (!input || typeof input !== 'object') {
    return undefined;
  }

  const candidate = input as Record<string, unknown>;
  const normalized: Record<string, unknown> = {};

  for (const field of MARKETING_FIELDS) {
    const value = toSingleString(candidate[field])?.trim();
    if (value) {
      normalized[field] = value;
    }
  }

  const landingUrl = toSingleString(candidate.landingUrl)?.trim();
  if (landingUrl) {
    normalized.landingUrl = landingUrl;
  }

  const referrer = toSingleString(candidate.referrer)?.trim();
  if (referrer) {
    normalized.referrer = referrer;
  }

  const capturedAt = toSingleString(candidate.capturedAt)?.trim();
  if (capturedAt) {
    normalized.capturedAt = capturedAt;
  }

  const rawParams =
    candidate.rawParams && typeof candidate.rawParams === 'object'
      ? pickRawMarketingParams(candidate.rawParams as QueryLike)
      : {};

  if (Object.keys(rawParams).length) {
    normalized.rawParams = rawParams;
  }

  const parsed = MarketingAttributionDto.safeParse(normalized);
  if (!parsed.success || !hasMeaningfulFields(parsed.data)) {
    return undefined;
  }

  if (parsed.data.landingUrl) {
    parsed.data.landingUrl = sanitizeMarketingLandingUrl(
      parsed.data.landingUrl,
      parsed.data
    );
  }

  return parsed.data;
}

export function extractMarketingAttributionFromQuery(
  query: QueryLike,
  context?: {
    landingUrl?: string;
    referrer?: string;
    capturedAt?: string;
  }
): MarketingAttributionPayload | undefined {
  const payload: Record<string, unknown> = {};

  for (const queryParam of MARKETING_QUERY_PARAMS) {
    const field = MARKETING_QUERY_PARAM_TO_FIELD[queryParam];
    const value = toSingleString(query[queryParam])?.trim();
    if (value) {
      payload[field] = value;
    }
  }

  payload.rawParams = pickRawMarketingParams(query);
  if (context?.landingUrl) payload.landingUrl = context.landingUrl;
  if (context?.referrer) payload.referrer = context.referrer;
  if (context?.capturedAt) payload.capturedAt = context.capturedAt;

  return normalizeMarketingAttribution(payload);
}

export function extractMarketingAttributionFromSearchParams(
  params: URLSearchParams,
  context?: {
    landingUrl?: string;
    referrer?: string;
    capturedAt?: string;
  }
): MarketingAttributionPayload | undefined {
  const query: Record<string, string> = {};

  for (const queryParam of MARKETING_QUERY_PARAMS) {
    const value = params.get(queryParam);
    if (value) {
      query[queryParam] = value;
    }
  }

  return extractMarketingAttributionFromQuery(query, context);
}

export function buildMarketingAttributionQueryParams(
  attribution: unknown
): URLSearchParams {
  const normalized = normalizeMarketingAttribution(attribution);
  const params = new URLSearchParams();

  if (!normalized) {
    return params;
  }

  appendMarketingFieldsToSearchParams(params, normalized);

  return params;
}

export function appendMarketingAttributionToUrl(
  rawUrl: string,
  attribution: unknown
): string {
  const params = buildMarketingAttributionQueryParams(attribution);
  if (!rawUrl || Array.from(params.keys()).length === 0) {
    return rawUrl;
  }

  try {
    const url = new URL(rawUrl);
    for (const [key, value] of params) {
      url.searchParams.set(key, value);
    }
    return url.toString();
  } catch {
    const hashIndex = rawUrl.indexOf('#');
    const baseWithSearch = hashIndex >= 0 ? rawUrl.slice(0, hashIndex) : rawUrl;
    const hash = hashIndex >= 0 ? rawUrl.slice(hashIndex + 1) : '';
    const separator = baseWithSearch.includes('?') ? '&' : '?';
    const nextUrl = `${baseWithSearch}${separator}${params.toString()}`;
    return hash ? `${nextUrl}#${hash}` : nextUrl;
  }
}
