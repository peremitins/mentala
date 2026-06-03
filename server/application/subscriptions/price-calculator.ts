import {
  ANNUAL_DISCOUNT_FACTOR,
  calculateSubscriptionPrice,
  type SubscriptionBillingPeriod,
} from '@/shared/utils/subscriptionPricing';

export { ANNUAL_DISCOUNT_FACTOR };

export type BillingPeriod = SubscriptionBillingPeriod;

export interface PlanPriceParams {
  baseMonthlyPrice: number;
  billingPeriod: BillingPeriod;
}

/**
 * Рассчитывает итоговую цену плана с учетом периода оплаты
 */
export function calculatePlanPrice(params: PlanPriceParams): number {
  return calculateSubscriptionPrice(
    params.baseMonthlyPrice,
    params.billingPeriod
  );
}
