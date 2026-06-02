import { describe, expect, it } from 'vitest';
import { isAppLockSuppressedRoute } from '../app/utils/appLockRoutes';

describe('app lock suppressed routes', () => {
  it('не показывает локальный код на публичных share-ссылках', () => {
    expect(isAppLockSuppressedRoute('/share/garden/calm_anxiety_30')).toBe(true);
    expect(isAppLockSuppressedRoute('/share/garden/self_kindness_21')).toBe(
      true
    );
  });
});
