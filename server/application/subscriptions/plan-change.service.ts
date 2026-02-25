/**
 * Сервис policy-логики смены тарифа:
 * - классификация noop | upgrade_now | downgrade_later
 * - расчет суммы checkout без billingCredit
 * - спец-формула month->year: yearPrice - unusedCurrentValue
 */

import { calculatePlanPrice, type BillingPeriod } from './price-calculator';

export type PlanChangePolicyAction = 'noop' | 'upgrade_now' | 'downgrade_later';

export interface ActiveSubscriptionSnapshot {
  id: number;
  planId: string;
  billingPeriod: BillingPeriod;
  startDate: Date;
  endDate: Date;
  baseMonthlyPrice: number;
}

export interface TargetPlanSnapshot {
  planId: string;
  billingPeriod: BillingPeriod;
  baseMonthlyPrice: number;
}

export interface PlanChangeDecision {
  policyAction: PlanChangePolicyAction;
  amount: number;
  toPay: number;
  unusedCurrentValue: number;
  targetChargeValue: number;
  nextEndDate: Date | null;
}

const PLAN_ORDER: Record<string, number> = {
  basic: 0,
  pro: 1,
  premium: 2,
};

const DAY_MS = 24 * 60 * 60 * 1000;

function getPlanRank(planId: string): number {
  return PLAN_ORDER[planId] ?? 0;
}

function getPeriodDays(period: BillingPeriod): number {
  return period === 'year' ? 365 : 30;
}

function roundRub(value: number): number {
  return Math.max(0, Math.round(value));
}

function computeRemainingMs(
  current: ActiveSubscriptionSnapshot,
  now: Date
): number {
  return Math.max(0, current.endDate.getTime() - now.getTime());
}

function computeRemainingDays(
  current: ActiveSubscriptionSnapshot,
  now: Date
): number {
  return computeRemainingMs(current, now) / DAY_MS;
}

function computeUnusedCurrentValue(
  current: ActiveSubscriptionSnapshot,
  now: Date
): number {
  const currentTotalPrice = calculatePlanPrice({
    baseMonthlyPrice: current.baseMonthlyPrice,
    billingPeriod: current.billingPeriod,
  });
  const totalMs = Math.max(
    DAY_MS,
    current.endDate.getTime() - current.startDate.getTime()
  );
  const remainingRatio = Math.min(
    1,
    Math.max(0, computeRemainingMs(current, now) / totalMs)
  );

  return currentTotalPrice * remainingRatio;
}

function resolvePolicyAction(params: {
  current: ActiveSubscriptionSnapshot | null;
  target: TargetPlanSnapshot;
}): PlanChangePolicyAction {
  const { current, target } = params;
  if (!current) {
    return 'upgrade_now';
  }

  if (
    current.planId === target.planId &&
    current.billingPeriod === target.billingPeriod
  ) {
    return 'noop';
  }

  const rankDiff = getPlanRank(target.planId) - getPlanRank(current.planId);
  if (rankDiff > 0) {
    return 'upgrade_now';
  }
  if (rankDiff < 0) {
    return 'downgrade_later';
  }

  if (current.billingPeriod === 'month' && target.billingPeriod === 'year') {
    return 'upgrade_now';
  }
  if (current.billingPeriod === 'year' && target.billingPeriod === 'month') {
    return 'downgrade_later';
  }

  return 'noop';
}

export function calculatePlanChangeDecision(params: {
  current: ActiveSubscriptionSnapshot | null;
  target: TargetPlanSnapshot;
  now?: Date;
}): PlanChangeDecision {
  const now = params.now ?? new Date();
  const { current, target } = params;
  const targetTotalPrice = calculatePlanPrice({
    baseMonthlyPrice: target.baseMonthlyPrice,
    billingPeriod: target.billingPeriod,
  });
  const policyAction = resolvePolicyAction({ current, target });

  if (policyAction === 'noop') {
    return {
      policyAction,
      amount: targetTotalPrice,
      toPay: 0,
      unusedCurrentValue: current ? computeUnusedCurrentValue(current, now) : 0,
      targetChargeValue: 0,
      nextEndDate: current?.endDate ?? null,
    };
  }

  if (policyAction === 'downgrade_later') {
    return {
      policyAction,
      amount: targetTotalPrice,
      toPay: 0,
      unusedCurrentValue: current ? computeUnusedCurrentValue(current, now) : 0,
      targetChargeValue: 0,
      nextEndDate: current?.endDate ?? null,
    };
  }

  if (!current) {
    const targetDays = getPeriodDays(target.billingPeriod);
    return {
      policyAction,
      amount: targetTotalPrice,
      toPay: targetTotalPrice,
      unusedCurrentValue: 0,
      targetChargeValue: targetTotalPrice,
      nextEndDate: new Date(now.getTime() + targetDays * DAY_MS),
    };
  }

  const unusedCurrentValue = computeUnusedCurrentValue(current, now);
  const isMonthToYearUpgrade =
    current.billingPeriod === 'month' && target.billingPeriod === 'year';

  let targetChargeValue = 0;
  let nextEndDate = current.endDate;

  if (isMonthToYearUpgrade) {
    targetChargeValue = targetTotalPrice;
    nextEndDate = new Date(now.getTime() + getPeriodDays('year') * DAY_MS);
  } else {
    const remainingDays = computeRemainingDays(current, now);
    const targetDays = getPeriodDays(target.billingPeriod);
    const proratedShare = Math.max(0, Math.min(1, remainingDays / targetDays));
    targetChargeValue = targetTotalPrice * proratedShare;
  }

  return {
    policyAction,
    amount: targetTotalPrice,
    toPay: roundRub(Math.max(0, targetChargeValue - unusedCurrentValue)),
    unusedCurrentValue,
    targetChargeValue,
    nextEndDate,
  };
}
