import { cleanupTelegramAlertDeliveries } from '@/server/application/telegram/telegram-deliveries-cleanup.service';
import { getTelegramAlertsConfig } from '@/server/application/telegram/telegram-alerts.config';
import {
  isDbConnectionError,
  resetDbPool,
} from '@/server/infrastructure/db/client';
import { isStaticGenerateProcess } from '@/server/utils/static-generate';

export default defineNitroPlugin(() => {
  const isStaticBuild = isStaticGenerateProcess();

  if (isStaticBuild) {
    console.log('[TelegramAlertsCleanup] Skipped in static generate');
    return;
  }

  const config = getTelegramAlertsConfig();
  if (!config.deliveryCleanupEnabled) {
    return;
  }

  const intervalMs = 24 * 60 * 60 * 1000;

  const run = async () => {
    try {
      const result = await cleanupTelegramAlertDeliveries({
        retentionDays: config.deliveryRetentionDays,
      });
      if (result.cleaned > 0) {
        console.log(
          `[TelegramAlertsCleanup] Removed ${result.cleaned} telegram_alert_deliveries record(s) older than ${result.retentionDays} day(s)`
        );
      }
    } catch (error) {
      if (isDbConnectionError(error)) {
        const rootError =
          (error as { cause?: unknown; code?: string })?.cause ?? error;
        const errorMessage =
          (rootError as { message?: string })?.message ||
          (error as { message?: string })?.message ||
          String(error);
        const errorCode =
          (rootError as { code?: string })?.code ||
          (error as { code?: string })?.code;

        console.error(
          '[TelegramAlertsCleanup] ❌ Database connection error:',
          errorMessage,
          errorCode ? `(code: ${errorCode})` : ''
        );
        await resetDbPool('TelegramAlertsCleanup: connection error');
        return;
      }

      console.error('[TelegramAlertsCleanup] Cleanup failed:', error);
    }
  };

  void run();
  setInterval(() => void run(), intervalMs);
});
