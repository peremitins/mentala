import { formatInTimeZone } from 'date-fns-tz';
import { getTelegramAlertsConfig } from './telegram-alerts.config';
import type {
  TelegramAlertChannel,
  TelegramAlertEnvelope,
} from './telegram-alert.types';

function formatTimestamp(value: unknown): string {
  const config = getTelegramAlertsConfig();
  if (!value) {
    return '—';
  }

  const date =
    value instanceof Date ? value : new Date(String(value || '').trim());
  if (Number.isNaN(date.getTime())) {
    return '—';
  }

  return formatInTimeZone(date, config.reportsTimezone, 'dd.MM.yyyy HH:mm:ss');
}

function formatMoneyMinor(amountMinor: unknown, currency: unknown): string {
  const normalizedAmount = Number(amountMinor);
  const normalizedCurrency = String(currency || 'RUB')
    .trim()
    .toUpperCase();

  if (!Number.isFinite(normalizedAmount)) {
    return `— ${normalizedCurrency}`;
  }

  const value = normalizedAmount / 100;
  const digits = normalizedAmount % 100 === 0 ? 0 : 2;
  const formatted = new Intl.NumberFormat('ru-RU', {
    minimumFractionDigits: digits,
    maximumFractionDigits: 2,
  }).format(value);

  return `${formatted} ${normalizedCurrency}`;
}

function renderHeader(params: {
  icon: string;
  channel: TelegramAlertChannel;
  title: string;
  environment: string;
}): string {
  return `${params.icon} [${params.channel.toUpperCase()}] ${params.title} (${params.environment})`;
}

function renderLines(lines: Array<string | null | undefined>): string {
  return lines.filter(Boolean).join('\n');
}

function formatContext(value: unknown): string | null {
  if (!value) {
    return null;
  }

  try {
    const serialized = JSON.stringify(value);
    if (!serialized || serialized === '{}' || serialized === '[]') {
      return null;
    }

    return serialized.length > 400
      ? `${serialized.slice(0, 397)}...`
      : serialized;
  } catch {
    return null;
  }
}

export function formatTelegramAlertMessage(
  event: TelegramAlertEnvelope,
  channel: TelegramAlertChannel
): string {
  const payload = event.payload;

  switch (event.type) {
    case 'devops.push_delivery_unavailable':
      return renderLines([
        renderHeader({
          icon: '🚨',
          channel,
          title: 'Push delivery degradation',
          environment: event.environment,
        }),
        `Причина: ${payload.reason ?? 'unknown'}`,
        `Источник: ${payload.source ?? '—'}`,
        payload.attempts ? `Попытки: ${payload.attempts}` : null,
        payload.failedAttempts ? `Ошибки: ${payload.failedAttempts}` : null,
        payload.errorRatePercent
          ? `Failure rate: ${payload.errorRatePercent}%`
          : null,
        payload.jobId ? `Job ID: ${payload.jobId}` : null,
        payload.errorCode ? `Код: ${payload.errorCode}` : null,
        payload.errorMessage ? `Ошибка: ${payload.errorMessage}` : null,
        `Время: ${formatTimestamp(payload.occurredAt || event.createdAt)}`,
      ]);

    case 'devops.http_500_spike':
      return renderLines([
        renderHeader({
          icon: '🚨',
          channel,
          title: 'Spike по HTTP 5xx',
          environment: event.environment,
        }),
        `Количество: ${payload.count ?? '—'}`,
        `Порог: ${payload.threshold ?? '—'}`,
        `Окно: ${payload.windowMinutes ?? '—'} мин`,
        `Статус: ${payload.statusCode ?? '—'}`,
        payload.method || payload.path
          ? `Последний запрос: ${payload.method ?? '—'} ${payload.path ?? '—'}`
          : null,
        `Время: ${formatTimestamp(payload.occurredAt || event.createdAt)}`,
      ]);

    case 'user.registered':
      return renderLines([
        renderHeader({
          icon: '👤',
          channel,
          title: 'Новый зарегистрированный пользователь',
          environment: event.environment,
        }),
        `User ID: ${payload.userId ?? '—'}`,
        payload.userEmail ? `Email: ${payload.userEmail}` : null,
        `Метод: ${payload.method ?? '—'}`,
        `Время: ${formatTimestamp(payload.occurredAt || event.createdAt)}`,
      ]);

    case 'user.deletion_requested':
      return renderLines([
        renderHeader({
          icon: '🗑',
          channel,
          title: 'Удаление аккаунта',
          environment: event.environment,
        }),
        `User ID: ${payload.userId ?? '—'}`,
        payload.userEmail ? `Email: ${payload.userEmail}` : null,
        `Режим: ${payload.mode ?? '—'}`,
        `Время: ${formatTimestamp(payload.occurredAt || event.createdAt)}`,
      ]);

    case 'billing.purchase_success':
      return renderLines([
        renderHeader({
          icon: '💸',
          channel,
          title: 'Успешный платёж',
          environment: event.environment,
        }),
        `User ID: ${payload.userId ?? '—'}`,
        payload.userEmail ? `Email: ${payload.userEmail}` : null,
        `Subscription ID: ${payload.subscriptionId ?? '—'}`,
        `Payment ID: ${payload.paymentId ?? '—'}`,
        `План: ${payload.planId ?? '—'}${payload.billingPeriod ? ` / ${payload.billingPeriod}` : ''}`,
        `Сумма: ${formatMoneyMinor(payload.amountMinor, payload.currency)}`,
        payload.reason ? `Причина: ${payload.reason}` : null,
        payload.source ? `Источник: ${payload.source}` : null,
        `Время: ${formatTimestamp(payload.occurredAt || event.createdAt)}`,
      ]);

    case 'billing.purchase_failed':
      return renderLines([
        renderHeader({
          icon: '⚠️',
          channel,
          title: 'Неуспешный платёж',
          environment: event.environment,
        }),
        `User ID: ${payload.userId ?? '—'}`,
        payload.userEmail ? `Email: ${payload.userEmail}` : null,
        `Subscription ID: ${payload.subscriptionId ?? '—'}`,
        `Payment ID: ${payload.paymentId ?? '—'}`,
        `План: ${payload.planId ?? '—'}${payload.billingPeriod ? ` / ${payload.billingPeriod}` : ''}`,
        payload.amountMinor
          ? `Сумма: ${formatMoneyMinor(payload.amountMinor, payload.currency)}`
          : null,
        `Причина: ${payload.reason ?? 'unknown'}`,
        payload.source ? `Источник: ${payload.source}` : null,
        `Время: ${formatTimestamp(payload.occurredAt || event.createdAt)}`,
      ]);

    case 'billing.payment_method_bound':
      return renderLines([
        renderHeader({
          icon: '💳',
          channel,
          title: 'Карта привязана',
          environment: event.environment,
        }),
        `User ID: ${payload.userId ?? '—'}`,
        payload.userEmail ? `Email: ${payload.userEmail}` : null,
        `Провайдер: ${payload.provider ?? '—'}`,
        payload.bindingSessionId
          ? `Binding session: ${payload.bindingSessionId}`
          : null,
        payload.source ? `Источник: ${payload.source}` : null,
        `Время: ${formatTimestamp(payload.occurredAt || event.createdAt)}`,
      ]);

    case 'billing.plan_changed':
      return renderLines([
        renderHeader({
          icon: '🔁',
          channel,
          title: 'Тариф изменён',
          environment: event.environment,
        }),
        `User ID: ${payload.userId ?? '—'}`,
        payload.userEmail ? `Email: ${payload.userEmail}` : null,
        `Из: ${payload.fromPlanId ?? '—'}${payload.fromBillingPeriod ? ` / ${payload.fromBillingPeriod}` : ''}`,
        `В: ${payload.toPlanId ?? '—'}${payload.toBillingPeriod ? ` / ${payload.toBillingPeriod}` : ''}`,
        payload.fromSubscriptionId
          ? `From subscription: ${payload.fromSubscriptionId}`
          : null,
        payload.toSubscriptionId
          ? `To subscription: ${payload.toSubscriptionId}`
          : null,
        payload.paymentId ? `Payment ID: ${payload.paymentId}` : null,
        payload.source ? `Источник: ${payload.source}` : null,
        payload.effectiveAt
          ? `Effective at: ${formatTimestamp(payload.effectiveAt)}`
          : null,
        `Время: ${formatTimestamp(payload.occurredAt || event.createdAt)}`,
      ]);

    case 'billing.subscription_canceled':
      return renderLines([
        renderHeader({
          icon: '🧾',
          channel,
          title: 'Подписка отменена',
          environment: event.environment,
        }),
        `User ID: ${payload.userId ?? '—'}`,
        payload.userEmail ? `Email: ${payload.userEmail}` : null,
        `Subscription ID: ${payload.subscriptionId ?? '—'}`,
        `План: ${payload.planId ?? '—'}`,
        payload.endDate
          ? `Доступ до: ${formatTimestamp(payload.endDate)}`
          : null,
        `Время: ${formatTimestamp(payload.occurredAt || event.createdAt)}`,
      ]);

    case 'billing.checkout_error':
      return renderLines([
        renderHeader({
          icon: '🚨',
          channel,
          title: 'Checkout error',
          environment: event.environment,
        }),
        `User ID: ${payload.userId ?? '—'}`,
        payload.userEmail ? `Email: ${payload.userEmail}` : null,
        `План: ${payload.planId ?? '—'}${payload.billingPeriod ? ` / ${payload.billingPeriod}` : ''}`,
        `Статус: ${payload.statusCode ?? '—'}`,
        `Ошибка: ${payload.errorMessage ?? 'unknown'}`,
        `Время: ${formatTimestamp(payload.occurredAt || event.createdAt)}`,
      ]);

    case 'billing.webhook_error':
      return renderLines([
        renderHeader({
          icon: '🚨',
          channel,
          title: 'Webhook error',
          environment: event.environment,
        }),
        `Payment ID: ${payload.paymentId ?? '—'}`,
        `Статус: ${payload.statusCode ?? '—'}`,
        `Ошибка: ${payload.errorMessage ?? 'unknown'}`,
        `Время: ${formatTimestamp(payload.occurredAt || event.createdAt)}`,
      ]);

    case 'billing.critical_error':
      return renderLines([
        renderHeader({
          icon: '🔥',
          channel,
          title: 'Критическая ошибка биллинга',
          environment: event.environment,
        }),
        `Источник: ${payload.source ?? '—'}`,
        payload.operation ? `Операция: ${payload.operation}` : null,
        payload.reason ? `Причина: ${payload.reason}` : null,
        payload.userId ? `User ID: ${payload.userId}` : null,
        payload.userEmail ? `Email: ${payload.userEmail}` : null,
        payload.subscriptionId
          ? `Subscription ID: ${payload.subscriptionId}`
          : null,
        payload.paymentId ? `Payment ID: ${payload.paymentId}` : null,
        payload.planId
          ? `План: ${payload.planId}${payload.billingPeriod ? ` / ${payload.billingPeriod}` : ''}`
          : null,
        `Статус: ${payload.statusCode ?? '—'}`,
        `Код: ${payload.errorCode ?? '—'}`,
        `Ошибка: ${payload.errorMessage ?? 'unknown'}`,
        formatContext(payload.context)
          ? `Контекст: ${formatContext(payload.context)}`
          : null,
        `Время: ${formatTimestamp(payload.occurredAt || event.createdAt)}`,
      ]);

    case 'error.app_critical':
      return renderLines([
        renderHeader({
          icon: '🔥',
          channel,
          title: 'Критическая ошибка приложения',
          environment: event.environment,
        }),
        `Источник: ${payload.source ?? '—'}`,
        payload.path ? `Путь: ${payload.path}` : null,
        `Статус: ${payload.statusCode ?? '—'}`,
        `Код: ${payload.errorCode ?? '—'}`,
        `Ошибка: ${payload.errorMessage ?? 'unknown'}`,
        `Время: ${formatTimestamp(payload.occurredAt || event.createdAt)}`,
      ]);

    case 'error.integration_critical':
      return renderLines([
        renderHeader({
          icon: '🔥',
          channel,
          title: 'Критическая ошибка интеграции',
          environment: event.environment,
        }),
        `Интеграция: ${payload.integration ?? '—'}`,
        `Источник: ${payload.source ?? '—'}`,
        `Статус: ${payload.statusCode ?? '—'}`,
        `Код: ${payload.errorCode ?? '—'}`,
        `Ошибка: ${payload.errorMessage ?? 'unknown'}`,
        `Время: ${formatTimestamp(payload.occurredAt || event.createdAt)}`,
      ]);

    case 'error.business_flow_critical':
      return renderLines([
        renderHeader({
          icon: '🔥',
          channel,
          title: 'Критическая ошибка бизнес-сценария',
          environment: event.environment,
        }),
        `Flow: ${payload.flow ?? '—'}`,
        `Источник: ${payload.source ?? '—'}`,
        payload.operation ? `Операция: ${payload.operation}` : null,
        payload.userId ? `User ID: ${payload.userId}` : null,
        payload.userEmail ? `Email: ${payload.userEmail}` : null,
        `Статус: ${payload.statusCode ?? '—'}`,
        `Код: ${payload.errorCode ?? '—'}`,
        `Ошибка: ${payload.errorMessage ?? 'unknown'}`,
        formatContext(payload.context)
          ? `Контекст: ${formatContext(payload.context)}`
          : null,
        `Время: ${formatTimestamp(payload.occurredAt || event.createdAt)}`,
      ]);

    default:
      return renderLines([
        renderHeader({
          icon: 'ℹ️',
          channel,
          title: event.type,
          environment: event.environment,
        }),
        `Payload: ${JSON.stringify(payload)}`,
      ]);
  }
}
