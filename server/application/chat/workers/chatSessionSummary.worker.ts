import type { Job } from 'bullmq';
import {
  createWorker,
  registerWorker,
} from '@/server/infrastructure/redis/bullmqClient';
import {
  CHAT_SESSION_SUMMARY_QUEUE,
  type ChatSessionSummaryJobData,
} from '../queues/chatSessionSummary.queue';
import { processSessionSummaryJob } from '../chatMemory.service';

export function startChatSessionSummaryWorker() {
  const worker = createWorker<ChatSessionSummaryJobData>(
    CHAT_SESSION_SUMMARY_QUEUE,
    async (job: Job<ChatSessionSummaryJobData>) => {
      const maxAttempts = Number(job.opts.attempts || 1);
      const nextAttemptNumber = Number(job.attemptsMade || 0) + 1;
      const isFinalAttempt = nextAttemptNumber >= maxAttempts;

      try {
        await processSessionSummaryJob({
          therapySessionId: job.data.therapySessionId,
          userId: job.data.userId,
          model: job.data.model,
          throwOnError: !isFinalAttempt,
          saveFallbackEmptySummary: isFinalAttempt,
        });

        return {
          ok: true,
          therapySessionId: job.data.therapySessionId,
          finalAttempt: isFinalAttempt,
        };
      } catch (error) {
        console.error(
          '[ChatSessionSummaryWorker] Session summary job failed:',
          {
            therapySessionId: job.data.therapySessionId,
            userId: job.data.userId,
            attempt: nextAttemptNumber,
            maxAttempts,
            error,
          }
        );
        throw error instanceof Error ? error : new Error(String(error));
      }
    },
    {
      // Durable memory должна обновляться последовательно,
      // иначе параллельные session-end jobs одного пользователя могут перетереть факты.
      concurrency: 1,
    }
  );

  registerWorker(worker);
  return worker;
}
