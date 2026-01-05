/**
 * Константы и функции для расчета цен подписок
 */

/**
 * Константы для расчета цен
 */
export const ANNUAL_DISCOUNT_FACTOR = 0.8; // Скидка 20% на годовой план
export const WEEKS_IN_MONTH = 4;
export const BASE_PRICE_PRO = 349;
export const BASE_PRICE_PREMIUM = 649;
export const PRICE_PER_MINUTE_GPT = 0.66;
export const PRICE_PER_MINUTE_AVATAR = 0.9;

export type BillingPeriod = 'month' | 'year';

export interface PlanPriceParams {
  baseMonthlyPrice: number;
  billingPeriod: BillingPeriod;
  isCustom: boolean;
  monthlyCustomPrice?: number;
}

/**
 * Рассчитывает итоговую цену плана с учетом периода оплаты
 */
export function calculatePlanPrice(params: PlanPriceParams): number {
  let monthlyPrice: number;

  if (params.isCustom && params.monthlyCustomPrice != null) {
    monthlyPrice = params.monthlyCustomPrice;
  } else {
    monthlyPrice = params.baseMonthlyPrice;
  }

  if (params.billingPeriod === 'year') {
    return Math.round(monthlyPrice * 12 * ANNUAL_DISCOUNT_FACTOR);
  }

  return Math.round(monthlyPrice);
}

/**
 * Рассчитывает цену Custom плана
 */
export function calculateCustomPrice(params: {
  weeklyMinutes: number;
  billingPeriod: BillingPeriod;
}): number {
  const totalMinutesPerMonth = params.weeklyMinutes * WEEKS_IN_MONTH;

  let monthlyPrice =
    BASE_PRICE_PRO + PRICE_PER_MINUTE_GPT * totalMinutesPerMonth;

  // Минимальная цена: PRO
  const minPrice = BASE_PRICE_PRO;
  monthlyPrice = Math.max(monthlyPrice, minPrice);

  return calculatePlanPrice({
    baseMonthlyPrice: monthlyPrice,
    billingPeriod: params.billingPeriod,
    isCustom: true,
    monthlyCustomPrice: monthlyPrice,
  });
}
