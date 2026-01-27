import { cleanupUnverifiedUsers } from '@/server/application/auth/unverified-cleanup';
import {
  isDbConnectionError,
  resetDbPool,
} from '@/server/infrastructure/db/client';

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
      // Если БД недоступна — пересоздаём пул, чтобы восстановить работу фоновой задачи.
      if (isDbConnectionError(error)) {
        const rootError = (error as { cause?: unknown; code?: string })
          ?.cause ?? error;
        const errorMessage =
          (rootError as { message?: string })?.message ||
          (error as { message?: string })?.message ||
          String(error);
        const errorCode =
          (rootError as { code?: string })?.code ||
          (error as { code?: string })?.code;

        console.error(
          '[AuthCleanup] ❌ Database connection error:',
          errorMessage,
          errorCode ? `(code: ${errorCode})` : ''
        );
        await resetDbPool('AuthCleanup: connection error');
        return;
      }
      console.error('[AuthCleanup] Cleanup failed:', error);
    }
  };

  void run();
  setInterval(() => void run(), intervalMs);
});
