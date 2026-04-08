export type MentalaPlanId = 'basic' | 'pro' | 'premium';
export type MentalaPaidPlanId = 'pro' | 'premium';
export type PromoCampaignStatus =
  | 'draft'
  | 'active'
  | 'paused'
  | 'consumed'
  | 'expired'
  | 'revoked';
export type PromoCampaignType =
  | 'free_access_days'
  | 'next_payment_percent_discount';
export type PromoBindingMode = 'none' | 'user_id' | 'email';
export type PromoPlanMode = 'auto' | 'explicit';
export type PromoTargetPlanScope = 'any_paid' | 'pro' | 'premium';
export type PromoTargetPeriodScope = 'any' | 'month' | 'year';
export type PromoDiscountGrantKind = 'admin_promo' | 'invitee_referral';
export type PromoDiscountGrantStatus =
  | 'active'
  | 'reserved'
  | 'applied'
  | 'expired'
  | 'revoked';

export const PLAN_RANK: Record<MentalaPlanId, number> = {
  basic: 0,
  pro: 1,
  premium: 2,
};

export function normalizePromoCode(value: string | null | undefined): string {
  return String(value || '')
    .trim()
    .toUpperCase()
    .replace(/\s+/g, '');
}

export function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * 24 * 60 * 60 * 1000);
}

export function isMentalaPlanId(
  value: string | null | undefined
): value is MentalaPlanId {
  return value === 'basic' || value === 'pro' || value === 'premium';
}

export function isPaidPlanId(
  value: string | null | undefined
): value is MentalaPaidPlanId {
  return value === 'pro' || value === 'premium';
}

export function isHigherPlan(
  candidatePlanId: MentalaPlanId,
  basePlanId: MentalaPlanId
): boolean {
  return PLAN_RANK[candidatePlanId] > PLAN_RANK[basePlanId];
}

export function isLowerPlan(
  candidatePlanId: MentalaPlanId,
  basePlanId: MentalaPlanId
): boolean {
  return PLAN_RANK[candidatePlanId] < PLAN_RANK[basePlanId];
}

export function getDiscountGrantPriority(params: {
  grantKind: PromoDiscountGrantKind;
  bindingMode?: PromoBindingMode | null;
}): number {
  if (params.grantKind === 'admin_promo') {
    return params.bindingMode === 'none' ? 2 : 1;
  }

  return 3;
}

export function describePlanLabel(planId: MentalaPlanId): string {
  if (planId === 'premium') return 'Premium';
  if (planId === 'pro') return 'PRO';
  return 'Basic';
}

export function calculateDiscountedAmount(params: {
  amount: number;
  percent: number;
}) {
  const discountAmount = Math.round(
    Math.max(0, params.amount) * (Math.max(0, params.percent) / 100)
  );

  return {
    discountAmount,
    finalAmount: Math.max(0, Math.round(params.amount) - discountAmount),
  };
}
