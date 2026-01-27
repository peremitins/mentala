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
