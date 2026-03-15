import { subscribeToAppEvent } from '../events/app-events.dispatchers';
import {
  enqueueBillingCheckoutErrorAlertSafe,
  enqueueBillingCriticalAlertSafe,
  enqueueBillingPaymentMethodBoundAlertSafe,
  enqueueBillingPlanChangedAlertSafe,
  enqueueBillingPurchaseFailedAlertSafe,
  enqueueBillingPurchaseSuccessAlertSafe,
  enqueueBillingSubscriptionCanceledAlertSafe,
  enqueueBillingWebhookErrorAlertSafe,
  enqueueUserDeletionRequestedAlertSafe,
  enqueueUserRegisteredAlertSafe,
} from './telegram-alerts.service';
import {
  enqueueAppCriticalAlertSafe,
  enqueueBusinessFlowCriticalAlertSafe,
  enqueueIntegrationCriticalAlertSafe,
  enqueuePushDeliveryUnavailableAlertSafe,
  recordHttp5xxResponse,
  recordPushDeliverySample,
} from './telegram-ops-alerts.service';

type GlobalTelegramSubscribersState = typeof globalThis & {
  __mentaiTelegramAppEventSubscribersRegistered?: boolean;
};

export function registerTelegramAppEventSubscribers(): void {
  const globalScope = globalThis as GlobalTelegramSubscribersState;
  if (globalScope.__mentaiTelegramAppEventSubscribersRegistered) {
    return;
  }

  globalScope.__mentaiTelegramAppEventSubscribersRegistered = true;

  subscribeToAppEvent('user.registered', async (payload) => {
    await enqueueUserRegisteredAlertSafe({
      userId: payload.userId,
      method: payload.method,
    });
  });

  subscribeToAppEvent('user.deletion_requested', async (payload) => {
    await enqueueUserDeletionRequestedAlertSafe({
      userId: payload.userId,
      mode: payload.mode,
      userEmail: payload.email,
    });
  });

  subscribeToAppEvent('billing.purchase_success', async (payload) => {
    await enqueueBillingPurchaseSuccessAlertSafe(payload);
  });

  subscribeToAppEvent('billing.purchase_failed', async (payload) => {
    await enqueueBillingPurchaseFailedAlertSafe(payload);
  });

  subscribeToAppEvent('billing.payment_method_bound', async (payload) => {
    await enqueueBillingPaymentMethodBoundAlertSafe(payload);
  });

  subscribeToAppEvent('billing.plan_changed', async (payload) => {
    await enqueueBillingPlanChangedAlertSafe(payload);
  });

  subscribeToAppEvent('billing.subscription_canceled', async (payload) => {
    await enqueueBillingSubscriptionCanceledAlertSafe(payload);
  });

  subscribeToAppEvent('billing.checkout_error', async (payload) => {
    await enqueueBillingCheckoutErrorAlertSafe(payload);
  });

  subscribeToAppEvent('billing.webhook_error', async (payload) => {
    await enqueueBillingWebhookErrorAlertSafe(payload);
  });

  subscribeToAppEvent('billing.critical_error', async (payload) => {
    await enqueueBillingCriticalAlertSafe(payload);
  });

  subscribeToAppEvent('devops.http_5xx_response', async (payload) => {
    await recordHttp5xxResponse(payload);
  });

  subscribeToAppEvent('devops.push_delivery_sample', async (payload) => {
    await recordPushDeliverySample(payload);
  });

  subscribeToAppEvent('devops.push_delivery_unavailable', async (payload) => {
    await enqueuePushDeliveryUnavailableAlertSafe(payload);
  });

  subscribeToAppEvent('error.app_critical', async (payload) => {
    await enqueueAppCriticalAlertSafe(payload);
  });

  subscribeToAppEvent('error.integration_critical', async (payload) => {
    await enqueueIntegrationCriticalAlertSafe(payload);
  });

  subscribeToAppEvent('error.business_flow_critical', async (payload) => {
    await enqueueBusinessFlowCriticalAlertSafe(payload);
  });

  console.log('[Telegram Alerts] ✅ App-event subscribers registered');
}
