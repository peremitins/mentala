/**
 * Шардированный планировщик постановки задач генерации слотов.
 *
 * Контракты:
 * - shard-by-shard round-robin;
 * - incremental cursor по user_id внутри shard;
 * - cycle_id стабилен в рамках полного цикла;
 * - дедуп задач через jobId `slotsgen:{userId}:{cycle_id}`;
 * - runtime backpressure без переписывания env.
 */

import { and, asc, eq, gt, sql } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import { dispatchBusinessFlowCriticalEvent } from '@/server/application/events/app-events.dispatchers';
import { db } from '@/server/infrastructure/db/client';
import {
  notificationPreferences,
  users,
  slotsSchedulerCursor,
  slotsSchedulerState,
} from '@/server/infrastructure/db/schema';
import {
  LOCK_NAMESPACE_SLOTS_SCHEDULER,
  hoursToMs,
  slotsScalingConfig,
} from '@/server/application/notifications/slots-scaling.config';
import {
  enqueueSlotsGenerationJob,
  notificationSlotsQueue,
} from '@/server/application/notifications/queues/notificationSlots.queue';
import { needsSlotRegenerationInternal } from '@/server/application/notifications/needs-regeneration.service';

type SchedulerBackpressureMode = 'normal' | 'soft' | 'hard';

type SchedulerRuntimeState = {
  mode: SchedulerBackpressureMode;
  healthyCycles: number;
  effectiveBatchSize: number;
  effectiveIntervalMs: number;
  onlyUsersBelowHorizon: boolean;
};

const schedulerRuntime: SchedulerRuntimeState = {
  mode: 'normal',
  healthyCycles: 0,
  effectiveBatchSize: slotsScalingConfig.scheduler.batchSize,
  effectiveIntervalMs: slotsScalingConfig.scheduler.intervalMs,
  onlyUsersBelowHorizon: false,
};

let schedulerStarted = false;
let schedulerTimer: NodeJS.Timeout | null = null;

function resolveShardCount(): number {
  if (!slotsScalingConfig.featureFlags.shardingEnabled) return 1;
  return Math.max(1, Math.floor(slotsScalingConfig.scheduler.shards));
}

function calculateJitterMs(): number {
  const jitter = Math.max(0, slotsScalingConfig.scheduler.jitterMs);
  if (jitter === 0) return 0;

  const sign = Math.random() < 0.5 ? -1 : 1;
  return Math.floor(Math.random() * (jitter + 1)) * sign;
}

function toNumber(value: unknown, fallback = 0): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function normalizeCompletedShards(
  completedShards: unknown,
  shardCount: number
): number[] {
  if (!Array.isArray(completedShards)) return [];

  const normalized = completedShards
    .map((value) => toNumber(value, -1))
    .filter((shard) => shard >= 0 && shard < shardCount);

  return [...new Set(normalized)];
}

async function tryAcquireSchedulerLock(): Promise<boolean> {
  const lockResult = await db.execute(
    sql`select pg_try_advisory_lock(${LOCK_NAMESPACE_SLOTS_SCHEDULER}, 1) as locked`
  );

  const locked = Boolean((lockResult as any)?.rows?.[0]?.locked);
  return locked;
}

async function releaseSchedulerLock(): Promise<void> {
  try {
    await db.execute(
      sql`select pg_advisory_unlock(${LOCK_NAMESPACE_SLOTS_SCHEDULER}, 1) as unlocked`
    );
  } catch (error) {
    console.error(
      '[Notification Slots Scheduler] ⚠️ Failed to release scheduler advisory lock:',
      error
    );
  }
}

async function ensureSchedulerState(): Promise<
  typeof slotsSchedulerState.$inferSelect
> {
  const [existing] = await db
    .select()
    .from(slotsSchedulerState)
    .where(eq(slotsSchedulerState.id, 'global'))
    .limit(1);

  if (existing) return existing;

  const [created] = await db
    .insert(slotsSchedulerState)
    .values({
      id: 'global',
      globalCycleId: 1,
      nextShard: 0,
      completedShards: [],
      updatedAt: new Date(),
    })
    .onConflictDoNothing({
      target: slotsSchedulerState.id,
    })
    .returning();

  // На случай гонки между процессами: если insert не вернул строку, читаем повторно.
  if (created) return created;

  const [fallback] = await db
    .select()
    .from(slotsSchedulerState)
    .where(eq(slotsSchedulerState.id, 'global'))
    .limit(1);

  if (!fallback) {
    throw new Error(
      'Не удалось инициализировать slots_scheduler_state (global row missing)'
    );
  }

  return fallback;
}

async function ensureSchedulerCursor(params: {
  shard: number;
  cycleId: number;
}): Promise<typeof slotsSchedulerCursor.$inferSelect> {
  const [existing] = await db
    .select()
    .from(slotsSchedulerCursor)
    .where(eq(slotsSchedulerCursor.shard, params.shard))
    .limit(1);

  if (existing) return existing;

  const [created] = await db
    .insert(slotsSchedulerCursor)
    .values({
      shard: params.shard,
      lastUserId: 0,
      cycleId: params.cycleId,
      updatedAt: new Date(),
    })
    .onConflictDoNothing({
      target: slotsSchedulerCursor.shard,
    })
    .returning();

  if (created) return created;

  const [fallback] = await db
    .select()
    .from(slotsSchedulerCursor)
    .where(eq(slotsSchedulerCursor.shard, params.shard))
    .limit(1);

  if (!fallback) {
    throw new Error(
      `Не удалось инициализировать slots_scheduler_cursor для shard=${params.shard}`
    );
  }

  return fallback;
}

function normalizeShard(value: number, shardCount: number): number {
  if (!Number.isFinite(value)) return 0;
  if (shardCount <= 1) return 0;
  const normalized = Math.floor(value) % shardCount;
  return normalized >= 0 ? normalized : normalized + shardCount;
}

async function listActiveUsersBatch(params: {
  shard: number;
  shardCount: number;
  afterUserId: number;
  limit: number;
}): Promise<number[]> {
  // Важно: берём только реально существующих пользователей.
  // Иначе scheduler бесконечно будет ставить jobs для "осиротевших" preferences.
  const rows = await db
    .select({ userId: notificationPreferences.userId })
    .from(notificationPreferences)
    .innerJoin(users, eq(users.id, notificationPreferences.userId))
    .where(
      and(
        eq(notificationPreferences.enabled, true),
        gt(notificationPreferences.userId, params.afterUserId),
        sql`mod(${notificationPreferences.userId}, ${params.shardCount}) = ${params.shard}`
      )
    )
    .groupBy(notificationPreferences.userId)
    .orderBy(asc(notificationPreferences.userId))
    .limit(params.limit);

  return rows.map((row) => row.userId);
}

async function measureQueuePressure(): Promise<{
  depth: number;
  lagMs: number;
}> {
  const counts = await notificationSlotsQueue.getJobCounts(
    'waiting',
    'active',
    'delayed'
  );
  const depth =
    toNumber((counts as Record<string, number>).waiting) +
    toNumber((counts as Record<string, number>).active) +
    toNumber((counts as Record<string, number>).delayed);

  const [oldestWaiting] = await notificationSlotsQueue.getWaiting(0, 0);
  const lagMs = oldestWaiting
    ? Math.max(0, Date.now() - toNumber(oldestWaiting.timestamp))
    : 0;

  return { depth, lagMs };
}

function applyBackpressure(params: { depth: number; lagMs: number }): void {
  if (!slotsScalingConfig.featureFlags.backpressureEnabled) {
    schedulerRuntime.mode = 'normal';
    schedulerRuntime.healthyCycles = 0;
    schedulerRuntime.onlyUsersBelowHorizon = false;
    schedulerRuntime.effectiveBatchSize =
      slotsScalingConfig.scheduler.batchSize;
    schedulerRuntime.effectiveIntervalMs =
      slotsScalingConfig.scheduler.intervalMs;
    return;
  }

  const baselineBatch = slotsScalingConfig.scheduler.batchSize;
  const baselineInterval = slotsScalingConfig.scheduler.intervalMs;
  const recoveryCycles = slotsScalingConfig.backpressure.recoveryCycles;

  const isHard = params.lagMs >= slotsScalingConfig.backpressure.hardLagMs;
  const isSoft =
    params.lagMs >= slotsScalingConfig.backpressure.softLagMs ||
    params.depth > slotsScalingConfig.backpressure.queueDepthThreshold;

  if (isHard) {
    schedulerRuntime.mode = 'hard';
    schedulerRuntime.healthyCycles = 0;
    schedulerRuntime.onlyUsersBelowHorizon = true;
    schedulerRuntime.effectiveBatchSize = Math.max(
      1,
      Math.floor(baselineBatch / 4)
    );
    schedulerRuntime.effectiveIntervalMs = Math.max(
      baselineInterval,
      baselineInterval * 4
    );
    return;
  }

  if (isSoft) {
    schedulerRuntime.mode = 'soft';
    schedulerRuntime.healthyCycles = 0;
    schedulerRuntime.onlyUsersBelowHorizon = true;
    schedulerRuntime.effectiveBatchSize = Math.max(
      1,
      Math.floor(baselineBatch / 2)
    );
    schedulerRuntime.effectiveIntervalMs = Math.max(
      baselineInterval,
      baselineInterval * 2
    );
    return;
  }

  schedulerRuntime.healthyCycles += 1;
  const batchStep = Math.max(1, Math.floor(baselineBatch / 4));
  const intervalStep = Math.max(1_000, Math.floor(baselineInterval / 4));

  schedulerRuntime.effectiveBatchSize = Math.min(
    baselineBatch,
    schedulerRuntime.effectiveBatchSize + batchStep
  );
  schedulerRuntime.effectiveIntervalMs = Math.max(
    baselineInterval,
    schedulerRuntime.effectiveIntervalMs - intervalStep
  );

  if (
    schedulerRuntime.healthyCycles >= recoveryCycles &&
    schedulerRuntime.effectiveBatchSize >= baselineBatch &&
    schedulerRuntime.effectiveIntervalMs <= baselineInterval
  ) {
    schedulerRuntime.mode = 'normal';
    schedulerRuntime.healthyCycles = 0;
    schedulerRuntime.onlyUsersBelowHorizon = false;
    schedulerRuntime.effectiveBatchSize = baselineBatch;
    schedulerRuntime.effectiveIntervalMs = baselineInterval;
  }
}

function estimateFairnessDelayHours(shardCount: number): number {
  return (shardCount * schedulerRuntime.effectiveIntervalMs) / (60 * 60_000);
}

async function filterUsersBelowHorizon(userIds: number[]): Promise<number[]> {
  const result: number[] = [];

  for (const userId of userIds) {
    try {
      const regenCheck = await needsSlotRegenerationInternal(userId, {
        ignoreRateLimit: true,
      });

      if (regenCheck.shouldRegenerate) {
        result.push(userId);
      }
    } catch (error) {
      // Если проверка сломалась, не теряем пользователя: ставим в очередь.
      result.push(userId);
      console.error(
        `[Notification Slots Scheduler] ⚠️ Failed below-horizon check for user ${userId}, enqueueing anyway:`,
        error
      );
    }
  }

  return result;
}

async function processOneShardBatch(): Promise<void> {
  if (!slotsScalingConfig.featureFlags.schedulerEnabled) {
    return;
  }

  const shardCount = resolveShardCount();
  const pressure = await measureQueuePressure();
  applyBackpressure(pressure);

  const fairnessDelayHours = estimateFairnessDelayHours(shardCount);
  if (fairnessDelayHours > slotsScalingConfig.scheduler.fairnessMaxDelayHours) {
    console.warn(
      `[Notification Slots Scheduler] ⚠️ Fairness delay estimate (${fairnessDelayHours.toFixed(2)}h) exceeds SLOTS_FAIRNESS_MAX_DELAY_HOURS=${slotsScalingConfig.scheduler.fairnessMaxDelayHours}`
    );
  }

  const schedulerLockAcquired = await tryAcquireSchedulerLock();
  if (!schedulerLockAcquired) {
    console.log(
      '[Notification Slots Scheduler] ⏭️ Skip cycle: scheduler advisory lock is busy'
    );
    return;
  }

  try {
    const now = new Date();
    const state = await ensureSchedulerState();
    const shard = normalizeShard(state.nextShard, shardCount);
    const cycleId = Math.max(1, state.globalCycleId);
    const cursor = await ensureSchedulerCursor({ shard, cycleId });

    const cursorAgeMs = now.getTime() - cursor.updatedAt.getTime();
    const cursorStale =
      cursorAgeMs > Math.max(1_000, slotsScalingConfig.scheduler.cursorStaleMs);

    if (cursorStale) {
      const nextShard = normalizeShard(shard + 1, shardCount);

      await db.transaction(async (tx) => {
        await tx
          .update(slotsSchedulerCursor)
          .set({
            lastUserId: 0,
            cycleId,
            updatedAt: now,
          })
          .where(eq(slotsSchedulerCursor.shard, shard));

        await tx
          .update(slotsSchedulerState)
          .set({
            nextShard,
            updatedAt: now,
          })
          .where(eq(slotsSchedulerState.id, 'global'));
      });

      console.warn(
        `[Notification Slots Scheduler] ⚠️ Cursor stale reset: shard=${shard}, staleMs=${cursorAgeMs}, movedToShard=${nextShard}`
      );
      return;
    }

    const activeUsersBatch = await listActiveUsersBatch({
      shard,
      shardCount,
      afterUserId: Math.max(0, cursor.lastUserId),
      limit: Math.max(1, schedulerRuntime.effectiveBatchSize),
    });

    const normalizedCompletedShards = normalizeCompletedShards(
      state.completedShards,
      shardCount
    );

    if (activeUsersBatch.length === 0) {
      const completedShards = [
        ...new Set([...normalizedCompletedShards, shard]),
      ];
      const cycleCompleted = completedShards.length >= shardCount;
      const nextCycleId = cycleCompleted ? cycleId + 1 : cycleId;
      const nextCompletedShards = cycleCompleted ? [] : completedShards;
      const nextShard = normalizeShard(shard + 1, shardCount);

      await db.transaction(async (tx) => {
        await tx
          .update(slotsSchedulerCursor)
          .set({
            lastUserId: 0,
            cycleId,
            updatedAt: now,
          })
          .where(eq(slotsSchedulerCursor.shard, shard));

        await tx
          .update(slotsSchedulerState)
          .set({
            globalCycleId: nextCycleId,
            nextShard,
            completedShards: nextCompletedShards,
            updatedAt: now,
          })
          .where(eq(slotsSchedulerState.id, 'global'));
      });

      console.log(
        `[Notification Slots Scheduler] ✅ Shard exhausted: shard=${shard}, cycle=${cycleId}, cycleCompleted=${cycleCompleted}, nextCycle=${nextCycleId}, nextShard=${nextShard}`
      );
      return;
    }

    const usersToEnqueue = schedulerRuntime.onlyUsersBelowHorizon
      ? await filterUsersBelowHorizon(activeUsersBatch)
      : activeUsersBatch;

    const traceId = `${slotsScalingConfig.logs.tracePrefix}-${nanoid(10)}`;
    let enqueuedCount = 0;
    let dedupSkippedCount = 0;
    let enqueueErrorCount = 0;

    for (const userId of usersToEnqueue) {
      try {
        const enqueueResult = await enqueueSlotsGenerationJob({
          userId,
          cycleId,
          reason: schedulerRuntime.onlyUsersBelowHorizon
            ? 'below_horizon'
            : 'cron',
          traceId,
        });

        if (enqueueResult.enqueued) {
          enqueuedCount += 1;
        } else {
          dedupSkippedCount += 1;
        }
      } catch (error) {
        enqueueErrorCount += 1;
        console.error(
          `[Notification Slots Scheduler] ❌ Failed to enqueue user ${userId}, cycle=${cycleId}:`,
          error
        );
      }
    }

    // Курсор двигаем только после успешного enqueue-батча (без hard-ошибок Redis).
    if (enqueueErrorCount === 0) {
      const nextShard = normalizeShard(shard + 1, shardCount);
      const lastUserId = activeUsersBatch[activeUsersBatch.length - 1] ?? 0;

      await db.transaction(async (tx) => {
        await tx
          .update(slotsSchedulerCursor)
          .set({
            lastUserId,
            cycleId,
            updatedAt: now,
          })
          .where(eq(slotsSchedulerCursor.shard, shard));

        await tx
          .update(slotsSchedulerState)
          .set({
            nextShard,
            // shard ещё не завершён, поэтому reset completion-marker для него.
            completedShards: normalizedCompletedShards.filter(
              (completedShard) => completedShard !== shard
            ),
            updatedAt: now,
          })
          .where(eq(slotsSchedulerState.id, 'global'));
      });
    }

    console.log(
      `[Notification Slots Scheduler] ✅ Batch processed: shard=${shard}, cycle=${cycleId}, scanned=${activeUsersBatch.length}, selected=${usersToEnqueue.length}, enqueued=${enqueuedCount}, dedupSkipped=${dedupSkippedCount}, enqueueErrors=${enqueueErrorCount}, backpressureMode=${schedulerRuntime.mode}, queueDepth=${pressure.depth}, queueLagMs=${pressure.lagMs}`
    );
  } finally {
    await releaseSchedulerLock();
  }
}

/**
 * Точка входа для ручного/периодического запуска enqueue.
 * Выполняет ровно один shard-batch.
 */
export async function enqueueSlotGenerationForAllActiveUsers(): Promise<void> {
  if (!slotsScalingConfig.featureFlags.schedulerEnabled) {
    console.log(
      '[Notification Slots Scheduler] ⏭️ Scheduler is disabled by feature flag'
    );
    return;
  }

  await processOneShardBatch();
}

async function schedulerTick(): Promise<void> {
  try {
    await enqueueSlotGenerationForAllActiveUsers();
  } catch (error) {
    console.error('[Notification Slots Scheduler] ❌ Tick failed:', error);
    dispatchBusinessFlowCriticalEvent({
      flow: 'notifications.slot_generation',
      source: 'notification-slots.scheduler',
      operation: 'scheduler_tick',
      error,
      context: {
        mode: schedulerRuntime.mode,
        effectiveBatchSize: schedulerRuntime.effectiveBatchSize,
        effectiveIntervalMs: schedulerRuntime.effectiveIntervalMs,
        onlyUsersBelowHorizon: schedulerRuntime.onlyUsersBelowHorizon,
      },
    });
  }

  if (!schedulerStarted) return;

  const nextDelay = Math.max(
    1_000,
    schedulerRuntime.effectiveIntervalMs + calculateJitterMs()
  );
  schedulerTimer = setTimeout(() => {
    void schedulerTick();
  }, nextDelay);
}

/**
 * Запуск адаптивного loop для scheduler.
 */
export function startNotificationSlotsSchedulerLoop(): void {
  if (schedulerStarted) {
    console.warn(
      '[Notification Slots Scheduler] ⚠️ Scheduler loop already started'
    );
    return;
  }

  if (!slotsScalingConfig.featureFlags.schedulerEnabled) {
    console.log(
      '[Notification Slots Scheduler] ⏭️ Scheduler loop disabled by feature flag'
    );
    return;
  }

  schedulerStarted = true;

  const baselineDelay = Math.max(
    1_000,
    slotsScalingConfig.scheduler.intervalMs
  );
  const firstDelay = Math.max(
    1_000,
    Math.min(baselineDelay, Math.floor(baselineDelay / 4))
  );
  const fairnessMaxDelayMs = hoursToMs(
    slotsScalingConfig.scheduler.fairnessMaxDelayHours
  );

  console.log(
    `[Notification Slots Scheduler] ✅ Started: interval=${slotsScalingConfig.scheduler.intervalMs}ms, batch=${slotsScalingConfig.scheduler.batchSize}, shards=${resolveShardCount()}, fairnessMaxDelayMs=${fairnessMaxDelayMs}`
  );

  schedulerTimer = setTimeout(() => {
    void schedulerTick();
  }, firstDelay);
}

/**
 * Нужен для тестов/graceful shutdown.
 */
export function stopNotificationSlotsSchedulerLoop(): void {
  schedulerStarted = false;
  if (schedulerTimer) {
    clearTimeout(schedulerTimer);
    schedulerTimer = null;
  }
}
