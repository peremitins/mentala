import { describe, expect, it } from 'vitest';

import {
  calculateDiscountedAmount,
  getDiscountGrantPriority,
  isHigherPlan,
  isLowerPlan,
  normalizePromoCode,
} from '../server/application/promo-codes/promo.shared';

describe('promo shared helpers', () => {
  it('нормализует код промокода в uppercase без пробелов', () => {
    expect(normalizePromoCode('  ment ala 20  ')).toBe('MENTALA20');
  });

  it('корректно сравнивает уровни планов', () => {
    expect(isHigherPlan('premium', 'pro')).toBe(true);
    expect(isHigherPlan('pro', 'premium')).toBe(false);
    expect(isLowerPlan('pro', 'premium')).toBe(true);
    expect(isLowerPlan('premium', 'basic')).toBe(false);
  });

  it('выбирает правильный приоритет скидки по stacking policy', () => {
    expect(
      getDiscountGrantPriority({
        grantKind: 'admin_promo',
        bindingMode: 'user_id',
      })
    ).toBe(1);
    expect(
      getDiscountGrantPriority({
        grantKind: 'admin_promo',
        bindingMode: 'none',
      })
    ).toBe(2);
    expect(
      getDiscountGrantPriority({
        grantKind: 'invitee_referral',
      })
    ).toBe(3);
  });

  it('считает percentage discount и не уводит итог ниже нуля', () => {
    expect(
      calculateDiscountedAmount({
        amount: 999,
        percent: 20,
      })
    ).toEqual({
      discountAmount: 200,
      finalAmount: 799,
    });

    expect(
      calculateDiscountedAmount({
        amount: 499,
        percent: 100,
      })
    ).toEqual({
      discountAmount: 499,
      finalAmount: 0,
    });
  });
});
