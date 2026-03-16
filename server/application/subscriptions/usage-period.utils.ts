export type EntitlementsPlanId = 'basic' | 'pro' | 'premium';
export type BillingCollectionStatus = 'none' | 'scheduled' | 'past_due';

type ActivePaidSubscriptionRef = {
  planId: string;
  startDate: Date;
} | null;

function isPaidPlanId(
  planId: string | null | undefined
): planId is 'pro' | 'premium' {
  return planId === 'pro' || planId === 'premium';
}

function normalizeBillingCollectionStatus(
  status: string | null | undefined
): BillingCollectionStatus {
  if (status === 'scheduled' || status === 'past_due') {
    return status;
  }

  return 'none';
}

/**
 * Возвращает старт текущего AI access-period, если лимит должен считаться
 * не с начала календарной недели, а с момента фактической смены доступа.
 */
export function resolveAiUsagePeriodStartedAt(params: {
  trialActive: boolean;
  currentEntitlementsPlan: EntitlementsPlanId;
  activePaidSubscription?: ActivePaidSubscriptionRef;
  billingPlanId?: string | null;
  billingCollectionStatus?: string | null;
  nextChargeAt?: Date | null;
}): Date | null {
  if (params.trialActive) {
    return null;
  }

  const activePaidSubscription = params.activePaidSubscription ?? null;
  if (
    activePaidSubscription &&
    activePaidSubscription.planId === params.currentEntitlementsPlan &&
    isPaidPlanId(activePaidSubscription.planId)
  ) {
    return activePaidSubscription.startDate;
  }

  const billingPlanId = isPaidPlanId(params.billingPlanId)
    ? params.billingPlanId
    : null;
  const billingCollectionStatus = normalizeBillingCollectionStatus(
    params.billingCollectionStatus
  );

  if (
    billingPlanId &&
    billingPlanId === params.currentEntitlementsPlan &&
    params.nextChargeAt &&
    (billingCollectionStatus === 'scheduled' ||
      billingCollectionStatus === 'past_due')
  ) {
    return params.nextChargeAt;
  }

  return null;
}
