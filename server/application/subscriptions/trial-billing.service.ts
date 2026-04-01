import { createHash } from 'node:crypto';
import { TRIAL_BILLING_EARLY_CHARGE_MS } from '@/server/config/subscription';

export type TrialBillingPlanId = 'pro' | 'premium';
export type TrialBillingPeriod = 'month' | 'year';
export type BillingCollectionStatus = 'none' | 'scheduled' | 'past_due';
export type EntitlementsPlanId = 'basic' | 'pro' | 'premium';

const BILLING_PLAN_SET = new Set<TrialBillingPlanId>(['pro', 'premium']);
const BILLING_PERIOD_SET = new Set<TrialBillingPeriod>(['month', 'year']);
const BILLING_COLLECTION_STATUS_SET = new Set<BillingCollectionStatus>([
  'none',
  'scheduled',
  'past_due',
]);

/**
 * Проверяет, что план допустим для платного trial-scheduled биллинга.
 */
export function isTrialBillingPlanId(
  planId: string | null | undefined
): planId is TrialBillingPlanId {
  return Boolean(planId && BILLING_PLAN_SET.has(planId as TrialBillingPlanId));
}

/**
 * Проверяет, что период допустим для trial-scheduled биллинга.
 */
export function isTrialBillingPeriod(
  period: string | null | undefined
): period is TrialBillingPeriod {
  return Boolean(
    period && BILLING_PERIOD_SET.has(period as TrialBillingPeriod)
  );
}

/**
 * Приводит статус collection к поддерживаемому значению.
 */
export function normalizeBillingCollectionStatus(
  status: string | null | undefined
): BillingCollectionStatus {
  if (
    status &&
    BILLING_COLLECTION_STATUS_SET.has(status as BillingCollectionStatus)
  ) {
    return status as BillingCollectionStatus;
  }

  return 'none';
}

/**
 * Trial считается активным, пока trialEndedAt больше текущего времени.
 */
export function isTrialActiveAt(
  trialEndedAt: Date | null | undefined,
  now: Date = new Date()
): boolean {
  return Boolean(trialEndedAt && trialEndedAt.getTime() > now.getTime());
}

/**
 * Единая реализация BR-0: вычисление эффективного плана доступов.
 */
export function resolveCurrentEntitlementsPlan(params: {
  now: Date;
  trialActive: boolean;
  billingPlanId?: string | null;
  billingCollectionStatus?: string | null;
  graceEndsAt?: Date | null;
  activePaidPlanId?: string | null;
}): EntitlementsPlanId {
  const status = normalizeBillingCollectionStatus(
    params.billingCollectionStatus
  );
  const billingPlanId = isTrialBillingPlanId(params.billingPlanId)
    ? params.billingPlanId
    : null;
  const graceExpired =
    params.graceEndsAt && params.now.getTime() >= params.graceEndsAt.getTime();

  if (status === 'past_due' && graceExpired) {
    return 'basic';
  }

  if (params.trialActive) {
    // Пока trial активен, доступы всегда остаются Premium-level.
    // Выбранный billingPlan влияет только на будущее списание после trial.
    return 'premium';
  }

  if (
    params.activePaidPlanId === 'pro' ||
    params.activePaidPlanId === 'premium'
  ) {
    return params.activePaidPlanId;
  }

  // Пока scheduled/past_due не завершились откатом в basic, держим доступы платными.
  if (
    billingPlanId &&
    (status === 'scheduled' || (status === 'past_due' && !graceExpired))
  ) {
    return billingPlanId;
  }

  return 'basic';
}

/**
 * Детерминированный ключ попытки списания (идемпотентность worker/retry).
 */
export function buildChargeAttemptKey(params: {
  userId: number;
  nextChargeAt: Date;
  billingPlanId: TrialBillingPlanId;
  billingPeriod: TrialBillingPeriod;
}): string {
  const raw = `${params.userId}:${params.nextChargeAt.toISOString()}:${params.billingPlanId}:${params.billingPeriod}`;
  return createHash('sha256').update(raw, 'utf8').digest('hex');
}

/**
 * Уникальный idempotence key для YooKassa (макс. 64 символа).
 * Каждая попытка (auto/manual) получает свой ключ.
 */
export function buildProviderIdempotenceKey(params: {
  chargeAttemptKey: string;
  attemptMode: 'automatic' | 'manual';
  attemptOrdinal: number;
}): string {
  const raw = `${params.chargeAttemptKey}:${params.attemptMode}:${params.attemptOrdinal}`;
  return createHash('sha256').update(raw, 'utf8').digest('hex');
}

/**
 * Расписание автоматических попыток в рамках grace period 48ч: 0h, +6h, +24h.
 */
export function resolveNextAutoRetryAt(params: {
  scheduledChargeAt: Date;
  autoAttemptCount: number;
}): Date | null {
  if (params.autoAttemptCount <= 1) {
    return new Date(params.scheduledChargeAt.getTime() + 6 * 60 * 60 * 1000);
  }

  if (params.autoAttemptCount === 2) {
    return new Date(params.scheduledChargeAt.getTime() + 24 * 60 * 60 * 1000);
  }

  return null;
}

/**
 * Проверяет, можно ли использовать manual/auto retry прямо сейчас.
 */
export function canRunChargeAttemptNow(
  nextChargeAt: Date | null | undefined,
  now: Date = new Date(),
  earlyChargeWindowMs = 0
): boolean {
  if (!nextChargeAt) {
    return false;
  }

  const dueAt = nextChargeAt.getTime() - Math.max(0, earlyChargeWindowMs);
  return dueAt <= now.getTime();
}

/**
 * Для scheduled-списаний допускаем ранний запуск, чтобы не было gap в доступах.
 */
export function canRunTrialBillingAttemptNow(params: {
  nextChargeAt: Date | null | undefined;
  billingCollectionStatus?: string | null;
  now?: Date;
}): boolean {
  const status = normalizeBillingCollectionStatus(
    params.billingCollectionStatus
  );
  const earlyWindowMs =
    status === 'scheduled' ? TRIAL_BILLING_EARLY_CHARGE_MS : 0;

  return canRunChargeAttemptNow(
    params.nextChargeAt,
    params.now ?? new Date(),
    earlyWindowMs
  );
}
