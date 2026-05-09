import { fromZonedTime, toZonedTime } from 'date-fns-tz';

export const DEFAULT_SYSTEM_NOTIFICATION_TIMEZONE = 'Europe/Moscow';
export const SUMMARY_SEND_HOUR = 12;
const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

export const REENGAGEMENT_STAGE_1_MS = 36 * HOUR_MS;
export const REENGAGEMENT_STAGE_2_MS = 72 * HOUR_MS;
export const REENGAGEMENT_STAGE_3_MS = 7 * DAY_MS;
export const DEV_REENGAGEMENT_STAGE_1_MS = 1 * HOUR_MS;
export const DEV_REENGAGEMENT_STAGE_2_MS = 2 * HOUR_MS;
export const DEV_REENGAGEMENT_STAGE_3_MS = 3 * HOUR_MS;
export const MIN_FUTURE_SLOT_DELAY_MS = 60 * 1000;

export type ReengagementThresholds = {
  stage1Ms: number;
  stage2Ms: number;
  stage3Ms: number;
};

const PRODUCTION_REENGAGEMENT_THRESHOLDS: ReengagementThresholds = {
  stage1Ms: REENGAGEMENT_STAGE_1_MS,
  stage2Ms: REENGAGEMENT_STAGE_2_MS,
  stage3Ms: REENGAGEMENT_STAGE_3_MS,
};

const LOCAL_DEV_REENGAGEMENT_THRESHOLDS: ReengagementThresholds = {
  stage1Ms: DEV_REENGAGEMENT_STAGE_1_MS,
  stage2Ms: DEV_REENGAGEMENT_STAGE_2_MS,
  stage3Ms: DEV_REENGAGEMENT_STAGE_3_MS,
};

export function getReengagementThresholds(params: {
  localDevelopment: boolean;
}): ReengagementThresholds {
  return params.localDevelopment
    ? LOCAL_DEV_REENGAGEMENT_THRESHOLDS
    : PRODUCTION_REENGAGEMENT_THRESHOLDS;
}

export function getNextLocalHourUtc(params: {
  nowUtc: Date;
  timezone: string;
  hour: number;
}): Date {
  const nowLocal = toZonedTime(params.nowUtc, params.timezone);
  const targetLocal = new Date(nowLocal);
  targetLocal.setHours(params.hour, 0, 0, 0);

  if (targetLocal.getTime() <= nowLocal.getTime()) {
    targetLocal.setDate(targetLocal.getDate() + 1);
  }

  return fromZonedTime(targetLocal, params.timezone);
}

export function resolveSummaryReadyScheduledAt(params: {
  summaryCreatedAt: Date;
  nowUtc: Date;
  timezone: string;
}): Date {
  const readyLocal = toZonedTime(params.summaryCreatedAt, params.timezone);
  const targetLocal = new Date(readyLocal);
  targetLocal.setHours(SUMMARY_SEND_HOUR, 0, 0, 0);

  if (readyLocal.getTime() > targetLocal.getTime()) {
    targetLocal.setDate(targetLocal.getDate() + 1);
  }

  const targetUtc = fromZonedTime(targetLocal, params.timezone);
  if (targetUtc.getTime() <= params.nowUtc.getTime()) {
    return new Date(params.nowUtc.getTime() + MIN_FUTURE_SLOT_DELAY_MS);
  }

  return targetUtc;
}

export function resolveReengagementScheduledAt(params: {
  stage: 1 | 2 | 3;
  nowUtc: Date;
  timezone: string;
  localDevelopment: boolean;
}): Date {
  if (params.localDevelopment) {
    return new Date(params.nowUtc.getTime() + MIN_FUTURE_SLOT_DELAY_MS);
  }

  return getNextLocalHourUtc({
    nowUtc: params.nowUtc,
    timezone: params.timezone,
    hour: params.stage === 3 ? 12 : 19,
  });
}

export function resolveNextReengagementStage(params: {
  lastSeenAt: Date | null;
  reengagementStage: number;
  suppressedUntil: Date | null;
  nowUtc: Date;
  thresholds?: ReengagementThresholds;
}): 1 | 2 | 3 | null {
  if (!params.lastSeenAt) return null;
  if (
    params.suppressedUntil &&
    params.suppressedUntil.getTime() > params.nowUtc.getTime()
  ) {
    return null;
  }

  const absentMs = params.nowUtc.getTime() - params.lastSeenAt.getTime();
  const thresholds = params.thresholds ?? PRODUCTION_REENGAGEMENT_THRESHOLDS;

  if (absentMs >= thresholds.stage3Ms && params.reengagementStage < 3) {
    return 3;
  }
  if (absentMs >= thresholds.stage2Ms && params.reengagementStage < 2) {
    return 2;
  }
  if (absentMs >= thresholds.stage1Ms && params.reengagementStage < 1) {
    return 1;
  }
  return null;
}
