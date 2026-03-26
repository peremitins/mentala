import crypto from 'node:crypto';
import { runTrialBillingWorker } from '@/server/application/subscriptions/trial-billing-worker.service';
import { runScheduledPlanChangeWorker } from '@/server/application/subscriptions/scheduled-plan-change.service';
import {
  isDbConnectionError,
  resetDbPool,
} from '@/server/infrastructure/db/client';
import { isStaticGenerateProcess } from '@/server/utils/static-generate';

export default defineNitroPlugin(() => {
  const isStaticBuild = isStaticGenerateProcess();

  if (isStaticBuild) {
    console.log('[TrialBillingWorker] Skipped in static generate');
    return;
  }

  const enabled = process.env.TRIAL_BILLING_WORKER_ENABLED !== 'false';
  if (!enabled) {
    return;
  }

  const intervalMs = Math.max(
    30_000,
    Number(process.env.TRIAL_BILLING_WORKER_INTERVAL_MS || 5 * 60 * 1000)
  );
  const workerId = `trial-billing-worker:${process.pid}:${crypto.randomUUID()}`;

  const run = async () => {
    const runtimeConfig = useRuntimeConfig();
    const shopId = String(runtimeConfig.yookassaShopId || '').trim();
    const secretKey = String(runtimeConfig.yookassaSecretKey || '').trim();

    if (!shopId || !secretKey) {
      console.warn(
        '[TrialBillingWorker] YooKassa credentials are missing, worker tick skipped'
      );
      return;
    }

    try {
      await runTrialBillingWorker({
        workerId,
        shopId,
        secretKey,
      });
      await runScheduledPlanChangeWorker({
        workerId,
        shopId,
        secretKey,
      });
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
          '[TrialBillingWorker] ❌ Database connection error:',
          errorMessage,
          errorCode ? `(code: ${errorCode})` : ''
        );
        await resetDbPool('TrialBillingWorker: connection error');
        return;
      }

      console.error('[TrialBillingWorker] tick failed:', error);
    }
  };

  void run();
  setInterval(() => void run(), intervalMs);
});
