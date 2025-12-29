import { cleanupUnverifiedUsers } from '@/server/application/auth/unverified-cleanup';

export default defineNitroPlugin(() => {
  const enabled = process.env.AUTH_CLEANUP_ENABLED !== 'false';
  if (!enabled) return;

  const intervalMs = 24 * 60 * 60 * 1000;

  const run = async () => {
    try {
      const result = await cleanupUnverifiedUsers();
      if (result.removed > 0) {
        console.log(
          `[AuthCleanup] Removed ${result.removed} unverified accounts`
        );
      }
    } catch (error) {
      console.error('[AuthCleanup] Cleanup failed:', error);
    }
  };

  void run();
  setInterval(() => void run(), intervalMs);
});
