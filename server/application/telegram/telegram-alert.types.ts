export type TelegramAlertChannel = 'devops' | 'billing' | 'users' | 'errors';

export type TelegramAlertType =
  | 'devops.push_delivery_unavailable'
  | 'devops.http_500_spike'
  | 'billing.purchase_success'
  | 'billing.purchase_failed'
  | 'billing.payment_method_bound'
  | 'billing.plan_changed'
  | 'billing.subscription_canceled'
  | 'billing.checkout_error'
  | 'billing.webhook_error'
  | 'billing.critical_error'
  | 'user.registered'
  | 'user.deletion_requested'
  | 'error.app_critical'
  | 'error.integration_critical'
  | 'error.business_flow_critical';

export type TelegramAlertPayload = Record<string, unknown>;

export type TelegramAlertEnvelope<
  TPayload extends TelegramAlertPayload = TelegramAlertPayload,
> = {
  type: TelegramAlertType;
  dedupKey: string;
  payload: TPayload;
  createdAt: string;
  source: string;
  environment: string;
};

export type TelegramDeliveryStatus =
  | 'queued'
  | 'processing'
  | 'sent'
  | 'failed';

export type TelegramUserRegistrationMethod =
  | 'email'
  | 'google'
  | 'vk'
  | 'telegram';
