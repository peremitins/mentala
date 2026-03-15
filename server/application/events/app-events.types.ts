export type AppEventUserRegistrationMethod =
  | 'email'
  | 'google'
  | 'vk'
  | 'telegram';

export type AppEventPushDeliveryUnavailableReason =
  | 'failure_rate_threshold_exceeded'
  | 'queue_stalled'
  | 'provider_unavailable';

export type MentalaAppEventMap = {
  'user.registered': {
    userId: number;
    method: AppEventUserRegistrationMethod;
    occurredAt?: Date;
  };
  'user.deletion_requested': {
    userId: number;
    mode: 'grace_period' | 'immediate';
    email?: string | null;
    occurredAt?: Date;
  };
  'billing.purchase_success': {
    userId: number;
    subscriptionId: number | null;
    paymentId: string | null;
    planId: string | null;
    billingPeriod?: string | null;
    amount: unknown;
    currency?: string | null;
    source: string;
    reason?: string | null;
    occurredAt?: Date;
  };
  'billing.purchase_failed': {
    userId: number;
    subscriptionId: number | null;
    paymentId: string | null;
    planId: string | null;
    billingPeriod?: string | null;
    amount?: unknown;
    currency?: string | null;
    source: string;
    reason: string;
    occurredAt?: Date;
  };
  'billing.payment_method_bound': {
    userId: number;
    source: string;
    provider: 'yookassa';
    paymentMethodId?: string | null;
    bindingSessionId?: string | null;
    occurredAt?: Date;
  };
  'billing.plan_changed': {
    userId: number;
    source: string;
    fromSubscriptionId?: number | null;
    fromPlanId: string;
    fromBillingPeriod?: string | null;
    toSubscriptionId?: number | null;
    toPlanId: string;
    toBillingPeriod?: string | null;
    paymentId?: string | null;
    effectiveAt?: Date | string | null;
    occurredAt?: Date;
  };
  'billing.subscription_canceled': {
    userId: number;
    subscriptionId: number | null;
    planId: string | null;
    endDate?: Date | string | null;
    occurredAt?: Date;
  };
  'billing.checkout_error': {
    userId: number | null;
    planId: string | null;
    billingPeriod?: string | null;
    statusCode?: number | null;
    errorMessage: string;
    occurredAt?: Date;
  };
  'billing.webhook_error': {
    paymentId?: string | null;
    statusCode?: number | null;
    errorMessage: string;
    occurredAt?: Date;
  };
  'billing.critical_error': {
    source: string;
    operation?: string | null;
    reason?: string | null;
    userId?: number | null;
    subscriptionId?: number | null;
    paymentId?: string | null;
    planId?: string | null;
    billingPeriod?: string | null;
    statusCode?: number | null;
    error: unknown;
    context?: Record<string, unknown>;
    occurredAt?: Date;
  };
  'devops.http_5xx_response': {
    path?: string | null;
    method?: string | null;
    statusCode: number;
    occurredAt?: Date;
  };
  'devops.push_delivery_sample': {
    source: string;
    attempts: number;
    failures: number;
    occurredAt?: Date;
  };
  'devops.push_delivery_unavailable': {
    source: string;
    reason: AppEventPushDeliveryUnavailableReason;
    attempts?: number;
    failedAttempts?: number;
    errorRatePercent?: number;
    jobId?: string | null;
    error?: unknown;
    occurredAt?: Date;
  };
  'error.app_critical': {
    source: string;
    error: unknown;
    path?: string | null;
    statusCode?: number | null;
    occurredAt?: Date;
  };
  'error.integration_critical': {
    source: string;
    integration: string;
    error: unknown;
    statusCode?: number | null;
    extra?: Record<string, unknown>;
    occurredAt?: Date;
  };
  'error.business_flow_critical': {
    flow: string;
    source: string;
    operation?: string | null;
    userId?: number | null;
    statusCode?: number | null;
    error: unknown;
    context?: Record<string, unknown>;
    occurredAt?: Date;
  };
};

export type MentalaAppEventName = keyof MentalaAppEventMap;
