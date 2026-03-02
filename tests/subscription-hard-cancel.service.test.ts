import { describe, expect, it, vi } from 'vitest';

import {
  resolvePendingForHardCancel,
  type HardCancelUnresolvedPayment,
} from '../server/application/subscriptions/hard-cancel-pending-resolver';

describe('resolvePendingForHardCancel', () => {
  it('закрывает локальный pending без payment id', async () => {
    const fetchProviderPayment = vi.fn();
    const cancelProviderPayment = vi.fn();
    const result = await resolvePendingForHardCancel({
      now: new Date('2026-03-02T10:00:00.000Z'),
      pendingSubscriptions: [
        {
          id: 10,
          planId: 'pro',
          yookassaPaymentId: null,
        },
      ],
      shopId: 'shop',
      secretKey: 'secret',
      fetchProviderPayment,
      cancelProviderPayment,
    });

    expect(result.cancelableSubscriptionIds).toEqual([10]);
    expect(result.providerCanceledPaymentIds).toEqual([]);
    expect(result.unresolvedPendingPayments).toEqual([]);
    expect(fetchProviderPayment).not.toHaveBeenCalled();
    expect(cancelProviderPayment).not.toHaveBeenCalled();
  });

  it('закрывает pending, если provider уже вернул canceled', async () => {
    const fetchProviderPayment = vi.fn().mockResolvedValue({
      status: 'canceled',
      paid: false,
    });
    const cancelProviderPayment = vi.fn();

    const result = await resolvePendingForHardCancel({
      now: new Date('2026-03-02T10:00:00.000Z'),
      pendingSubscriptions: [
        {
          id: 11,
          planId: 'pro',
          yookassaPaymentId: 'pay-1',
        },
      ],
      shopId: 'shop',
      secretKey: 'secret',
      fetchProviderPayment,
      cancelProviderPayment,
    });

    expect(result.cancelableSubscriptionIds).toEqual([11]);
    expect(result.providerCanceledPaymentIds).toEqual(['pay-1']);
    expect(result.unresolvedPendingPayments).toEqual([]);
    expect(fetchProviderPayment).toHaveBeenCalledTimes(1);
    expect(cancelProviderPayment).not.toHaveBeenCalled();
  });

  it('пытается cancel в provider и закрывает pending после успешной отмены', async () => {
    const fetchProviderPayment = vi.fn().mockResolvedValue({
      status: 'pending',
      paid: false,
    });
    const cancelProviderPayment = vi.fn().mockResolvedValue({
      status: 'canceled',
      paid: false,
    });

    const result = await resolvePendingForHardCancel({
      now: new Date('2026-03-02T10:00:00.000Z'),
      pendingSubscriptions: [
        {
          id: 12,
          planId: 'premium',
          yookassaPaymentId: 'pay-2',
        },
      ],
      shopId: 'shop',
      secretKey: 'secret',
      fetchProviderPayment,
      cancelProviderPayment,
    });

    expect(result.cancelableSubscriptionIds).toEqual([12]);
    expect(result.providerCanceledPaymentIds).toEqual(['pay-2']);
    expect(result.unresolvedPendingPayments).toEqual([]);
    expect(fetchProviderPayment).toHaveBeenCalledTimes(1);
    expect(cancelProviderPayment).toHaveBeenCalledTimes(1);
  });

  it('оставляет pending unresolved, если платеж уже succeeded', async () => {
    const fetchProviderPayment = vi.fn().mockResolvedValue({
      status: 'succeeded',
      paid: true,
    });
    const cancelProviderPayment = vi.fn();

    const result = await resolvePendingForHardCancel({
      now: new Date('2026-03-02T10:00:00.000Z'),
      pendingSubscriptions: [
        {
          id: 13,
          planId: 'premium',
          yookassaPaymentId: 'pay-3',
        },
      ],
      shopId: 'shop',
      secretKey: 'secret',
      fetchProviderPayment,
      cancelProviderPayment,
    });

    const unresolved: HardCancelUnresolvedPayment[] = [
      {
        subscriptionId: 13,
        planId: 'premium',
        paymentId: 'pay-3',
        reason: 'provider_payment_already_succeeded',
        providerStatus: 'succeeded',
      },
    ];

    expect(result.cancelableSubscriptionIds).toEqual([]);
    expect(result.providerCanceledPaymentIds).toEqual([]);
    expect(result.unresolvedPendingPayments).toEqual(unresolved);
    expect(fetchProviderPayment).toHaveBeenCalledTimes(1);
    expect(cancelProviderPayment).not.toHaveBeenCalled();
  });

  it('помечает pending unresolved, если нет provider credentials', async () => {
    const fetchProviderPayment = vi.fn();
    const cancelProviderPayment = vi.fn();
    const result = await resolvePendingForHardCancel({
      now: new Date('2026-03-02T10:00:00.000Z'),
      pendingSubscriptions: [
        {
          id: 14,
          planId: 'pro',
          yookassaPaymentId: 'pay-4',
        },
      ],
      shopId: '',
      secretKey: '',
      fetchProviderPayment,
      cancelProviderPayment,
    });

    expect(result.cancelableSubscriptionIds).toEqual([]);
    expect(result.providerCanceledPaymentIds).toEqual([]);
    expect(result.unresolvedPendingPayments).toEqual([
      {
        subscriptionId: 14,
        planId: 'pro',
        paymentId: 'pay-4',
        reason: 'provider_credentials_missing',
        providerStatus: 'unknown',
      },
    ]);
    expect(fetchProviderPayment).not.toHaveBeenCalled();
    expect(cancelProviderPayment).not.toHaveBeenCalled();
  });
});
