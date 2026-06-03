import { describe, expect, it } from 'vitest';

import {
  ANNUAL_DISCOUNT_PERCENT,
  calculateAnnualSavings,
  calculateSubscriptionPrice,
} from '../shared/utils/subscriptionPricing';

describe('subscription pricing', () => {
  it('считает годовую цену со скидкой 30%', () => {
    expect(ANNUAL_DISCOUNT_PERCENT).toBe(30);
    expect(calculateSubscriptionPrice(399, 'year')).toBe(3352);
    expect(calculateSubscriptionPrice(899, 'year')).toBe(7552);
  });

  it('оставляет месячную цену без годовой скидки', () => {
    expect(calculateSubscriptionPrice(399, 'month')).toBe(399);
    expect(calculateSubscriptionPrice(899, 'month')).toBe(899);
  });

  it('считает экономию относительно оплаты 12 месяцев подряд', () => {
    expect(calculateAnnualSavings(399)).toBe(1436);
    expect(calculateAnnualSavings(899)).toBe(3236);
  });
});
