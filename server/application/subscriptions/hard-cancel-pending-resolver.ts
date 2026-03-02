import crypto from 'node:crypto';

export type ProviderPaymentStatus =
  | 'pending'
  | 'waiting_for_capture'
  | 'canceled'
  | 'succeeded'
  | 'unknown';

export interface PendingSubscriptionSnapshot {
  id: number;
  planId: string;
  yookassaPaymentId: string | null;
}

export interface HardCancelUnresolvedPayment {
  subscriptionId: number;
  planId: string;
  paymentId: string | null;
  reason:
    | 'provider_credentials_missing'
    | 'provider_check_failed'
    | 'provider_cancel_failed'
    | 'provider_payment_already_succeeded'
    | 'provider_status_unknown';
  providerStatus: ProviderPaymentStatus;
}

export interface ResolvePendingForHardCancelResult {
  cancelableSubscriptionIds: number[];
  providerCanceledPaymentIds: string[];
  unresolvedPendingPayments: HardCancelUnresolvedPayment[];
}

export interface ProviderPaymentSnapshot {
  status: ProviderPaymentStatus;
  paid: boolean;
}

export interface ResolvePendingForHardCancelParams {
  pendingSubscriptions: PendingSubscriptionSnapshot[];
  shopId?: string | null;
  secretKey?: string | null;
  now: Date;
  fetchProviderPayment: (params: {
    shopId: string;
    secretKey: string;
    paymentId: string;
  }) => Promise<ProviderPaymentSnapshot>;
  cancelProviderPayment: (params: {
    shopId: string;
    secretKey: string;
    paymentId: string;
    idempotenceKey: string;
  }) => Promise<ProviderPaymentSnapshot | null>;
}

export async function resolvePendingForHardCancel(
  params: ResolvePendingForHardCancelParams
): Promise<ResolvePendingForHardCancelResult> {
  const cancelableSubscriptionIds: number[] = [];
  const providerCanceledPaymentIds = new Set<string>();
  const unresolvedPendingPayments: HardCancelUnresolvedPayment[] = [];
  const shopId = String(params.shopId || '').trim();
  const secretKey = String(params.secretKey || '').trim();
  const canCallProvider = Boolean(shopId && secretKey);

  for (const pending of params.pendingSubscriptions) {
    const paymentId = String(pending.yookassaPaymentId || '').trim() || null;

    // Локальный pending без provider payment можно безопасно закрыть сразу.
    if (!paymentId) {
      cancelableSubscriptionIds.push(pending.id);
      continue;
    }

    if (!canCallProvider) {
      unresolvedPendingPayments.push({
        subscriptionId: pending.id,
        planId: pending.planId,
        paymentId,
        reason: 'provider_credentials_missing',
        providerStatus: 'unknown',
      });
      continue;
    }

    let providerSnapshot: ProviderPaymentSnapshot | null = null;
    try {
      providerSnapshot = await params.fetchProviderPayment({
        shopId,
        secretKey,
        paymentId,
      });
    } catch {
      unresolvedPendingPayments.push({
        subscriptionId: pending.id,
        planId: pending.planId,
        paymentId,
        reason: 'provider_check_failed',
        providerStatus: 'unknown',
      });
      continue;
    }

    if (providerSnapshot.status === 'canceled') {
      cancelableSubscriptionIds.push(pending.id);
      providerCanceledPaymentIds.add(paymentId);
      continue;
    }

    if (
      providerSnapshot.status === 'pending' ||
      providerSnapshot.status === 'waiting_for_capture'
    ) {
      const idempotenceKey = crypto
        .createHash('sha256')
        .update(
          `hard-cancel:${pending.id}:${paymentId}:${params.now.toISOString()}`,
          'utf8'
        )
        .digest('hex');

      const afterCancel = await params.cancelProviderPayment({
        shopId,
        secretKey,
        paymentId,
        idempotenceKey,
      });

      if (afterCancel?.status === 'canceled') {
        cancelableSubscriptionIds.push(pending.id);
        providerCanceledPaymentIds.add(paymentId);
        continue;
      }

      unresolvedPendingPayments.push({
        subscriptionId: pending.id,
        planId: pending.planId,
        paymentId,
        reason: 'provider_cancel_failed',
        providerStatus: afterCancel?.status || providerSnapshot.status,
      });
      continue;
    }

    if (providerSnapshot.status === 'succeeded' && providerSnapshot.paid) {
      unresolvedPendingPayments.push({
        subscriptionId: pending.id,
        planId: pending.planId,
        paymentId,
        reason: 'provider_payment_already_succeeded',
        providerStatus: 'succeeded',
      });
      continue;
    }

    unresolvedPendingPayments.push({
      subscriptionId: pending.id,
      planId: pending.planId,
      paymentId,
      reason: 'provider_status_unknown',
      providerStatus: providerSnapshot.status,
    });
  }

  return {
    cancelableSubscriptionIds,
    providerCanceledPaymentIds: Array.from(providerCanceledPaymentIds),
    unresolvedPendingPayments,
  };
}
