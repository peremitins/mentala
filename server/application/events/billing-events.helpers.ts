import { dispatchBillingPlanChangedEvent } from './app-events.dispatchers';

export type BillingPlanSnapshot = {
  subscriptionId?: number | null;
  planId?: string | null;
  billingPeriod?: string | null;
};

function normalizeNullableString(value: unknown): string | null {
  const normalized = String(value || '').trim();
  return normalized ? normalized : null;
}

export function hasBillingPlanChanged(params: {
  previous: BillingPlanSnapshot | null | undefined;
  next: BillingPlanSnapshot | null | undefined;
}): boolean {
  const previousPlanId = normalizeNullableString(params.previous?.planId);
  const previousBillingPeriod = normalizeNullableString(
    params.previous?.billingPeriod
  );
  const nextPlanId = normalizeNullableString(params.next?.planId);
  const nextBillingPeriod = normalizeNullableString(params.next?.billingPeriod);

  if (!previousPlanId || !nextPlanId) {
    return false;
  }

  return (
    previousPlanId !== nextPlanId || previousBillingPeriod !== nextBillingPeriod
  );
}

// Шлём событие только когда тариф реально изменился, а не просто переоткрылась
// та же подписка с тем же plan/billingPeriod.
export function dispatchBillingPlanChangedIfNeeded(params: {
  userId: number;
  source: string;
  previous: BillingPlanSnapshot | null | undefined;
  next: BillingPlanSnapshot;
  paymentId?: string | null;
  effectiveAt?: Date | string | null;
  occurredAt?: Date;
}): void {
  if (
    !hasBillingPlanChanged({
      previous: params.previous,
      next: params.next,
    })
  ) {
    return;
  }

  const previousPlanId = normalizeNullableString(params.previous?.planId);
  const nextPlanId = normalizeNullableString(params.next.planId);
  if (!previousPlanId || !nextPlanId) {
    return;
  }

  dispatchBillingPlanChangedEvent({
    userId: params.userId,
    source: params.source,
    fromSubscriptionId: params.previous?.subscriptionId ?? null,
    fromPlanId: previousPlanId,
    fromBillingPeriod: normalizeNullableString(params.previous?.billingPeriod),
    toSubscriptionId: params.next.subscriptionId ?? null,
    toPlanId: nextPlanId,
    toBillingPeriod: normalizeNullableString(params.next.billingPeriod),
    paymentId: normalizeNullableString(params.paymentId),
    effectiveAt: params.effectiveAt ?? null,
    occurredAt: params.occurredAt,
  });
}
