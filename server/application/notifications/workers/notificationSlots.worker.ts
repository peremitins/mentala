/**
 * Воркер генерации слотов уведомлений.
 *
 * Надёжность:
 * - проверка необходимости регенерации по planned+queued;
 * - advisory lock как межпроцессный источник истины;
 * - reschedule с exponential backoff при lock contention / timeout.
 */

import type { Job } from 'bullmq';
import { DelayedError } from 'bullmq';
import { eq } from 'drizzle-orm';
import {
  createWorker,
  registerWorker,
} from '@/server/infrastructure/redis/bullmqClient';
import { db } from '@/server/infrastructure/db/client';
import { users } from '@/server/infrastructure/db/schema';
import {
  calculateExponentialBackoffMs,
  slotsScalingConfig,
} from '@/server/application/notifications/slots-scaling.config';
import {
  NOTIFICATION_SLOTS_QUEUE,
  type NotificationSlotsGenerationJobData,
} from '../queues/notificationSlots.queue';
import { needsSlotRegenerationInternal } from '@/server/application/notifications/needs-regeneration.service';
import { generateAllSlotsForUser } from '@/server/application/notifications/scheduler.service';
import { SlotsGenerationLockTimeoutError } from '@/server/application/notifications/global-orchestration.service';
import { ensureAiNotificationAccessConsistency } from '@/server/application/notifications/notification-source-access.service';

class RegenerationTimeoutError extends Error {
  constructor(timeoutMs: number) {
    super(`Slot regeneration timeout after ${timeoutMs}ms`);
    this.name = 'RegenerationTimeoutError';
  }
}

async function withTimeout<T>(params: {
  promise: Promise<T>;
  timeoutMs: number;
}): Promise<T> {
  const timeoutMs = Math.max(1, params.timeoutMs);

  let timeoutHandle: NodeJS.Timeout | null = null;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutHandle = setTimeout(() => {
      reject(new RegenerationTimeoutError(timeoutMs));
    }, timeoutMs);
  });

  try {
    const result = await Promise.race([params.promise, timeoutPromise]);
    return result as T;
  } finally {
    if (timeoutHandle) {
      clearTimeout(timeoutHandle);
    }
  }
}

/**
 * Корректный reschedule текущей active job без смены jobId/cycleId.
 * Используем moveToDelayed + DelayedError (рекомендованный паттерн BullMQ).
 */
async function moveJobToDelayed(params: {
  job: Job<NotificationSlotsGenerationJobData>;
  token?: string;
  retryAttempt: number;
  userId: number;
  cycleId: number;
  reason: NotificationSlotsGenerationJobData['reason'];
  traceId: string;
  logReason: 'lock_not_acquired' | 'regen_timeout';
}): Promise<never> {
  const nextAttempt = Math.max(0, params.retryAttempt) + 1;
  const delayMs = calculateExponentialBackoffMs({ attempt: nextAttempt });

  await params.job.updateData({
    ...params.job.data,
    userId: params.userId,
    cycleId: params.cycleId,
    reason: params.reason,
    traceId: params.traceId,
    retryAttempt: nextAttempt,
    enqueuedAt: new Date().toISOString(),
  });

  if (!params.token) {
    // Фолбэк для окружений, где токен воркера недоступен:
    // бросаем ошибку, чтобы сработал встроенный retry/backoff BullMQ.
    throw new Error(
      `Cannot reschedule job ${String(params.job.id)}: missing worker token`
    );
  }

  await params.job.moveToDelayed(Date.now() + delayMs, params.token);

  console.warn(
    `[Notification Slots Worker] ⏳ Job ${String(params.job.id)} moved to delayed (${params.logReason}) for user=${params.userId}, cycle=${params.cycleId}, delay=${delayMs}ms, retry=${nextAttempt}`
  );

  throw new DelayedError();
}

/**
 * Запускает воркер для обработки задач генерации слотов.
 */
export function startNotificationSlotsWorker() {
  const worker = createWorker<NotificationSlotsGenerationJobData>(
    NOTIFICATION_SLOTS_QUEUE,
    async (job: Job<NotificationSlotsGenerationJobData>, token?: string) => {
      const startedAt = Date.now();
      const userId = job.data.userId;
      const cycleId = Math.max(1, Number(job.data.cycleId || 1));
      const reason = job.data.reason ?? 'cron';
      const traceId = job.data.traceId ?? `slots-${String(job.id ?? userId)}`;
      const retryAttempt = Math.max(0, Number(job.data.retryAttempt ?? 0));

      console.log(
        `[Notification Slots Worker] ▶️ Processing job ${job.id} user=${userId} cycle=${cycleId} reason=${reason} retry=${retryAttempt}`
      );

      if (!slotsScalingConfig.featureFlags.regenerationEnabled) {
        console.log(
          `[Notification Slots Worker] ⏭️ Regeneration disabled by flag, skipping job ${job.id}`
        );
        return { skipped: true, reason: 'regen_disabled' };
      }

      // Блок "валидность пользователя" держим быстрым и дешёвым.
      const [user] = await db
        .select({
          id: users.id,
          isBlocked: users.isBlocked,
          roleId: users.roleId,
          trialEndedAt: users.trialEndedAt,
        })
        .from(users)
        .where(eq(users.id, userId))
        .limit(1);

      if (!user) {
        console.warn(
          `[Notification Slots Worker] ❌ User ${userId} not found, skipping job ${job.id}`
        );
        return { skipped: true, reason: 'user_not_found' };
      }

      if (user.isBlocked) {
        console.warn(
          `[Notification Slots Worker] ❌ User ${userId} is blocked, skipping job ${job.id}`
        );
        return { skipped: true, reason: 'user_blocked' };
      }

      // Важно: если Trial/тариф больше не даёт доступ к AI-уведомлениям,
      // принудительно переводим source на templates, чтобы не останавливать
      // доставку и не запускать новые AI-генерации.
      await ensureAiNotificationAccessConsistency({
        userId,
        trialEndedAt: user.trialEndedAt,
        userRole: user.roleId,
      });

      const beforeDecision = await needsSlotRegenerationInternal(userId);
      if (!beforeDecision.shouldRegenerate) {
        console.log(
          `[Notification Slots Worker] ⏭️ Skip job ${job.id}: reason=${beforeDecision.reason}, planned=${beforeDecision.plannedCount}, queued=${beforeDecision.queuedCount}, horizonHours=${beforeDecision.actualSlotsByHours.toFixed(2)}`
        );
        return {
          skipped: true,
          reason: beforeDecision.reason,
          plannedCount: beforeDecision.plannedCount,
          queuedCount: beforeDecision.queuedCount,
        };
      }

      let orchestrationResult: Awaited<
        ReturnType<typeof generateAllSlotsForUser>
      > | null = null;
      try {
        orchestrationResult = await withTimeout({
          promise: generateAllSlotsForUser(userId, {
            reason,
            traceId,
            jobId: String(job.id ?? ''),
          }),
          timeoutMs: slotsScalingConfig.regeneration.maxRuntimeMs,
        });
      } catch (error) {
        if (error instanceof SlotsGenerationLockTimeoutError) {
          await moveJobToDelayed({
            job,
            token,
            retryAttempt,
            userId,
            cycleId,
            reason,
            traceId,
            logReason: 'lock_not_acquired',
          });
        }

        if (error instanceof RegenerationTimeoutError) {
          await moveJobToDelayed({
            job,
            token,
            retryAttempt,
            userId,
            cycleId,
            reason,
            traceId,
            logReason: 'regen_timeout',
          });
        }

        throw error;
      }

      const afterDecision = await needsSlotRegenerationInternal(userId, {
        ignoreRateLimit: true,
      });
      const tookMs = Date.now() - startedAt;

      // Обязательный structured-log на каждую регенерацию (минимальный набор).
      console.log(
        JSON.stringify({
          event: 'notification_slots_regen',
          user_id: userId,
          job_id: String(job.id),
          trace_id: traceId,
          reason,
          horizon_before: beforeDecision.actualSlotsByHours,
          horizon_after: afterDecision.actualSlotsByHours,
          deleted_count: orchestrationResult?.deletedCount ?? null,
          inserted_count: orchestrationResult?.insertedCount ?? null,
          planned_count: beforeDecision.plannedCount,
          queued_count: beforeDecision.queuedCount,
          lock_acquire_ms: orchestrationResult?.lockAcquireMs ?? null,
          took_ms: tookMs,
        })
      );

      console.log(
        `[Notification Slots Worker] ✅ Completed job ${job.id} user=${userId} cycle=${cycleId} took=${tookMs}ms`
      );

      return {
        success: true,
        tookMs,
        beforeReason: beforeDecision.reason,
        afterReason: afterDecision.reason,
      };
    },
    {
      concurrency: slotsScalingConfig.worker.concurrency,
    }
  );

  registerWorker(worker);

  console.log(
    `[Notification Slots Worker] ✅ Worker started for queue: ${NOTIFICATION_SLOTS_QUEUE}, concurrency=${slotsScalingConfig.worker.concurrency}`
  );

  return worker;
}
