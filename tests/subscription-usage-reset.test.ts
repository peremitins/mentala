import { describe, expect, it } from 'vitest';

import {
  buildUsageCacheContextKey,
  hasSubscriptionStateTransitionPassed,
} from '../app/utils/subscription-cache';
import {
  calculateUsageForSessionsInWindow,
  calculateUsageSecondsForSessionsInWindow,
  type TherapySessionUsageRecord,
} from '../server/application/subscriptions/usage-calculation.utils';
import { resolveAiUsagePeriodStartedAt } from '../server/application/subscriptions/usage-period.utils';

describe('subscription usage reset', () => {
  it('считает usage только после старта нового paid-периода внутри недели', () => {
    const sessions: TherapySessionUsageRecord[] = [
      {
        startedAt: new Date('2026-03-18T10:30:00.000Z'),
        endedAt: new Date('2026-03-18T13:30:00.000Z'),
        lastActivityAt: new Date('2026-03-18T13:30:00.000Z'),
      },
      {
        startedAt: new Date('2026-03-18T14:00:00.000Z'),
        endedAt: new Date('2026-03-18T15:20:00.000Z'),
        lastActivityAt: new Date('2026-03-18T15:20:00.000Z'),
      },
    ];

    const usedMinutes = calculateUsageForSessionsInWindow(sessions, {
      windowStart: new Date('2026-03-18T12:00:00.000Z'),
      windowEnd: new Date('2026-03-23T00:00:00.000Z'),
      idleTimeoutMs: 15 * 60 * 1000,
      now: new Date('2026-03-18T16:00:00.000Z'),
    });

    expect(usedMinutes).toBe(170);
  });

  it('для realtime voice считает точную длительность в секундах без списания только полных минут', () => {
    const sessions: TherapySessionUsageRecord[] = [
      {
        startedAt: new Date('2026-03-18T10:00:00.000Z'),
        endedAt: new Date('2026-03-18T10:00:59.000Z'),
        lastActivityAt: new Date('2026-03-18T10:00:59.000Z'),
      },
      {
        startedAt: new Date('2026-03-18T10:01:00.000Z'),
        endedAt: new Date('2026-03-18T10:01:59.000Z'),
        lastActivityAt: new Date('2026-03-18T10:01:59.000Z'),
      },
    ];

    const usedSeconds = calculateUsageSecondsForSessionsInWindow(sessions, {
      windowStart: new Date('2026-03-18T00:00:00.000Z'),
      windowEnd: new Date('2026-03-19T00:00:00.000Z'),
      idleTimeoutMs: 15 * 60 * 1000,
      now: new Date('2026-03-18T12:00:00.000Z'),
    });

    expect(usedSeconds).toBe(118);
  });

  it('берет startDate активной paid-подписки как старт нового access-period', () => {
    const startedAt = new Date('2026-03-18T12:00:00.000Z');

    const usagePeriodStartedAt = resolveAiUsagePeriodStartedAt({
      trialActive: false,
      currentEntitlementsPlan: 'pro',
      activePaidSubscription: {
        planId: 'pro',
        startDate: startedAt,
      },
      billingPlanId: null,
      billingCollectionStatus: 'none',
      nextChargeAt: null,
    });

    expect(usagePeriodStartedAt).toEqual(startedAt);
  });

  it('берет nextChargeAt для scheduled paid-доступа без активной подписки', () => {
    const nextChargeAt = new Date('2026-03-18T12:00:00.000Z');

    const usagePeriodStartedAt = resolveAiUsagePeriodStartedAt({
      trialActive: false,
      currentEntitlementsPlan: 'premium',
      activePaidSubscription: null,
      billingPlanId: 'premium',
      billingCollectionStatus: 'scheduled',
      nextChargeAt,
    });

    expect(usagePeriodStartedAt).toEqual(nextChargeAt);
  });

  it('не сбрасывает usage-окно, пока trial еще активен', () => {
    const usagePeriodStartedAt = resolveAiUsagePeriodStartedAt({
      trialActive: true,
      currentEntitlementsPlan: 'premium',
      activePaidSubscription: null,
      billingPlanId: 'pro',
      billingCollectionStatus: 'scheduled',
      nextChargeAt: new Date('2026-03-18T12:00:00.000Z'),
    });

    expect(usagePeriodStartedAt).toBeNull();
  });
});

describe('subscription cache helpers', () => {
  it('пробивает subscription TTL после окончания trial', () => {
    const shouldRefetch = hasSubscriptionStateTransitionPassed(
      {
        trialActive: true,
        trialEndsAt: '2026-03-18T12:00:00.000Z',
      },
      new Date('2026-03-18T12:00:01.000Z')
    );

    expect(shouldRefetch).toBe(true);
  });

  it('инвалидирует usage-кэш при старте новой подписки', () => {
    const previousKey = buildUsageCacheContextKey({
      currentEntitlementsPlan: 'premium',
      trialActive: true,
      trialEndsAt: '2026-03-18T12:00:00.000Z',
      features: {
        aiChatMode: 'unlimited_fair_use',
      },
      subscription: null,
    });
    const nextKey = buildUsageCacheContextKey({
      currentEntitlementsPlan: 'pro',
      trialActive: false,
      trialEndsAt: '2026-03-18T12:00:00.000Z',
      features: {
        aiChatMode: 'limited',
      },
      subscription: {
        id: 42,
        startDate: '2026-03-18T12:00:00.000Z',
      },
    });

    expect(nextKey).not.toBe(previousKey);
  });
});
