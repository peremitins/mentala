/**
 * Серверный плагин для запуска планировщиков уведомлений
 * Запускает периодические задачи для постановки задач в очереди BullMQ
 *
 * Механизм fallback:
 * - При BULLMQ_ENABLE_WORKERS=true → планировщики ставят задачи в BullMQ, воркеры BullMQ их обрабатывают
 * - При BULLMQ_ENABLE_WORKERS=false → планировщики ставят задачи в BullMQ, но воркеры отключены (fallback на старую логику)
 * - Никогда не запускаем оба типа воркеров одновременно
 */

import { startDeliveryWorker } from '@/server/application/notifications/delivery.service';

export default defineNitroPlugin(() => {
  // В static generate фоновые планировщики не нужны:
  // они тянут Redis/таймеры и могут подвешивать сборку.
  const isStaticBuild =
    process.env.NITRO_PRESET === 'static' ||
    process.env.npm_lifecycle_event === 'generate';
  const isWorkerEnabled = process.env.ENABLE_NOTIFICATIONS_WORKER !== 'false';

  if (!isWorkerEnabled || isStaticBuild) {
    console.log('[NotificationsWorkerPlugin] Skipped scheduler startup', {
      isWorkerEnabled,
      isStaticBuild,
      NITRO_PRESET: process.env.NITRO_PRESET,
      npmLifecycle: process.env.npm_lifecycle_event,
    });
    return;
  }

  console.log(
    '[NotificationsWorkerPlugin] Initializing notifications scheduler'
  );

  // Проверяем, нужно ли запускать планировщик
  // Планировщик всегда нужен (он ставит задачи в очереди)
  // Но при BULLMQ_ENABLE_WORKERS=false воркеры BullMQ отключены, и задачи будут накапливаться
  // Это позволяет быстро переключиться обратно на старую логику при необходимости
  const enableWorkers = process.env.BULLMQ_ENABLE_WORKERS !== 'false';

  if (enableWorkers) {
    console.log(
      '[NotificationsWorkerPlugin] BullMQ workers enabled, starting scheduler for BullMQ queues'
    );
  } else {
    console.log(
      '[NotificationsWorkerPlugin] ⚠️ BullMQ workers disabled (BULLMQ_ENABLE_WORKERS=false)'
    );
    console.log(
      '[NotificationsWorkerPlugin] Scheduler will still enqueue tasks, but workers are disabled'
    );
    console.log(
      '[NotificationsWorkerPlugin] This is a fallback mode - tasks will accumulate in Redis'
    );
  }

  // Запускаем планировщик (он будет ставить задачи в очереди BullMQ)
  // Планировщик всегда работает, независимо от BULLMQ_ENABLE_WORKERS
  startDeliveryWorker();
  console.log('[NotificationsWorkerPlugin] ✅ Delivery scheduler started');
});
