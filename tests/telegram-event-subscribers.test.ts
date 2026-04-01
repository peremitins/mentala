import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const enqueueUserRegisteredAlertSafe = vi.fn(async () => undefined);
const enqueueUserDeletionRequestedAlertSafe = vi.fn(async () => undefined);
const enqueueBillingCriticalAlertSafe = vi.fn(async () => undefined);
const enqueueBillingPaymentMethodBoundAlertSafe = vi.fn(async () => undefined);
const enqueueBillingPlanChangedAlertSafe = vi.fn(async () => undefined);
const enqueueBillingPurchaseSuccessAlertSafe = vi.fn(async () => undefined);
const enqueueBusinessFlowCriticalAlertSafe = vi.fn(async () => undefined);

vi.mock('../server/application/telegram/telegram-alerts.service', () => ({
  enqueueBillingCheckoutErrorAlertSafe: vi.fn(async () => undefined),
  enqueueBillingCriticalAlertSafe,
  enqueueBillingPaymentMethodBoundAlertSafe,
  enqueueBillingPlanChangedAlertSafe,
  enqueueBillingPurchaseFailedAlertSafe: vi.fn(async () => undefined),
  enqueueBillingPurchaseSuccessAlertSafe,
  enqueueBillingSubscriptionCanceledAlertSafe: vi.fn(async () => undefined),
  enqueueBillingWebhookErrorAlertSafe: vi.fn(async () => undefined),
  enqueueUserDeletionRequestedAlertSafe,
  enqueueUserRegisteredAlertSafe,
}));

vi.mock('../server/application/telegram/telegram-ops-alerts.service', () => ({
  enqueueAppCriticalAlertSafe: vi.fn(async () => undefined),
  enqueueBusinessFlowCriticalAlertSafe,
  enqueueIntegrationCriticalAlertSafe: vi.fn(async () => undefined),
  enqueuePushDeliveryUnavailableAlertSafe: vi.fn(async () => undefined),
  recordHttp5xxResponse: vi.fn(async () => undefined),
  recordPushDeliverySample: vi.fn(async () => undefined),
}));

describe('telegram app-event subscribers', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    const { clearAppEventBusListenersForTests } = await import(
      '../server/application/events/app-event-bus'
    );
    clearAppEventBusListenersForTests();
    delete (
      globalThis as {
        __mentaiTelegramAppEventSubscribersRegistered?: boolean;
      }
    ).__mentaiTelegramAppEventSubscribersRegistered;
  });

  afterEach(async () => {
    const { clearAppEventBusListenersForTests } = await import(
      '../server/application/events/app-event-bus'
    );
    clearAppEventBusListenersForTests();
    delete (
      globalThis as {
        __mentaiTelegramAppEventSubscribersRegistered?: boolean;
      }
    ).__mentaiTelegramAppEventSubscribersRegistered;
  });

  it('маршрутизирует app events в telegram bridge', async () => {
    const { registerTelegramAppEventSubscribers } = await import(
      '../server/application/telegram/telegram-event-subscribers'
    );
    const { emitAppEvent } = await import(
      '../server/application/events/app-events.dispatchers'
    );

    registerTelegramAppEventSubscribers();

    emitAppEvent('user.registered', {
      userId: 101,
      method: 'email',
    });
    emitAppEvent('user.deletion_requested', {
      userId: 101,
      mode: 'immediate',
      email: 'user-101@example.com',
    });
    emitAppEvent('billing.purchase_success', {
      userId: 101,
      subscriptionId: 55,
      paymentId: 'pay_123',
      planId: 'pro',
      billingPeriod: 'month',
      amount: 2495,
      currency: 'RUB',
      source: 'test.billing',
      reason: 'manual_test',
    });
    emitAppEvent('billing.payment_method_bound', {
      userId: 101,
      source: 'test.binding',
      provider: 'yookassa',
      paymentMethodId: 'pm_123',
      bindingSessionId: 'bind_123',
    });
    emitAppEvent('billing.plan_changed', {
      userId: 101,
      source: 'test.plan-change',
      fromSubscriptionId: 44,
      fromPlanId: 'basic',
      fromBillingPeriod: 'month',
      toSubscriptionId: 55,
      toPlanId: 'pro',
      toBillingPeriod: 'year',
      paymentId: 'pay_123',
      effectiveAt: new Date('2026-03-12T10:01:00.000Z'),
    });
    emitAppEvent('billing.critical_error', {
      source: 'test.billing.critical',
      operation: 'apply_scheduled_plan_change',
      reason: 'payment_create_failed',
      userId: 101,
      subscriptionId: 55,
      paymentId: 'pay_critical',
      planId: 'pro',
      billingPeriod: 'month',
      error: new Error('payment create failed'),
      context: {
        workerId: 'worker-1',
      },
    });
    emitAppEvent('error.business_flow_critical', {
      flow: 'notifications.slot_generation',
      source: 'notification-slots.scheduler',
      operation: 'scheduler_tick',
      error: new Error('scheduler tick failed'),
      context: {
        mode: 'soft',
      },
    });

    await Promise.resolve();

    expect(enqueueUserRegisteredAlertSafe).toHaveBeenCalledWith({
      userId: 101,
      method: 'email',
    });
    expect(enqueueUserDeletionRequestedAlertSafe).toHaveBeenCalledWith({
      userId: 101,
      mode: 'immediate',
      userEmail: 'user-101@example.com',
    });
    expect(enqueueBillingPurchaseSuccessAlertSafe).toHaveBeenCalledWith({
      userId: 101,
      subscriptionId: 55,
      paymentId: 'pay_123',
      planId: 'pro',
      billingPeriod: 'month',
      amount: 2495,
      currency: 'RUB',
      source: 'test.billing',
      reason: 'manual_test',
    });
    expect(enqueueBillingPaymentMethodBoundAlertSafe).toHaveBeenCalledWith({
      userId: 101,
      source: 'test.binding',
      provider: 'yookassa',
      paymentMethodId: 'pm_123',
      bindingSessionId: 'bind_123',
    });
    expect(enqueueBillingPlanChangedAlertSafe).toHaveBeenCalledWith({
      userId: 101,
      source: 'test.plan-change',
      fromSubscriptionId: 44,
      fromPlanId: 'basic',
      fromBillingPeriod: 'month',
      toSubscriptionId: 55,
      toPlanId: 'pro',
      toBillingPeriod: 'year',
      paymentId: 'pay_123',
      effectiveAt: new Date('2026-03-12T10:01:00.000Z'),
    });
    expect(enqueueBillingCriticalAlertSafe).toHaveBeenCalledWith({
      source: 'test.billing.critical',
      operation: 'apply_scheduled_plan_change',
      reason: 'payment_create_failed',
      userId: 101,
      subscriptionId: 55,
      paymentId: 'pay_critical',
      planId: 'pro',
      billingPeriod: 'month',
      error: expect.any(Error),
      context: {
        workerId: 'worker-1',
      },
    });
    expect(enqueueBusinessFlowCriticalAlertSafe).toHaveBeenCalledWith({
      flow: 'notifications.slot_generation',
      source: 'notification-slots.scheduler',
      operation: 'scheduler_tick',
      error: expect.any(Error),
      context: {
        mode: 'soft',
      },
    });
  });

  it('регистрирует subscribers только один раз', async () => {
    const { registerTelegramAppEventSubscribers } = await import(
      '../server/application/telegram/telegram-event-subscribers'
    );
    const { emitAppEvent } = await import(
      '../server/application/events/app-events.dispatchers'
    );

    registerTelegramAppEventSubscribers();
    registerTelegramAppEventSubscribers();

    emitAppEvent('user.registered', {
      userId: 202,
      method: 'google',
    });

    await Promise.resolve();

    expect(enqueueUserRegisteredAlertSafe).toHaveBeenCalledTimes(1);
  });
});
