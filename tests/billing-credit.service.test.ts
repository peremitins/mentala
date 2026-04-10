import { afterEach, describe, expect, it } from 'vitest';
import {
  resolveDefaultReferralCreditHoldDays,
  roundCurrencyAmount,
} from '../server/application/subscriptions/billing-credit.utils';

const originalHoldDays = process.env.REFERRAL_CREDIT_HOLD_DAYS;

afterEach(() => {
  if (originalHoldDays === undefined) {
    delete process.env.REFERRAL_CREDIT_HOLD_DAYS;
  } else {
    process.env.REFERRAL_CREDIT_HOLD_DAYS = originalHoldDays;
  }
});

describe('billing credit helpers', () => {
  it('округляет суммы до двух знаков после запятой', () => {
    expect(roundCurrencyAmount(12.345)).toBe(12.35);
    expect(roundCurrencyAmount(12.344)).toBe(12.34);
    expect(roundCurrencyAmount(-4.555)).toBe(-4.55);
  });

  it('читает env override для credit hold days', () => {
    process.env.REFERRAL_CREDIT_HOLD_DAYS = '5';
    expect(resolveDefaultReferralCreditHoldDays()).toBe(5);
  });
});
