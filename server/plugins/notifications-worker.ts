/**
 * Серверный плагин для запуска воркера уведомлений
 * Запускается автоматически при старте Nitro сервера
 */

import { startDeliveryWorker } from '@/server/application/notifications/delivery.service';

export default defineNitroPlugin((nitroApp) => {
  console.log('[NotificationsWorkerPlugin] Initializing notifications worker');

  // Запускаем воркер всегда (и в development для тестирования)
  startDeliveryWorker();
  console.log('[NotificationsWorkerPlugin] Delivery worker started');
});
