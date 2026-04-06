import {
  dispatchAppEvent,
  emitAppEvent,
  subscribeToAppEvent,
} from './app-event-bus';
import type { MentalaAppEventMap } from './app-events.types';

export type {
  MentalaAppEventMap,
  MentalaAppEventName,
} from './app-events.types';
export { emitAppEvent, subscribeToAppEvent };

export function dispatchUserRegisteredEvent(
  payload: MentalaAppEventMap['user.registered']
): void {
  dispatchAppEvent('user.registered', payload);
}

export function dispatchUserDeletionRequestedEvent(
  payload: MentalaAppEventMap['user.deletion_requested']
): void {
  dispatchAppEvent('user.deletion_requested', payload);
}

export function dispatchBillingPurchaseSuccessEvent(
  payload: MentalaAppEventMap['billing.purchase_success']
): void {
  dispatchAppEvent('billing.purchase_success', payload);
}

export function dispatchBillingPurchaseFailedEvent(
  payload: MentalaAppEventMap['billing.purchase_failed']
): void {
  dispatchAppEvent('billing.purchase_failed', payload);
}

export function dispatchBillingPaymentMethodBoundEvent(
  payload: MentalaAppEventMap['billing.payment_method_bound']
): void {
  dispatchAppEvent('billing.payment_method_bound', payload);
}

export function dispatchBillingPlanChangedEvent(
  payload: MentalaAppEventMap['billing.plan_changed']
): void {
  dispatchAppEvent('billing.plan_changed', payload);
}

export function dispatchBillingSubscriptionCanceledEvent(
  payload: MentalaAppEventMap['billing.subscription_canceled']
): void {
  dispatchAppEvent('billing.subscription_canceled', payload);
}

export function dispatchBillingSubscriptionResumedEvent(
  payload: MentalaAppEventMap['billing.subscription_resumed']
): void {
  dispatchAppEvent('billing.subscription_resumed', payload);
}

export function dispatchBillingCheckoutErrorEvent(
  payload: MentalaAppEventMap['billing.checkout_error']
): void {
  dispatchAppEvent('billing.checkout_error', payload);
}

export function dispatchBillingWebhookErrorEvent(
  payload: MentalaAppEventMap['billing.webhook_error']
): void {
  dispatchAppEvent('billing.webhook_error', payload);
}

export function dispatchBillingCriticalEvent(
  payload: MentalaAppEventMap['billing.critical_error']
): void {
  dispatchAppEvent('billing.critical_error', payload);
}

export function dispatchHttp5xxResponseEvent(
  payload: MentalaAppEventMap['devops.http_5xx_response']
): void {
  dispatchAppEvent('devops.http_5xx_response', payload);
}

export function dispatchPushDeliverySampleEvent(
  payload: MentalaAppEventMap['devops.push_delivery_sample']
): void {
  dispatchAppEvent('devops.push_delivery_sample', payload);
}

export function dispatchPushDeliveryUnavailableEvent(
  payload: MentalaAppEventMap['devops.push_delivery_unavailable']
): void {
  dispatchAppEvent('devops.push_delivery_unavailable', payload);
}

export function dispatchAppCriticalEvent(
  payload: MentalaAppEventMap['error.app_critical']
): void {
  dispatchAppEvent('error.app_critical', payload);
}

export function dispatchIntegrationCriticalEvent(
  payload: MentalaAppEventMap['error.integration_critical']
): void {
  dispatchAppEvent('error.integration_critical', payload);
}

export function dispatchBusinessFlowCriticalEvent(
  payload: MentalaAppEventMap['error.business_flow_critical']
): void {
  dispatchAppEvent('error.business_flow_critical', payload);
}
