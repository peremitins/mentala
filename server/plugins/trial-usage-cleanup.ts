import { cleanupTrialUsageTracking } from '@/server/application/subscriptions/trial-usage-cleanup';

export default defineNitroPlugin(() => {
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
      console.error('[TrialUsageCleanup] Cleanup failed:', error);
    }
  };

  void run();
  setInterval(() => void run(), intervalMs);
});
