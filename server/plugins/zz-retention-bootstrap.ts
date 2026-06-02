import { isStaticGenerateProcess } from '@/server/utils/static-generate';
import { syncRetentionProgramBootstraps } from '@/server/application/programs/retention-program.service';

/**
 * Синхронизирует bootstrap-метаданные программ (programs + program_step_templates)
 * при старте Nitro. После этого вызовы syncRetentionProgramBootstraps на hot path
 * (garden, today) возвращаются мгновенно через флаг bootstrapSyncDone.
 *
 * Файл назван zz- чтобы запускаться последним среди плагинов.
 */
export default defineNitroPlugin(async () => {
  if (isStaticGenerateProcess()) return;

  try {
    await syncRetentionProgramBootstraps();
    console.log('[RetentionBootstrap] Programs synced on startup');
  } catch (err) {
    // Не блокируем старт сервера — garden/today подхватят при первом запросе.
    console.error('[RetentionBootstrap] Startup sync failed, will retry on first request:', err);
  }
});
