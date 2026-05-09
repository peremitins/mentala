import type { AppLockAfterSeconds } from '@/app/utils/appLockCrypto';

export const APP_LOCK_COOLDOWN_AFTER_ATTEMPTS = 5;
export const APP_LOCK_LOGOUT_AFTER_ATTEMPTS = 10;
export const APP_LOCK_COOLDOWN_MS = 30_000;

export type AppLockFailedAttemptState = {
  failedAttempts: number;
  lockedUntil: number | null;
  shouldOfferLogout: boolean;
};

export function shouldLockAfterBackground(
  backgroundedAt: number | null,
  now: number,
  lockAfterSeconds: AppLockAfterSeconds
): boolean {
  if (!backgroundedAt) return false;
  if (lockAfterSeconds === 0) return true;
  return now - backgroundedAt >= lockAfterSeconds * 1000;
}

export function getFailedAttemptState(
  previousFailedAttempts: number,
  now: number
): AppLockFailedAttemptState {
  const failedAttempts = previousFailedAttempts + 1;
  return {
    failedAttempts,
    lockedUntil:
      failedAttempts >= APP_LOCK_COOLDOWN_AFTER_ATTEMPTS
        ? now + APP_LOCK_COOLDOWN_MS
        : null,
    shouldOfferLogout: failedAttempts >= APP_LOCK_LOGOUT_AFTER_ATTEMPTS,
  };
}

export function getRemainingCooldownSeconds(
  lockedUntil: number | null,
  now: number
): number {
  if (!lockedUntil || lockedUntil <= now) return 0;
  return Math.ceil((lockedUntil - now) / 1000);
}
