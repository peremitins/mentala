/**
 * Очередь для первичной генерации AI-текстов (и повторов при ошибках)
 */

import { createQueue } from '@/server/infrastructure/redis/bullmqClient';

export const AI_TEXT_GENERATION_QUEUE = 'ai-text-generation';

const AI_TEXT_DEBOUNCE_MS = 20_000;
const AI_TEXT_USER_ACTIVE_LIMIT = 3;
const AI_TEXT_USER_LIMIT_DELAY_MS = 5 * 60_000;
const AI_TEXT_USER_SCAN_LIMIT = 200;

export type AiTextGenerationJobData = {
  userId: number;
  preferenceId: string;
  // Хеш конфигурации генерации (нужен для защиты от устаревших задач)
  configHash?: string;
  // Причина постановки задачи (нужна для контроля последующей регенерации слотов)
  reason?: string;
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

async function countUserActiveJobs(userId: number): Promise<number> {
  // Считаем только активные/ожидающие задачи, чтобы лимит отражал реальную нагрузку
  const jobs = await aiTextGenerationQueue.getJobs(
    ['waiting', 'active', 'prioritized'],
    0,
    AI_TEXT_USER_SCAN_LIMIT - 1
  );

  let count = 0;
  for (const job of jobs) {
    if (job.data?.userId === userId) {
      count += 1;
      if (count >= AI_TEXT_USER_ACTIVE_LIMIT) {
        break;
      }
    }
  }

  return count;
}

export async function enqueueAiTextGenerationJob(params: {
  userId: number;
  preferenceId: string;
  delayMs?: number;
  reason?: string;
  configHash?: string;
  debounceMs?: number;
}): Promise<void> {
  const debounceMs = Math.max(0, params.debounceMs ?? AI_TEXT_DEBOUNCE_MS);
  let delayMs = Math.max(0, params.delayMs ?? 0);
  if (debounceMs > 0) {
    delayMs = Math.max(delayMs, debounceMs);
  }
  const reason = params.reason ? ` (${params.reason})` : '';
  const dedupId = `ai-gen-${params.preferenceId}`;
  const shouldDeduplicate = debounceMs > 0;

  const activeJobs = await countUserActiveJobs(params.userId);
  if (activeJobs >= AI_TEXT_USER_ACTIVE_LIMIT) {
    // Если у пользователя уже много активных задач, сдвигаем выполнение
    delayMs = Math.max(delayMs, AI_TEXT_USER_LIMIT_DELAY_MS);
    console.warn(
      `[AI Generation Queue] ⚠️ User ${params.userId} has ${activeJobs} active jobs, delaying enqueue for preference ${params.preferenceId} by ${delayMs}ms`
    );
  }

  try {
    await aiTextGenerationQueue.add(
      'generate',
      {
        userId: params.userId,
        preferenceId: params.preferenceId,
        configHash: params.configHash,
        reason: params.reason,
      },
      {
        delay: delayMs,
        ...(shouldDeduplicate
          ? {
              deduplication: {
                id: dedupId,
                ttl: debounceMs,
                extend: true,
                replace: true,
              },
            }
          : {}),
      }
    );

    console.log(
      `[AI Generation Queue] ✅ Enqueued job for preference ${params.preferenceId}${reason}, delay=${delayMs}ms, debounce=${debounceMs}ms`
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
