import type {
  TelegramAlertChannel,
  TelegramAlertType,
} from './telegram-alert.types';

export const TELEGRAM_ROUTING: Record<TelegramAlertType, TelegramAlertChannel> =
  {
    'devops.push_delivery_unavailable': 'devops',
    'devops.http_500_spike': 'devops',
    'billing.purchase_success': 'billing',
    'billing.purchase_failed': 'billing',
    'billing.payment_method_bound': 'billing',
    'billing.plan_changed': 'billing',
    'billing.subscription_canceled': 'billing',
    'billing.checkout_error': 'billing',
    'billing.webhook_error': 'billing',
    'billing.critical_error': 'billing',
    'user.registered': 'users',
    'user.deletion_requested': 'users',
    'error.app_critical': 'errors',
    'error.integration_critical': 'errors',
    'error.business_flow_critical': 'errors',
  };

export function resolveTelegramAlertChannel(
  type: TelegramAlertType
): TelegramAlertChannel {
  return TELEGRAM_ROUTING[type];
}
