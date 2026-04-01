/**
 * Плагин для запуска BullMQ воркеров
 * Запускается автоматически при старте Nitro сервера
 * @version BullMQ 5.x (без QueueScheduler)
 */
import { dispatchAppCriticalEvent } from '@/server/application/events/app-events.dispatchers';
import { isStaticGenerateProcess } from '@/server/utils/static-generate';

export default defineNitroPlugin(async () => {
  // В static generate воркеры не должны стартовать:
  // они не нужны для prerender и требуют Redis.
  const isStaticBuild = isStaticGenerateProcess();
  const isWorkerEnabled = process.env.ENABLE_NOTIFICATIONS_WORKER !== 'false';

  if (!isWorkerEnabled || isStaticBuild) {
    console.log('[BullMQ Plugin] Skipped worker startup', {
      isWorkerEnabled,
      isStaticBuild,
      NITRO_PRESET: process.env.NITRO_PRESET,
      MENTALA_STATIC_GENERATE: process.env.MENTALA_STATIC_GENERATE,
    });
    return;
  }

  console.log('[BullMQ Plugin] Plugin loaded');

  // Проверяем, нужно ли запускать воркеры
  // ⚠️ ВАЖНО: При масштабировании (scale > 1) нужно выставить BULLMQ_ENABLE_WORKERS=false
  // на web контейнерах и создать отдельный worker-service контейнер
  // Это предотвращает дублирование задач и воркеров при нескольких контейнерах
  const enableWorkers = process.env.BULLMQ_ENABLE_WORKERS !== 'false';

  console.log(
    '[BullMQ Plugin] BULLMQ_ENABLE_WORKERS:',
    process.env.BULLMQ_ENABLE_WORKERS
  );
  console.log('[BullMQ Plugin] enableWorkers:', enableWorkers);

  if (!enableWorkers) {
    console.log('[BullMQ] Workers are disabled (BULLMQ_ENABLE_WORKERS=false)');
    return;
  }

  console.log('[BullMQ] Starting workers...');

  try {
    // Используем динамический импорт, чтобы отложить загрузку модулей
    // и избежать ошибок при импорте, если Redis недоступен
    const { startAiTextPoolWorker } = await import(
      '@/server/application/notifications/workers/aiTextPool.worker'
    );
    const { startAiTextGenerationWorker } = await import(
      '@/server/application/notifications/workers/aiTextGeneration.worker'
    );
    const { startChatSessionSummaryWorker } = await import(
      '@/server/application/chat/workers/chatSessionSummary.worker'
    );
    const { startNotificationSlotsWorker } = await import(
      '@/server/application/notifications/workers/notificationSlots.worker'
    );
    const { startNotificationDeliveryWorker } = await import(
      '@/server/application/notifications/workers/notificationDelivery.worker'
    );
    const { startTelegramAlertsWorker } = await import(
      '@/server/application/telegram/workers/telegramAlerts.worker'
    );

    // 1. AI Text Pool Worker
    startAiTextPoolWorker();

    // 2. AI Text Generation Worker
    startAiTextGenerationWorker();

    // 3. Chat Session Summary Worker
    startChatSessionSummaryWorker();

    // 4. Notification Slots Worker
    startNotificationSlotsWorker();

    // 5. Notification Delivery Worker
    startNotificationDeliveryWorker();

    // 6. Telegram Alerts Worker
    startTelegramAlertsWorker();

    console.log('[BullMQ] ✅ All workers started successfully');
  } catch (error) {
    console.error('[BullMQ] ❌ Failed to start workers:', error);
    dispatchAppCriticalEvent({
      source: 'bullmq-workers.startup',
      error,
    });
    // Не прерываем запуск сервера, но логируем ошибку
  }
});
