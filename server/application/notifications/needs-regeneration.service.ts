/**
 * Сервис оценки необходимости регенерации слотов.
 *
 * Контракты:
 * - считаем active slots как planned + queued;
 * - автопереген в фоне выполняем только когда горизонт почти пуст;
 * - expected/threshold считаем как диагностические метрики;
 * - не используем хрупкое окно `hoursSinceGeneration <= 2` для night mode;
 * - частоту регенерации ограничиваем `SLOTS_MIN_REGEN_INTERVAL_MINUTES`.
 */

import { findEnabledPreferencesByUser } from './repositories/notification-preferences.repository';
import {
  countActiveSlotsInRange,
  getActiveSlotsHorizonTail,
} from './repositories/notification-slots.repository';
import {
  DEFAULT_NOTIFICATION_TIMEZONE,
  hoursToMs,
  minutesToMs,
  slotsScalingConfig,
} from './slots-scaling.config';
import { isValidTimezone } from './timezone.utils';

export type SlotRegenerationReason =
  | 'threshold_hit'
  | 'below_horizon'
  | 'prefs_missing_or_disabled'
  | 'rate_limited'
  | 'horizon_ok';

export type SlotRegenerationDecision = {
  shouldRegenerate: boolean;
  reason: SlotRegenerationReason;
  timezone: string;
  timezoneConflict: boolean;
  expectedSlots: number;
  regenThreshold: number;
  actualSlots: number;
  plannedCount: number;
  queuedCount: number;
  actualSlotsByHours: number;
  minHorizonHours: number;
  targetHorizonHours: number;
  rateLimited: boolean;
  lastGeneratedAt: Date | null;
};

type NeedsRegenOptions = {
  nowUtc?: Date;
  ignoreRateLimit?: boolean;
};

function resolveTimezoneFromPreferences(
  enabledPrefs: Array<{ timezone: string }>
): {
  timezone: string;
  timezoneConflict: boolean;
} {
  if (enabledPrefs.length === 0) {
    return {
      timezone: DEFAULT_NOTIFICATION_TIMEZONE,
      timezoneConflict: false,
    };
  }

  const rawTimezone =
    enabledPrefs[0]?.timezone ?? DEFAULT_NOTIFICATION_TIMEZONE;
  const timezone = isValidTimezone(rawTimezone)
    ? rawTimezone
    : DEFAULT_NOTIFICATION_TIMEZONE;

  const timezoneConflict = enabledPrefs.some(
    (pref) => pref.timezone && pref.timezone !== enabledPrefs[0]?.timezone
  );

  return { timezone, timezoneConflict };
}

function calculateExpectedSlots(enabledPrefs: Array<{ timesPerDay: number }>): {
  expectedSlots: number;
  regenThreshold: number;
} {
  const expectedSlotsPerDay = enabledPrefs.reduce(
    (sum, pref) => sum + Math.max(0, pref.timesPerDay),
    0
  );
  const horizonDays = slotsScalingConfig.regeneration.targetHorizonHours / 24;
  const expectedSlots = Math.max(
    0,
    Math.floor(expectedSlotsPerDay * horizonDays)
  );
  const regenThreshold = Math.max(
    0,
    Math.floor(
      (expectedSlots * slotsScalingConfig.regeneration.thresholdPercent) / 100
    )
  );

  return { expectedSlots, regenThreshold };
}

/**
 * Возвращает полное решение по регенерации (с диагностикой).
 */
export async function needsSlotRegenerationInternal(
  userId: number,
  options: NeedsRegenOptions = {}
): Promise<SlotRegenerationDecision> {
  const nowUtc = options.nowUtc ?? new Date();
  const enabledPrefs = await findEnabledPreferencesByUser(userId);

  const minHorizonHours = slotsScalingConfig.regeneration.minHorizonHours;
  const targetHorizonHours = slotsScalingConfig.regeneration.targetHorizonHours;
  const horizonEndUtc = new Date(
    nowUtc.getTime() + hoursToMs(targetHorizonHours)
  );

  if (enabledPrefs.length === 0) {
    return {
      shouldRegenerate: false,
      reason: 'prefs_missing_or_disabled',
      timezone: DEFAULT_NOTIFICATION_TIMEZONE,
      timezoneConflict: false,
      expectedSlots: 0,
      regenThreshold: 0,
      actualSlots: 0,
      plannedCount: 0,
      queuedCount: 0,
      actualSlotsByHours: 0,
      minHorizonHours,
      targetHorizonHours,
      rateLimited: false,
      lastGeneratedAt: null,
    };
  }

  const { timezone, timezoneConflict } =
    resolveTimezoneFromPreferences(enabledPrefs);
  const { expectedSlots, regenThreshold } =
    calculateExpectedSlots(enabledPrefs);

  const activeSlots = await countActiveSlotsInRange(
    userId,
    nowUtc,
    horizonEndUtc
  );
  const horizonTail = await getActiveSlotsHorizonTail(
    userId,
    nowUtc,
    horizonEndUtc
  );

  const actualSlotsByHours = horizonTail.lastScheduledAt
    ? Math.max(
        0,
        (horizonTail.lastScheduledAt.getTime() - nowUtc.getTime()) / 3_600_000
      )
    : 0;

  const isHorizonEmpty = activeSlots.totalCount === 0;
  const belowMinHorizon = actualSlotsByHours < minHorizonHours;
  // "Критический" режим: почти пустой горизонт, переген нужно запускать сразу.
  const criticalLowHorizon = isHorizonEmpty || belowMinHorizon;

  let rateLimited = false;
  const minRegenIntervalMs = minutesToMs(
    slotsScalingConfig.regeneration.minRegenIntervalMinutes
  );
  const lastGeneratedAt = horizonTail.lastCreatedAt ?? null;

  if (!options.ignoreRateLimit && lastGeneratedAt) {
    rateLimited =
      nowUtc.getTime() - lastGeneratedAt.getTime() < minRegenIntervalMs;
  }

  // Автопереген в фоне только при почти пустом горизонте.
  const regenRequested = isHorizonEmpty || belowMinHorizon;
  const blockedByRateLimit =
    regenRequested && rateLimited && !criticalLowHorizon;

  if (blockedByRateLimit) {
    return {
      shouldRegenerate: false,
      reason: 'rate_limited',
      timezone,
      timezoneConflict,
      expectedSlots,
      regenThreshold,
      actualSlots: activeSlots.totalCount,
      plannedCount: activeSlots.plannedCount,
      queuedCount: activeSlots.queuedCount,
      actualSlotsByHours,
      minHorizonHours,
      targetHorizonHours,
      rateLimited: true,
      lastGeneratedAt,
    };
  }

  if (regenRequested) {
    return {
      shouldRegenerate: true,
      reason: 'below_horizon',
      timezone,
      timezoneConflict,
      expectedSlots,
      regenThreshold,
      actualSlots: activeSlots.totalCount,
      plannedCount: activeSlots.plannedCount,
      queuedCount: activeSlots.queuedCount,
      actualSlotsByHours,
      minHorizonHours,
      targetHorizonHours,
      rateLimited: false,
      lastGeneratedAt,
    };
  }

  return {
    shouldRegenerate: false,
    reason: 'horizon_ok',
    timezone,
    timezoneConflict,
    expectedSlots,
    regenThreshold,
    actualSlots: activeSlots.totalCount,
    plannedCount: activeSlots.plannedCount,
    queuedCount: activeSlots.queuedCount,
    actualSlotsByHours,
    minHorizonHours,
    targetHorizonHours,
    rateLimited: false,
    lastGeneratedAt,
  };
}
