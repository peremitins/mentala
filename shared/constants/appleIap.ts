// Apple In‑App Purchase продукты для подписок Mentala (App Store Connect).
// Важно: строки идентификаторов должны 1:1 совпадать с Product ID в App Store Connect.

export const APPLE_IAP_PRODUCTS = {
  'mentala.pro.monthly': { planId: 'pro', billingPeriod: 'month' },
  'mentala.pro.yearly': { planId: 'pro', billingPeriod: 'year' },
  'mentala.premium.monthly': { planId: 'premium', billingPeriod: 'month' },
  'mentala.premium.yearly': { planId: 'premium', billingPeriod: 'year' },
} as const;

export type AppleIapProductId = keyof typeof APPLE_IAP_PRODUCTS;

export type AppleIapPlanId =
  (typeof APPLE_IAP_PRODUCTS)[AppleIapProductId]['planId'];
export type AppleIapBillingPeriod =
  (typeof APPLE_IAP_PRODUCTS)[AppleIapProductId]['billingPeriod'];

export const APPLE_IAP_PRODUCT_IDS = Object.keys(
  APPLE_IAP_PRODUCTS
) as AppleIapProductId[];

export function resolveAppleIapProductId(params: {
  planId: 'pro' | 'premium';
  billingPeriod: 'month' | 'year';
}): AppleIapProductId | null {
  for (const [productId, meta] of Object.entries(APPLE_IAP_PRODUCTS)) {
    if (
      meta.planId === params.planId &&
      meta.billingPeriod === params.billingPeriod
    ) {
      return productId as AppleIapProductId;
    }
  }
  return null;
}

export function isAppleIapProductId(value: string): value is AppleIapProductId {
  return Object.prototype.hasOwnProperty.call(APPLE_IAP_PRODUCTS, value);
}
