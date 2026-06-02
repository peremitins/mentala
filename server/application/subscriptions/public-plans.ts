export const PUBLIC_SUBSCRIPTION_PLAN_IDS = ['pro', 'premium'] as const;

export type PublicSubscriptionPlanId =
  (typeof PUBLIC_SUBSCRIPTION_PLAN_IDS)[number];

const PUBLIC_SUBSCRIPTION_PLAN_ID_SET = new Set<string>(
  PUBLIC_SUBSCRIPTION_PLAN_IDS
);

export function isPublicSubscriptionPlanId(
  planId: string | null | undefined
): planId is PublicSubscriptionPlanId {
  return Boolean(planId && PUBLIC_SUBSCRIPTION_PLAN_ID_SET.has(planId));
}
