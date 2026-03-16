export interface SubscriptionCacheSnapshot {
  trialActive?: boolean;
  trialEndsAt?: string | null;
  currentEntitlementsPlan?: string | null;
  billingPlan?: string | null;
  billingCollectionStatus?: string | null;
  nextChargeAt?: string | null;
  graceEndsAt?: string | null;
  scheduledChange?: {
    effectiveAt?: string | null;
  } | null;
  features?: {
    aiChatMode?: string | null;
  } | null;
  subscription?: {
    id?: number | null;
    startDate?: string | null;
  } | null;
}

function toTimestamp(value?: string | null): number | null {
  if (!value) return null;
  const parsed = new Date(value).getTime();
  return Number.isFinite(parsed) ? parsed : null;
}

/**
 * Кэш подписки нельзя держать "слепо", потому что часть переходов по тарифу
 * происходит по времени, а не по явному пользовательскому действию.
 */
export function hasSubscriptionStateTransitionPassed(
  snapshot: SubscriptionCacheSnapshot | null | undefined,
  now: Date = new Date()
): boolean {
  if (!snapshot) {
    return false;
  }

  const nowTs = now.getTime();
  const trialEndsAtTs = toTimestamp(snapshot.trialEndsAt);
  if (
    snapshot.trialActive &&
    trialEndsAtTs !== null &&
    trialEndsAtTs <= nowTs
  ) {
    return true;
  }

  const nextChargeAtTs = toTimestamp(snapshot.nextChargeAt);
  if (
    snapshot.billingPlan &&
    nextChargeAtTs !== null &&
    nextChargeAtTs <= nowTs
  ) {
    return true;
  }

  const scheduledChangeAtTs = toTimestamp(
    snapshot.scheduledChange?.effectiveAt ?? null
  );
  if (scheduledChangeAtTs !== null && scheduledChangeAtTs <= nowTs) {
    return true;
  }

  const graceEndsAtTs = toTimestamp(snapshot.graceEndsAt);
  if (
    snapshot.billingCollectionStatus === 'past_due' &&
    graceEndsAtTs !== null &&
    graceEndsAtTs <= nowTs
  ) {
    return true;
  }

  return false;
}

/**
 * Usage зависит не только от факта логина, но и от текущего access-period.
 * При его смене старый usage-кэш надо инвалидировать.
 */
export function buildUsageCacheContextKey(
  snapshot: SubscriptionCacheSnapshot | null | undefined
): string {
  if (!snapshot) {
    return 'subscription:anonymous';
  }

  return JSON.stringify({
    currentEntitlementsPlan: snapshot.currentEntitlementsPlan ?? null,
    aiChatMode: snapshot.features?.aiChatMode ?? null,
    trialActive: Boolean(snapshot.trialActive),
    trialEndsAt: snapshot.trialEndsAt ?? null,
    billingPlan: snapshot.billingPlan ?? null,
    billingCollectionStatus: snapshot.billingCollectionStatus ?? null,
    nextChargeAt: snapshot.nextChargeAt ?? null,
    graceEndsAt: snapshot.graceEndsAt ?? null,
    scheduledChangeEffectiveAt: snapshot.scheduledChange?.effectiveAt ?? null,
    subscriptionId: snapshot.subscription?.id ?? null,
    subscriptionStartDate: snapshot.subscription?.startDate ?? null,
  });
}
