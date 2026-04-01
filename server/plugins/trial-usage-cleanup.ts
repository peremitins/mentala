import { cleanupTrialUsageTracking } from '@/server/application/subscriptions/trial-usage-cleanup';
import {
  isDbConnectionError,
  resetDbPool,
} from '@/server/infrastructure/db/client';
import { isStaticGenerateProcess } from '@/server/utils/static-generate';

export default defineNitroPlugin(() => {
  const isStaticBuild = isStaticGenerateProcess();
  if (isStaticBuild) {
    console.log('[TrialUsageCleanup] Skipped in static generate');
    return;
  }

  const enabled = process.env.TRIAL_USAGE_CLEANUP_ENABLED !== 'false';
  if (!enabled) return;

  const intervalMs = 24 * 60 * 60 * 1000;

  const run = async () => {
    try {
      const result = await cleanupTrialUsageTracking();
      if (result.removed > 0) {
        console.log(
          `[TrialUsageCleanup] Removed ${result.removed} trial_usage_tracking record(s)`
        );
      }
    } catch (error) {
      // Если БД недоступна — пересоздаём пул, чтобы восстановить работу фоновой задачи.
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
          '[TrialUsageCleanup] ❌ Database connection error:',
          errorMessage,
          errorCode ? `(code: ${errorCode})` : ''
        );
        await resetDbPool('TrialUsageCleanup: connection error');
        return;
      }
      console.error('[TrialUsageCleanup] Cleanup failed:', error);
    }
  };

  void run();
  setInterval(() => void run(), intervalMs);
});
