import { registerNotificationAppEventSubscribers } from '@/server/application/notifications/notification-event-subscribers';
import { isStaticGenerateProcess } from '@/server/utils/static-generate';

export default defineNitroPlugin(() => {
  const isStaticBuild = isStaticGenerateProcess();

  if (isStaticBuild) {
    return;
  }

  registerNotificationAppEventSubscribers();
});
