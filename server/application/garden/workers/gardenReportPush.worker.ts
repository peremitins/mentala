/**
 * Воркер отложенной отправки push о готовом отчёте по программе (Сад).
 *
 * Job ставится с задержкой (см. gardenReportPush.queue.ts), вся логика
 * проверок (generationStatus, viewedAt, pushSentAt) — внутри
 * dispatchReportReadyPush, она атомарна и идемпотентна.
 */

import type { Job } from 'bullmq';
import {
  createWorker,
  registerWorker,
} from '@/server/infrastructure/redis/bullmqClient';
import {
  GARDEN_REPORT_PUSH_QUEUE,
  type GardenReportPushJobData,
} from '@/server/application/garden/queues/gardenReportPush.queue';
import { dispatchReportReadyPush } from '@/server/application/garden/garden-report-push.service';

export function startGardenReportPushWorker() {
  const worker = createWorker<GardenReportPushJobData>(
    GARDEN_REPORT_PUSH_QUEUE,
    async (job: Job<GardenReportPushJobData>) => {
      console.log(
        `[GardenReportPushWorker] Job ${job.id} started (reportId=${job.data.reportId}, kind=${job.data.kind})`
      );
      await dispatchReportReadyPush(job.data);
    },
    {
      concurrency: 2,
    }
  );

  registerWorker(worker);

  return worker;
}
