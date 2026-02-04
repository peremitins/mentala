/**
 * Очередь для догенерации AI-текстов пулов
 */

import { createQueue } from '@/server/infrastructure/redis/bullmqClient';

export const AI_TEXT_POOL_QUEUE = 'ai-text-pool-refill';

export type AiTextPoolRefillJobData = {
  preferenceId: string;
  userId: number;
};

// Rate limiting для защиты от перегрузки OpenAI и DB
// Максимум 5 задач в секунду
export const aiTextPoolQueue = createQueue<AiTextPoolRefillJobData>(
  AI_TEXT_POOL_QUEUE,
  {
    limiter: {
      max: 5, // Максимум 5 задач
      duration: 1000, // За 1 секунду
    },
  } as Parameters<typeof createQueue>[1]
);

export async function enqueueAiTextPoolRefillJob(params: {
  preferenceId: string;
  userId: number;
  configHash?: string | null;
  delayMs?: number;
  reason?: string;
}): Promise<void> {
  const delayMs = Math.max(0, params.delayMs ?? 0);
  const reason = params.reason ? ` (${params.reason})` : '';
  const hashSuffix = params.configHash
    ? `-${params.configHash.slice(0, 8)}`
    : '';

  try {
    await aiTextPoolQueue.add(
      'refill',
      {
        preferenceId: params.preferenceId,
        userId: params.userId,
      },
      {
        // Детерминированный ID по preference + hash, чтобы избежать дублей
        jobId: `ai-refill-${params.preferenceId}${hashSuffix}`,
        delay: delayMs,
        removeOnComplete: true,
      }
    );

    console.log(
      `[AI Text Pool Queue] ✅ Enqueued refill job for preference ${params.preferenceId}${reason}, delay=${delayMs}ms`
    );
  } catch (error) {
    const message =
      error instanceof Error ? error.message : String(error ?? '');

    if (message.includes('already exists')) {
      console.log(
        `[AI Text Pool Queue] ⏭️ Refill job already exists for preference ${params.preferenceId}${reason}`
      );
      return;
    }

    console.error(
      `[AI Text Pool Queue] ❌ Failed to enqueue refill job for preference ${params.preferenceId}${reason}:`,
      error
    );
  }
}
