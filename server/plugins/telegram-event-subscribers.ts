import { registerTelegramAppEventSubscribers } from '@/server/application/telegram/telegram-event-subscribers';

export default defineNitroPlugin(() => {
  const isStaticBuild =
    process.env.NITRO_PRESET === 'static' ||
    process.env.npm_lifecycle_event === 'generate';

  if (isStaticBuild) {
    return;
  }

  registerTelegramAppEventSubscribers();
});
