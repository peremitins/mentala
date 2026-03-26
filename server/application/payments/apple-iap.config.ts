import { createError } from 'h3';

export type AppleIapRuntimeConfig = {
  allowedBundleIds: string[];
  issuerId: string;
  keyId: string;
  privateKeyBase64: string;
  /**
   * true, если credentials для Apple Server API полностью сконфигурированы.
   * false только в dev-режиме — позволяет тестировать через Xcode StoreKit Configuration
   * без реального обращения к Apple Server API.
   */
  serverApiAvailable: boolean;
};

function splitAllowedBundleIds(raw: unknown): string[] {
  const text = String(raw || '').trim();
  if (!text) return [];
  return text
    .split(/[\s,]+/g)
    .map((value) => value.trim())
    .filter(Boolean);
}

function isDev(): boolean {
  return process.env.NODE_ENV !== 'production';
}

export function resolveAppleIapRuntimeConfig(
  event: any
): AppleIapRuntimeConfig {
  const config = useRuntimeConfig(event) as any;

  const allowedBundleIds = splitAllowedBundleIds(
    config.appleIapBundleIds ||
      config.appleIapBundleId ||
      process.env.APPLE_IAP_BUNDLE_IDS ||
      process.env.NUXT_APPLE_IAP_BUNDLE_IDS ||
      process.env.NUXT_APPLE_IAP_BUNDLE_ID
  );

  const issuerId = String(
    config.appleIapIssuerId ||
      process.env.APPLE_IAP_ISSUER_ID ||
      process.env.NUXT_APPLE_IAP_ISSUER_ID ||
      ''
  ).trim();
  const keyId = String(
    config.appleIapKeyId ||
      process.env.APPLE_IAP_KEY_ID ||
      process.env.NUXT_APPLE_IAP_KEY_ID ||
      ''
  ).trim();
  const privateKeyBase64 = String(
    config.appleIapPrivateKeyBase64 ||
      process.env.APPLE_IAP_PRIVATE_KEY_BASE64 ||
      process.env.NUXT_APPLE_IAP_PRIVATE_KEY_BASE64 ||
      ''
  ).trim();

  // В dev-режиме допускаем отсутствие bundle IDs — используем wildcard для Xcode тестирования.
  if (!allowedBundleIds.length && !isDev()) {
    throw createError({
      statusCode: 500,
      statusMessage: 'Apple IAP bundle allowlist is not configured',
    });
  }

  const serverApiAvailable = !!(issuerId && keyId && privateKeyBase64);

  // В production credentials обязательны.
  if (!serverApiAvailable && !isDev()) {
    throw createError({
      statusCode: 500,
      statusMessage:
        'Apple IAP credentials are not configured (APPLE_IAP_ISSUER_ID / APPLE_IAP_KEY_ID / APPLE_IAP_PRIVATE_KEY_BASE64)',
    });
  }

  return {
    allowedBundleIds,
    issuerId,
    keyId,
    privateKeyBase64,
    serverApiAvailable,
  };
}
