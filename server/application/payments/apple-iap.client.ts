import crypto from 'node:crypto';
import { createError } from 'h3';

const APP_STORE_SERVER_API_URL = {
  production: 'https://api.storekit.itunes.apple.com',
  sandbox: 'https://api.storekit-sandbox.itunes.apple.com',
} as const;

type JwtCacheEntry = {
  token: string;
  expiresAtMs: number;
};

const appStoreApiJwtCache = new Map<string, JwtCacheEntry>();

function normalizeString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeUuid(value: unknown): string | null {
  const text = normalizeString(value).toLowerCase();
  if (!text) return null;

  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    text
  )
    ? text
    : null;
}

// Apple JWS storefront может содержать как alpha-2 (US), так и alpha-3 (USA) коды.
// Нормализуем к alpha-2 для единообразия.
const ALPHA3_TO_ALPHA2: Record<string, string> = {
  RUS: 'RU',
  USA: 'US',
  GBR: 'GB',
  DEU: 'DE',
  FRA: 'FR',
  JPN: 'JP',
  CHN: 'CN',
  KOR: 'KR',
  BRA: 'BR',
  IND: 'IN',
  CAN: 'CA',
  AUS: 'AU',
  ITA: 'IT',
  ESP: 'ES',
  NLD: 'NL',
  TUR: 'TR',
  MEX: 'MX',
  IDN: 'ID',
  POL: 'PL',
  SWE: 'SE',
  NOR: 'NO',
  DNK: 'DK',
  FIN: 'FI',
  AUT: 'AT',
  CHE: 'CH',
  BEL: 'BE',
  PRT: 'PT',
  CZE: 'CZ',
  GRC: 'GR',
  ISR: 'IL',
  SGP: 'SG',
  HKG: 'HK',
  TWN: 'TW',
  THA: 'TH',
  MYS: 'MY',
  PHL: 'PH',
  VNM: 'VN',
  ARE: 'AE',
  SAU: 'SA',
  EGY: 'EG',
  ZAF: 'ZA',
  NGA: 'NG',
  COL: 'CO',
  ARG: 'AR',
  CHL: 'CL',
  PER: 'PE',
  UKR: 'UA',
  ROU: 'RO',
  HUN: 'HU',
  KAZ: 'KZ',
};

function normalizeCountryCode(value: unknown): string | null {
  const text = normalizeString(value).toUpperCase();
  if (!text) return null;

  if (/^[A-Z]{2}$/.test(text)) return text;
  if (/^[A-Z]{3}$/.test(text)) return ALPHA3_TO_ALPHA2[text] ?? null;

  return null;
}

function parseAppleTimestamp(value: unknown): Date | null {
  if (value == null) return null;

  if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
    return new Date(value);
  }

  const text = normalizeString(value);
  if (!text) return null;

  const asNumber = Number(text);
  if (Number.isFinite(asNumber) && asNumber > 0) {
    return new Date(asNumber);
  }

  const asDateMs = Date.parse(text);
  if (Number.isFinite(asDateMs) && asDateMs > 0) {
    return new Date(asDateMs);
  }

  return null;
}

function toBase64Url(input: Buffer | string): string {
  const buffer = Buffer.isBuffer(input) ? input : Buffer.from(input, 'utf8');
  return buffer
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

function decodeBase64Url(input: string): Buffer {
  const normalized = input.replace(/-/g, '+').replace(/_/g, '/');
  const paddingLength = (4 - (normalized.length % 4)) % 4;
  const padded = normalized + '='.repeat(paddingLength);
  return Buffer.from(padded, 'base64');
}

function decodeJwsPayload(payloadJws: string): Record<string, unknown> {
  const token = normalizeString(payloadJws);
  if (!token) {
    throw createError({
      statusCode: 400,
      statusMessage: 'signedTransactionInfo is required',
    });
  }

  const parts = token.split('.');
  if (parts.length !== 3) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Invalid JWS format',
    });
  }

  try {
    const payloadJson = decodeBase64Url(parts[1] || '').toString('utf8');
    const parsed = JSON.parse(payloadJson);

    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new Error('payload is not an object');
    }

    return parsed as Record<string, unknown>;
  } catch (error: any) {
    throw createError({
      statusCode: 400,
      statusMessage:
        error?.message || 'Failed to decode Apple signed transaction payload',
    });
  }
}

function normalizeEnvironment(value: unknown): AppleIapEnvironment {
  const text = normalizeString(value).toLowerCase();
  // Xcode StoreKit Configuration использует environment "Xcode" — это локальный sandbox.
  if (text.includes('sandbox') || text === 'xcode') {
    return 'sandbox';
  }
  return 'production';
}

function normalizeBoolean(value: unknown): boolean {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value !== 0;

  const text = normalizeString(value).toLowerCase();
  return text === '1' || text === 'true' || text === 'yes';
}

function normalizePrivateKeyPem(raw: string): string {
  const text = raw.trim();
  if (!text) return '';

  if (text.includes('BEGIN PRIVATE KEY')) {
    return text.replace(/\\n/g, '\n').trim();
  }

  try {
    const decoded = Buffer.from(text, 'base64').toString('utf8').trim();
    if (decoded.includes('BEGIN PRIVATE KEY')) {
      return decoded.replace(/\\n/g, '\n').trim();
    }
  } catch {
    // ignore
  }

  return text.replace(/\\n/g, '\n').trim();
}

function buildAppStoreApiJwt(params: {
  issuerId: string;
  keyId: string;
  privateKeyPem: string;
  bundleId: string;
}): string {
  const cacheKey = `${params.issuerId}:${params.keyId}:${params.bundleId}`;
  const nowMs = Date.now();

  const cached = appStoreApiJwtCache.get(cacheKey);
  if (cached && cached.expiresAtMs > nowMs + 30_000) {
    return cached.token;
  }

  const nowSec = Math.floor(nowMs / 1000);
  const expSec = nowSec + 5 * 60;

  const header = {
    alg: 'ES256',
    kid: params.keyId,
    typ: 'JWT',
  };

  const payload = {
    iss: params.issuerId,
    iat: nowSec,
    exp: expSec,
    aud: 'appstoreconnect-v1',
    bid: params.bundleId,
  };

  const encodedHeader = toBase64Url(JSON.stringify(header));
  const encodedPayload = toBase64Url(JSON.stringify(payload));
  const signingInput = `${encodedHeader}.${encodedPayload}`;

  let signature: Buffer;
  try {
    signature = crypto.sign('sha256', Buffer.from(signingInput, 'utf8'), {
      key: params.privateKeyPem,
      dsaEncoding: 'ieee-p1363',
    });
  } catch (error: any) {
    throw createError({
      statusCode: 500,
      statusMessage:
        error?.message || 'Failed to sign App Store Server API token',
    });
  }

  const token = `${signingInput}.${toBase64Url(signature)}`;

  appStoreApiJwtCache.set(cacheKey, {
    token,
    expiresAtMs: expSec * 1000,
  });

  return token;
}

function normalizeTransactionId(value: unknown): string {
  const text = normalizeString(value);
  if (!text) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Apple transaction payload misses transactionId',
    });
  }

  return text;
}

function normalizeOriginalTransactionId(
  value: unknown,
  fallbackTransactionId: string
): string {
  const text = normalizeString(value);
  return text || fallbackTransactionId;
}

export type AppleIapEnvironment = 'production' | 'sandbox';

export type AppleSignedTransactionInfo = {
  transactionId: string;
  originalTransactionId: string;
  productId: string;
  bundleId: string;
  environment: AppleIapEnvironment;
  purchaseDate: Date | null;
  expiresDate: Date | null;
  revocationDate: Date | null;
  storefront: string | null;
  appAccountToken: string | null;
  isUpgraded: boolean;
  rawPayload: Record<string, unknown>;
};

export function decodeAppleJwsPayload(
  payloadJws: string
): Record<string, unknown> {
  return decodeJwsPayload(payloadJws);
}

export function decodeSignedTransactionInfo(
  signedTransactionInfo: string
): AppleSignedTransactionInfo {
  const rawPayload = decodeJwsPayload(signedTransactionInfo);

  const transactionId = normalizeTransactionId(
    rawPayload.transactionId ?? rawPayload.transaction_id
  );
  const originalTransactionId = normalizeOriginalTransactionId(
    rawPayload.originalTransactionId ?? rawPayload.original_transaction_id,
    transactionId
  );

  const productId = normalizeString(
    rawPayload.productId ?? rawPayload.product_id
  );
  if (!productId) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Apple transaction payload misses productId',
    });
  }

  const bundleId = normalizeString(rawPayload.bundleId ?? rawPayload.bundle_id);
  if (!bundleId) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Apple transaction payload misses bundleId',
    });
  }

  return {
    transactionId,
    originalTransactionId,
    productId,
    bundleId,
    environment: normalizeEnvironment(rawPayload.environment),
    purchaseDate: parseAppleTimestamp(rawPayload.purchaseDate),
    expiresDate: parseAppleTimestamp(rawPayload.expiresDate),
    revocationDate: parseAppleTimestamp(rawPayload.revocationDate),
    storefront: normalizeCountryCode(rawPayload.storefront),
    appAccountToken: normalizeUuid(rawPayload.appAccountToken),
    isUpgraded: normalizeBoolean(rawPayload.isUpgraded),
    rawPayload,
  };
}

function extractStatusCode(error: any): number {
  return Number(error?.response?.status || error?.statusCode || 0);
}

function extractUpstreamMessage(error: any): string {
  const message =
    normalizeString(error?.data?.errorMessage) ||
    normalizeString(error?.data?.message) ||
    normalizeString(error?.statusMessage) ||
    normalizeString(error?.message);

  return message || 'Unknown App Store Server API error';
}

function buildEnvironmentOrder(
  preferredEnvironment: AppleIapEnvironment | null
): AppleIapEnvironment[] {
  if (preferredEnvironment === 'sandbox') {
    return ['sandbox', 'production'];
  }

  return ['production', 'sandbox'];
}

export async function fetchAppleTransactionFromServerApi(params: {
  transactionId: string;
  signedTransactionInfo: string;
  allowedBundleIds: string[];
  issuerId: string;
  keyId: string;
  privateKeyBase64: string;
  preferredEnvironment?: AppleIapEnvironment | null;
}): Promise<{
  environment: AppleIapEnvironment;
  signedTransactionInfo: string;
  transaction: AppleSignedTransactionInfo;
}> {
  const transactionId = normalizeString(params.transactionId);
  if (!transactionId) {
    throw createError({
      statusCode: 400,
      statusMessage: 'transactionId is required',
    });
  }

  const signedTransactionInfoRaw = normalizeString(
    params.signedTransactionInfo
  );
  if (!signedTransactionInfoRaw) {
    throw createError({
      statusCode: 400,
      statusMessage: 'signedTransactionInfo is required',
    });
  }

  const allowedBundleIds = params.allowedBundleIds
    .map((value) => normalizeString(value))
    .filter(Boolean);
  if (!allowedBundleIds.length) {
    throw createError({
      statusCode: 500,
      statusMessage: 'APPLE_IAP_BUNDLE_IDS is not configured',
    });
  }

  const issuerId = normalizeString(params.issuerId);
  const keyId = normalizeString(params.keyId);
  const privateKeyPem = normalizePrivateKeyPem(params.privateKeyBase64 || '');

  if (!issuerId || !keyId || !privateKeyPem) {
    throw createError({
      statusCode: 500,
      statusMessage:
        'Apple IAP Server API credentials are not configured (APPLE_IAP_ISSUER_ID / APPLE_IAP_KEY_ID / APPLE_IAP_PRIVATE_KEY_BASE64)',
    });
  }

  const preferredEnvironment =
    params.preferredEnvironment === 'sandbox' ||
    params.preferredEnvironment === 'production'
      ? params.preferredEnvironment
      : decodeSignedTransactionInfo(signedTransactionInfoRaw).environment;

  const environments = buildEnvironmentOrder(preferredEnvironment);
  let lastRecoverableError: string | null = null;

  for (const environment of environments) {
    const baseUrl = APP_STORE_SERVER_API_URL[environment];

    for (const bundleId of allowedBundleIds) {
      const jwt = buildAppStoreApiJwt({
        issuerId,
        keyId,
        privateKeyPem,
        bundleId,
      });

      try {
        const response = await $fetch<{ signedTransactionInfo?: string }>(
          `${baseUrl}/inApps/v1/transactions/${encodeURIComponent(transactionId)}`,
          {
            method: 'GET',
            timeout: 15_000,
            headers: {
              Authorization: `Bearer ${jwt}`,
            },
          }
        );

        const authoritativeJws = normalizeString(
          response?.signedTransactionInfo
        );
        if (!authoritativeJws) {
          lastRecoverableError =
            'App Store Server API response does not contain signedTransactionInfo';
          continue;
        }

        const transaction = decodeSignedTransactionInfo(authoritativeJws);
        if (transaction.transactionId !== transactionId) {
          lastRecoverableError =
            'App Store Server API returned mismatched transactionId';
          continue;
        }

        if (!allowedBundleIds.includes(transaction.bundleId)) {
          lastRecoverableError =
            'App Store transaction bundleId is not in allowlist';
          continue;
        }

        return {
          environment: transaction.environment,
          signedTransactionInfo: authoritativeJws,
          transaction,
        };
      } catch (error: any) {
        const statusCode = extractStatusCode(error);

        if (statusCode === 401 || statusCode === 403) {
          throw createError({
            statusCode: 502,
            statusMessage:
              'Failed to authorize App Store Server API request. Check APPLE_IAP credentials.',
          });
        }

        // Для 4xx/404 по конкретному env/bundle продолжаем перебор.
        lastRecoverableError = extractUpstreamMessage(error);
      }
    }
  }

  throw createError({
    statusCode: 400,
    statusMessage:
      lastRecoverableError ||
      'Apple transaction was not found in App Store Server API',
  });
}
