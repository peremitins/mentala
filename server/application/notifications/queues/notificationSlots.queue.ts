/**
 * Очередь для генерации слотов уведомлений
 */

import { createQueue } from '@/server/infrastructure/redis/bullmqClient';

export const NOTIFICATION_SLOTS_QUEUE = 'notification-slots-generation';

export type NotificationSlotsGenerationJobData = {
  userId: number;
};

export const notificationSlotsQueue =
  createQueue<NotificationSlotsGenerationJobData>(NOTIFICATION_SLOTS_QUEUE);
