export type AppPlanId = 'basic' | 'pro' | 'premium';

type TranslateFn = (
  key: string,
  params?: Record<string, string | number>
) => string;

export function normalizePlanId(
  planId: string | null | undefined
): AppPlanId | null {
  if (planId === 'basic' || planId === 'pro' || planId === 'premium') {
    return planId;
  }

  return null;
}

export function getLocalizedPlanName(
  planId: string | null | undefined,
  t: TranslateFn
): string {
  const normalizedPlanId = normalizePlanId(planId);

  if (normalizedPlanId === 'basic') {
    return t('PLANS.BASIC');
  }

  if (normalizedPlanId === 'pro') {
    return t('PLANS.PRO');
  }

  if (normalizedPlanId === 'premium') {
    return t('PLANS.PREMIUM');
  }

  return planId || '—';
}

export function getLocalizedRequiredPlanLabel(
  planId: string | null | undefined,
  t: TranslateFn
): string {
  if (planId === 'premium') {
    return getLocalizedPlanName(planId, t);
  }

  if (planId === 'basic') {
    return getLocalizedPlanName(planId, t);
  }

  return t('PLANS.PRO_AND_PREMIUM');
}

export function getLocalizedTrialPlanLabel(
  t: TranslateFn,
  timeLeft?: string | null
): string {
  if (timeLeft) {
    return t('PLANS.TRIAL_WITH_TIME_LEFT', { timeLeft });
  }

  return t('PLANS.TRIAL');
}
