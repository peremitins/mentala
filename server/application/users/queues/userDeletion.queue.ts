/**
 * Очередь для удаления пользователей (2-фазное удаление)
 */

import { createQueue } from '@/server/infrastructure/redis/bullmqClient';

export const USER_DELETION_QUEUE = 'user-deletion';

export type UserDeletionJobData = {
  userId: number;
};

export const userDeletionQueue = createQueue<UserDeletionJobData>(
  USER_DELETION_QUEUE,
  {
    defaultJobOptions: {
      attempts: 3,
      backoff: {
        type: 'exponential',
        delay: 10_000,
      },
      removeOnComplete: {
        age: 7 * 24 * 3600, // Хранить завершённые задачи 7 дней
        count: 1000,
      },
      removeOnFail: {
        age: 30 * 24 * 3600, // Хранить проваленные задачи 30 дней
        count: 5000,
      },
    },
  }
);

