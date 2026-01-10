/**
 * Константы и функции для расчета цен подписок
 */

/**
 * Константы для расчета цен
 */
export const ANNUAL_DISCOUNT_FACTOR = 0.8; // Скидка 20% на годовой план

export type BillingPeriod = 'month' | 'year';

export interface PlanPriceParams {
  baseMonthlyPrice: number;
  billingPeriod: BillingPeriod;
}

/**
 * Рассчитывает итоговую цену плана с учетом периода оплаты
 */
export function calculatePlanPrice(params: PlanPriceParams): number {
  const monthlyPrice = params.baseMonthlyPrice;

  if (params.billingPeriod === 'year') {
    return Math.round(monthlyPrice * 12 * ANNUAL_DISCOUNT_FACTOR);
  }

  return Math.round(monthlyPrice);
}
