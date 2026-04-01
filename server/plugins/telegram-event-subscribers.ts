import { registerTelegramAppEventSubscribers } from '@/server/application/telegram/telegram-event-subscribers';
import { isStaticGenerateProcess } from '@/server/utils/static-generate';

export default defineNitroPlugin(() => {
  const isStaticBuild = isStaticGenerateProcess();

  if (isStaticBuild) {
    return;
  }

  registerTelegramAppEventSubscribers();
});
