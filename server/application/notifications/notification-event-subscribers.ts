import { subscribeToAppEvent } from '../events/app-events.dispatchers';
import { restoreAutoDowngradedAiNotifications } from './notification-source-access.service';

type GlobalNotificationSubscribersState = typeof globalThis & {
  __mentaiNotificationAppEventSubscribersRegistered?: boolean;
};

export function registerNotificationAppEventSubscribers(): void {
  const globalScope = globalThis as GlobalNotificationSubscribersState;
  if (globalScope.__mentaiNotificationAppEventSubscribersRegistered) {
    return;
  }

  globalScope.__mentaiNotificationAppEventSubscribersRegistered = true;

  // При успешной оплате восстанавливаем AI-уведомления, которые были
  // автоматически переключены на шаблоны при потере доступа.
  subscribeToAppEvent('billing.purchase_success', async (payload) => {
    if (!payload.userId) return;

    try {
      const result = await restoreAutoDowngradedAiNotifications(payload.userId);
      if (result.restoredCount > 0) {
        console.log(
          `[NotificationAccess] Restored ${result.restoredCount} AI notification preference(s) for user ${payload.userId} after purchase`
        );
      }
    } catch (error) {
      console.error(
        `[NotificationAccess] Failed to restore AI notifications for user ${payload.userId}:`,
        error
      );
    }
  });
}
