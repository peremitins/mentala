export function roundCurrencyAmount(value: number): number {
  return Math.round(Number(value || 0) * 100) / 100;
}

export function resolveDefaultReferralCreditHoldDays(): number {
  const raw =
    process.env.REFERRAL_CREDIT_HOLD_DAYS ||
    process.env.NUXT_REFERRAL_CREDIT_HOLD_DAYS ||
    '';
  const parsed = Number(raw);
  if (Number.isFinite(parsed) && parsed >= 0) {
    return Math.max(0, Math.round(parsed));
  }

  return process.env.NODE_ENV === 'production' ? 14 : 1;
}

export function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + Math.max(0, days) * 24 * 60 * 60 * 1000);
}
