/**
 * Плагин для запуска BullMQ воркеров
 * Запускается автоматически при старте Nitro сервера
 * @version BullMQ 5.x (без QueueScheduler)
 */

export default defineNitroPlugin(async () => {
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
    const { startNotificationSlotsWorker } = await import(
      '@/server/application/notifications/workers/notificationSlots.worker'
    );
    const { startNotificationDeliveryWorker } = await import(
      '@/server/application/notifications/workers/notificationDelivery.worker'
    );

    // 1. AI Text Pool Worker
    startAiTextPoolWorker();

    // 2. AI Text Generation Worker
    startAiTextGenerationWorker();

    // 3. Notification Slots Worker
    startNotificationSlotsWorker();

    // 4. Notification Delivery Worker
    startNotificationDeliveryWorker();

    console.log('[BullMQ] ✅ All workers started successfully');
  } catch (error) {
    console.error('[BullMQ] ❌ Failed to start workers:', error);
    // Не прерываем запуск сервера, но логируем ошибку
  }
});
