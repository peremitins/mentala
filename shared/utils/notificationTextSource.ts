export type NotificationTextSourceMode = 'templates' | 'ai';

/**
 * Возвращает дефолтный способ создания текста уведомления.
 * Для пользователей с entitlement на AI-уведомления стартовым режимом считаем `ai`.
 */
export function getDefaultNotificationTextSource(
  canUseAiNotifications: boolean
): NotificationTextSourceMode {
  return canUseAiNotifications ? 'ai' : 'templates';
}

/**
 * Нормализует значение, пришедшее с клиента, с учётом доступа к AI-уведомлениям.
 * Если `ai` недоступен, принудительно откатываемся в `templates`.
 */
export function normalizeRequestedNotificationTextSource(
  requestedTextSource: NotificationTextSourceMode | undefined,
  canUseAiNotifications: boolean
): NotificationTextSourceMode | undefined {
  if (requestedTextSource === undefined) {
    return undefined;
  }

  return requestedTextSource === 'ai' && canUseAiNotifications
    ? 'ai'
    : 'templates';
}
