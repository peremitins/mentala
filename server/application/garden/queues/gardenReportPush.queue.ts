/**
 * Очередь отложенной отправки push о готовом отчёте по программе (Сад).
 *
 * Зачем задержка: отчёт чаще всего генерируется синхронно, пока юзер ждёт
 * в приложении (overlay «готовлю сводку»). Если слать push сразу по
 * готовности, он всегда выигрывает гонку у клиентского mark-viewed —
 * юзер уже видит сводку на экране и тут же получает дублирующее
 * уведомление. Поэтому push ставится в очередь с задержкой, а в момент
 * отправки dispatchReportReadyPush атомарно перепроверяет viewedAt:
 * если юзер успел увидеть отчёт — push не уходит.
 */

import { createQueue } from '@/server/infrastructure/redis/bullmqClient';

export const GARDEN_REPORT_PUSH_QUEUE = 'garden-report-push';

/**
 * Окно, за которое активный клиент гарантированно успевает вызвать
 * mark-viewed (ответ API + анимация цветка + открытие sheet занимают
 * секунды). Если за это время отчёт не просмотрен — юзер его не увидел
 * (таймаут генерации, свернул приложение), и push уместен.
 */
export const GARDEN_REPORT_PUSH_DELAY_MS = 90_000;

export type GardenReportPushJobData = {
  userId: number;
  reportId: number;
  programTitle: string;
  programSlug: string;
  checkpointStep: number;
  kind: 'weekly' | 'final';
};

export const gardenReportPushQueue = createQueue<GardenReportPushJobData>(
  GARDEN_REPORT_PUSH_QUEUE,
  {
    defaultJobOptions: {
      attempts: 2,
      backoff: { type: 'exponential', delay: 30_000 },
      removeOnComplete: { age: 24 * 3600, count: 500 },
      removeOnFail: { age: 7 * 24 * 3600, count: 1000 },
    },
  }
);

/**
 * Ставит отложенный push в очередь. Fire-and-forget: ошибки логируются,
 * но не пробрасываются — сбой постановки не должен ломать генерацию отчёта.
 *
 * Если BullMQ отключён (noop-очередь молча глотает задачи), фолбэк —
 * setTimeout в текущем процессе: push некритичный, при рестарте сервера
 * его потерю компенсирует in-app модалка pending-отчётов.
 */
export async function scheduleReportReadyPush(
  data: GardenReportPushJobData
): Promise<void> {
  try {
    const job = await gardenReportPushQueue.add('garden-report-push', data, {
      delay: GARDEN_REPORT_PUSH_DELAY_MS,
      // Идемпотентность на уровне очереди: один отложенный job на отчёт.
      // Финальную защиту от дублей даёт pushSentAt внутри dispatch.
      jobId: `garden-report-push-${data.reportId}`,
    });

    if (typeof job?.id === 'string' && job.id.startsWith('noop-')) {
      // BullMQ отключён — noop-очередь ничего не выполнит. Фолбэк in-process.
      setTimeout(() => {
        void importAndDispatch(data);
      }, GARDEN_REPORT_PUSH_DELAY_MS);
    }
  } catch (error) {
    console.error('[garden-report-push] failed to schedule push:', error);
  }
}

async function importAndDispatch(data: GardenReportPushJobData) {
  const { dispatchReportReadyPush } = await import(
    '@/server/application/garden/garden-report-push.service'
  );
  await dispatchReportReadyPush(data);
}
