import { cleanupChatFeedbackComments } from '@/server/application/chat/feedback-cleanup.service';
import {
  isDbConnectionError,
  resetDbPool,
} from '@/server/infrastructure/db/client';
import { isStaticGenerateProcess } from '@/server/utils/static-generate';

export default defineNitroPlugin(() => {
  const isStaticBuild = isStaticGenerateProcess();

  if (isStaticBuild) {
    console.log('[ChatFeedbackCleanup] Skipped in static generate');
    return;
  }

  const enabled = process.env.CHAT_FEEDBACK_CLEANUP_ENABLED !== 'false';
  if (!enabled) return;

  const intervalMs = 24 * 60 * 60 * 1000;

  const run = async () => {
    try {
      const result = await cleanupChatFeedbackComments({ retentionDays: 60 });
      if (result.cleaned > 0) {
        console.log(
          `[ChatFeedbackCleanup] Cleared ${result.cleaned} comment(s) older than ${result.retentionDays} day(s)`
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
          '[ChatFeedbackCleanup] ❌ Database connection error:',
          errorMessage,
          errorCode ? `(code: ${errorCode})` : ''
        );
        await resetDbPool('ChatFeedbackCleanup: connection error');
        return;
      }

      console.error('[ChatFeedbackCleanup] Cleanup failed:', error);
    }
  };

  void run();
  setInterval(() => void run(), intervalMs);
});
