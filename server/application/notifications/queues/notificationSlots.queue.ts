/**
 * Очередь для генерации слотов уведомлений
 */

import type { JobsOptions } from 'bullmq';
import { createQueue } from '@/server/infrastructure/redis/bullmqClient';
import {
  calculateExponentialBackoffMs,
  slotsScalingConfig,
} from '@/server/application/notifications/slots-scaling.config';

export const NOTIFICATION_SLOTS_QUEUE = 'notification-slots-generation';

export type SlotsGenerationReason =
  | 'threshold_hit'
  | 'cron'
  | 'manual'
  | 'login'
  | 'prefs_changed'
  | 'timezone_changed'
  | 'below_horizon'
  | 'prefs_missing_or_disabled';

export type NotificationSlotsGenerationJobData = {
  userId: number;
  cycleId: number;
  reason: SlotsGenerationReason;
  traceId?: string;
  retryAttempt?: number;
  enqueuedAt?: string;
};

export const notificationSlotsQueue =
  createQueue<NotificationSlotsGenerationJobData>(NOTIFICATION_SLOTS_QUEUE);

const DEDUP_ACTIVE_STATES = new Set(['waiting', 'active', 'delayed']);

export function buildSlotsGenerationJobId(
  userId: number,
  cycleId: number
): string {
  return `slotsgen:${userId}:${cycleId}`;
}

export async function isSlotsGenerationJobActive(
  jobId: string
): Promise<boolean> {
  const existingJob = await notificationSlotsQueue.getJob(jobId);
  if (!existingJob) return false;

  const state = await existingJob.getState();
  return DEDUP_ACTIVE_STATES.has(state);
}

export async function enqueueSlotsGenerationJob(params: {
  userId: number;
  cycleId: number;
  reason: SlotsGenerationReason;
  traceId?: string;
  delayMs?: number;
  retryAttempt?: number;
}): Promise<{ enqueued: boolean; jobId: string; state?: string }> {
  const jobId = buildSlotsGenerationJobId(params.userId, params.cycleId);
  const existingJob = await notificationSlotsQueue.getJob(jobId);

  if (existingJob) {
    const state = await existingJob.getState();
    // Для одного jobId не создаём дубликаты в любом состоянии.
    // Это защищает scheduler от "already exists" и от повторной постановки
    // уже завершённых/проваленных задач того же cycle_id.
    return { enqueued: false, jobId, state };
  }

  const delayMs = Math.max(0, params.delayMs ?? 0);
  const dedupTtlSec = Math.ceil(slotsScalingConfig.queue.jobDedupTtlMs / 1000);
  const options: JobsOptions = {
    jobId,
    delay: delayMs,
    removeOnComplete: {
      age: dedupTtlSec,
      count: 20_000,
    },
    removeOnFail: {
      age: 7 * 24 * 3600,
      count: 20_000,
    },
  };

  await notificationSlotsQueue.add(
    'generate',
    {
      userId: params.userId,
      cycleId: params.cycleId,
      reason: params.reason,
      traceId: params.traceId,
      retryAttempt: params.retryAttempt ?? 0,
      enqueuedAt: new Date().toISOString(),
    },
    options
  );

  return { enqueued: true, jobId };
}

export async function rescheduleSlotsGenerationJob(params: {
  userId: number;
  cycleId: number;
  reason: SlotsGenerationReason;
  currentAttempt: number;
  traceId?: string;
}): Promise<{ enqueued: boolean; jobId: string; delayMs: number }> {
  const nextAttempt = Math.max(0, params.currentAttempt) + 1;
  const delayMs = calculateExponentialBackoffMs({
    attempt: nextAttempt,
  });

  const result = await enqueueSlotsGenerationJob({
    userId: params.userId,
    cycleId: params.cycleId,
    reason: params.reason,
    traceId: params.traceId,
    delayMs,
    retryAttempt: nextAttempt,
  });

  return {
    enqueued: result.enqueued,
    jobId: result.jobId,
    delayMs,
  };
}
