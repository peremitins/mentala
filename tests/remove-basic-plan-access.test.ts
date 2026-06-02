import { describe, expect, it } from 'vitest';

import {
  DEFAULT_FEATURE_ACCESS_POLICIES,
  getFeatureAccessOrDefault,
  type BillingSnapshot,
} from '../server/application/subscriptions/entitlements.service';
import {
  isPublicSubscriptionPlanId,
  PUBLIC_SUBSCRIPTION_PLAN_IDS,
} from '../server/application/subscriptions/public-plans';
import { resolveNavigationFeatureKey } from '../app/lib/navigation';

function buildSnapshot(): BillingSnapshot {
  return {
    planId: 'basic',
    trialActive: false,
    trialEndsAt: null,
    aiChatMode: 'disabled',
    weeklyMinutesLimit: 0,
    fairUseGuardMinutesPerWeek: null,
    entitlementsVersion: 'test',
    features: {},
  };
}

describe('remove public Basic access policy', () => {
  it('оставляет публичными только PRO и Premium', () => {
    expect(PUBLIC_SUBSCRIPTION_PLAN_IDS).toEqual(['pro', 'premium']);
    expect(isPublicSubscriptionPlanId('pro')).toBe(true);
    expect(isPublicSubscriptionPlanId('premium')).toBe(true);
    expect(isPublicSubscriptionPlanId('basic')).toBe(false);
  });

  it('закрывает неизвестный feature key Pro-paywall по умолчанию', () => {
    const access = getFeatureAccessOrDefault(
      buildSnapshot(),
      'unknown.future.feature'
    );

    expect(access.available).toBe(false);
    expect(access.requiredPlan).toBe('pro');
    expect(access.paywall?.targetPlan).toBe('pro');
  });

  it('содержит явные политики для quick help и roadmap', () => {
    const featureKeys = DEFAULT_FEATURE_ACCESS_POLICIES.map(
      (policy) => policy.featureKey
    );

    expect(featureKeys).toContain('quick_help.practice');
    expect(featureKeys).toContain('programs.roadmap.full');
    expect(featureKeys).toContain('notifications.text_source_ai');
    expect(featureKeys).toContain('notifications.custom_prompt_ai');
  });

  it('не оставляет бесплатных navigation bypass для дыхания и quick-help', () => {
    expect(
      resolveNavigationFeatureKey({
        type: 'breath_practice',
        slug: 'box-breathing',
      })
    ).toBe('breath.catalog.full');
    expect(
      resolveNavigationFeatureKey({
        type: 'breath_practice',
        slug: '4-7-8',
      })
    ).toBe('breath.catalog.full');
    expect(resolveNavigationFeatureKey({ type: 'quick_help' })).toBeNull();
    expect(
      resolveNavigationFeatureKey({
        type: 'quick_help_entry',
        entry: 'thought_dump',
      })
    ).toBe('quick_help.practice');
  });
});
