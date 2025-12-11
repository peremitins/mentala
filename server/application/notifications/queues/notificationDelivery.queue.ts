/**
 * Очередь для отправки уведомлений
 */

import { createQueue } from '@/server/infrastructure/redis/bullmqClient';
import type { NotificationPayload } from '@/shared/dto/notifications';

export const NOTIFICATION_DELIVERY_QUEUE = 'notification-delivery';

export type NotificationDeliveryJobData = {
  slotId: string; // id в notification_slots - это text (string)
  userId: number;
  payload: NotificationPayload;
};

export const notificationDeliveryQueue =
  createQueue<NotificationDeliveryJobData>(NOTIFICATION_DELIVERY_QUEUE);
