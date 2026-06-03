export type SubscriptionBillingPeriod = 'month' | 'year';

export const ANNUAL_DISCOUNT_PERCENT = 30;
export const ANNUAL_DISCOUNT_FACTOR = (100 - ANNUAL_DISCOUNT_PERCENT) / 100;

/**
 * Единая формула цены подписки для backend checkout, приложения и лендинга.
 */
export function calculateSubscriptionPrice(
  baseMonthlyPrice: number,
  billingPeriod: SubscriptionBillingPeriod
): number {
  if (billingPeriod === 'year') {
    return Math.round(baseMonthlyPrice * 12 * ANNUAL_DISCOUNT_FACTOR);
  }

  return Math.round(baseMonthlyPrice);
}

/**
 * Экономия относительно оплаты 12 отдельных месячных периодов.
 */
export function calculateAnnualSavings(baseMonthlyPrice: number): number {
  const yearlyPrice = calculateSubscriptionPrice(baseMonthlyPrice, 'year');
  const fullMonthlyYearPrice = baseMonthlyPrice * 12;

  return Math.max(0, Math.round(fullMonthlyYearPrice - yearlyPrice));
}
