/**
 * Очередь для первичной генерации AI-текстов (и повторов при ошибках)
 */

import { createQueue } from '@/server/infrastructure/redis/bullmqClient';

export const AI_TEXT_GENERATION_QUEUE = 'ai-text-generation';

export type AiTextGenerationJobData = {
  userId: number;
  preferenceId: string;
  // Хеш конфигурации генерации (нужен для защиты от устаревших задач)
  configHash?: string;
};

// Более щадящая очередь для AI-генерации (меньше параллелизма и больше retry)
export const aiTextGenerationQueue = createQueue<AiTextGenerationJobData>(
  AI_TEXT_GENERATION_QUEUE,
  {
    limiter: {
      max: 2, // Максимум 2 задачи в секунду
      duration: 1000,
    },
    defaultJobOptions: {
      attempts: 5, // Больше попыток, чтобы переживать сбои провайдера
      backoff: {
        type: 'exponential',
        delay: 60_000, // 1 минута между ретраями
      },
      // ВАЖНО: удаляем completed-джобы сразу, чтобы можно было перекидывать задачи с тем же jobId
      removeOnComplete: true,
      // ВАЖНО: удаляем failed-джобы, чтобы новая попытка могла встать в очередь
      removeOnFail: true,
    },
  }
);

export async function enqueueAiTextGenerationJob(params: {
  userId: number;
  preferenceId: string;
  delayMs?: number;
  reason?: string;
  configHash?: string;
}): Promise<void> {
  const delayMs = Math.max(0, params.delayMs ?? 0);
  const reason = params.reason ? ` (${params.reason})` : '';
  const jobId = params.configHash
    ? `ai-gen-${params.preferenceId}-${params.configHash}`
    : `ai-gen-${params.preferenceId}`;

  try {
    await aiTextGenerationQueue.add(
      'generate',
      {
        userId: params.userId,
        preferenceId: params.preferenceId,
        configHash: params.configHash,
      },
      {
        // Детерминированный ID по preference + configHash — защищает от дублей при повторе той же конфигурации
        jobId,
        delay: delayMs,
      }
    );

    console.log(
      `[AI Generation Queue] ✅ Enqueued job for preference ${params.preferenceId}${reason}, delay=${delayMs}ms`
    );
  } catch (error) {
    const message =
      error instanceof Error ? error.message : String(error ?? '');

    // Если задача уже существует — это ожидаемо (защита от дублей)
    if (message.includes('already exists')) {
      console.log(
        `[AI Generation Queue] ⏭️ Job already exists for preference ${params.preferenceId}${reason}`
      );
      return;
    }

    console.error(
      `[AI Generation Queue] ❌ Failed to enqueue job for preference ${params.preferenceId}${reason}:`,
      error
    );
  }
}
