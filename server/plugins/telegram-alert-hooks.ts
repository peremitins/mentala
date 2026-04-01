import {
  dispatchAppCriticalEvent,
  dispatchHttp5xxResponseEvent,
} from '@/server/application/events/app-events.dispatchers';
import { isStaticGenerateProcess } from '@/server/utils/static-generate';

export default defineNitroPlugin((nitroApp) => {
  const isStaticBuild = isStaticGenerateProcess();

  if (isStaticBuild) {
    console.log('[Telegram Alert Hooks] Skipped in static generate');
    return;
  }

  nitroApp.hooks.hook('afterResponse', (event) => {
    const statusCode = event.node?.res?.statusCode ?? 200;
    if (statusCode < 500 || statusCode > 599) {
      return;
    }

    dispatchHttp5xxResponseEvent({
      path: event.path || event.node?.req?.url || null,
      method: event.method || event.node?.req?.method || null,
      statusCode,
    });
  });

  nitroApp.hooks.hook('error', (error, context) => {
    const statusCode = Number(
      (error as { statusCode?: unknown; status?: unknown })?.statusCode ??
        (error as { status?: unknown })?.status ??
        context.event?.node?.res?.statusCode ??
        500
    );

    if (!Number.isFinite(statusCode) || statusCode < 500) {
      return;
    }

    dispatchAppCriticalEvent({
      source: 'nitro.error',
      error,
      path: context.event?.path || context.event?.node?.req?.url || null,
      statusCode,
    });
  });
});
