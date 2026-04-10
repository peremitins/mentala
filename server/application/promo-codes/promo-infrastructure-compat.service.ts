const PROMO_RELATIONS = new Set([
  'promo_campaigns',
  'promo_code_redemptions',
  'billing_access_grants',
  'billing_discount_grants',
  'billing_schedule_adjustments',
]);

const REFERRAL_RELATIONS = new Set([
  'user_referral_profiles',
  'referral_program_settings',
  'referral_redemptions',
  'billing_discount_grants',
]);

const warnedContexts = new Set<string>();

function extractMissingRelationName(error: unknown): string | null {
  const message =
    typeof (error as any)?.message === 'string' ? (error as any).message : '';
  const match = message.match(/relation "([^"]+)"/i);
  return match?.[1] || null;
}

function warnOnce(contextKey: string, relationName: string | null) {
  if (warnedContexts.has(contextKey)) {
    return;
  }

  warnedContexts.add(contextKey);
  console.warn(
    `[PromoCompat] Пропускаем promo/referral lookup до применения миграции. Missing relation: ${relationName || 'unknown'}`
  );
}

export function isMissingPromoInfrastructureError(error: unknown): boolean {
  if ((error as any)?.code !== '42P01') {
    return false;
  }

  const relationName = extractMissingRelationName(error);
  return relationName ? PROMO_RELATIONS.has(relationName) : true;
}

export function isMissingReferralInfrastructureError(error: unknown): boolean {
  if ((error as any)?.code !== '42P01') {
    return false;
  }

  const relationName = extractMissingRelationName(error);
  return relationName ? REFERRAL_RELATIONS.has(relationName) : true;
}

export function isMissingPromoOrReferralInfrastructureError(
  error: unknown
): boolean {
  return (
    isMissingPromoInfrastructureError(error) ||
    isMissingReferralInfrastructureError(error)
  );
}

export function handleMissingPromoInfrastructureError(
  error: unknown,
  contextKey: string
): boolean {
  if (!isMissingPromoInfrastructureError(error)) {
    return false;
  }

  warnOnce(contextKey, extractMissingRelationName(error));
  return true;
}

export function handleMissingReferralInfrastructureError(
  error: unknown,
  contextKey: string
): boolean {
  if (!isMissingReferralInfrastructureError(error)) {
    return false;
  }

  warnOnce(contextKey, extractMissingRelationName(error));
  return true;
}
