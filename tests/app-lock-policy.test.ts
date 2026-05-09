import { describe, expect, it } from 'vitest';
import {
  APP_LOCK_COOLDOWN_MS,
  getFailedAttemptState,
  getRemainingCooldownSeconds,
  shouldLockAfterBackground,
} from '../app/utils/appLockPolicy';

describe('app lock policy', () => {
  it('блокирует сразу или после выбранного интервала', () => {
    expect(shouldLockAfterBackground(1000, 1001, 0)).toBe(true);
    expect(shouldLockAfterBackground(1000, 60_999, 60)).toBe(false);
    expect(shouldLockAfterBackground(1000, 61_000, 60)).toBe(true);
    expect(shouldLockAfterBackground(null, 61_000, 60)).toBe(false);
  });

  it('ставит задержку после 5 попыток и предлагает logout после 10', () => {
    expect(getFailedAttemptState(3, 1000)).toEqual({
      failedAttempts: 4,
      lockedUntil: null,
      shouldOfferLogout: false,
    });
    expect(getFailedAttemptState(4, 1000)).toEqual({
      failedAttempts: 5,
      lockedUntil: 1000 + APP_LOCK_COOLDOWN_MS,
      shouldOfferLogout: false,
    });
    expect(getFailedAttemptState(9, 1000)).toEqual({
      failedAttempts: 10,
      lockedUntil: 1000 + APP_LOCK_COOLDOWN_MS,
      shouldOfferLogout: true,
    });
  });

  it('считает оставшуюся задержку в секундах', () => {
    expect(getRemainingCooldownSeconds(null, 1000)).toBe(0);
    expect(getRemainingCooldownSeconds(31_000, 1000)).toBe(30);
    expect(getRemainingCooldownSeconds(1000, 1000)).toBe(0);
  });
});
