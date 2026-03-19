function getDaysInUtcMonth(year: number, monthIndex: number): number {
  return new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();
}

function addUtcMonths(source: Date, months: number): Date {
  const targetYear =
    source.getUTCFullYear() +
    Math.floor((source.getUTCMonth() + months) / 12);
  const targetMonth = (source.getUTCMonth() + months) % 12;
  const normalizedMonth = targetMonth < 0 ? targetMonth + 12 : targetMonth;
  const yearAdjustment = targetMonth < 0 ? -1 : 0;
  const year = targetYear + yearAdjustment;
  const day = Math.min(
    source.getUTCDate(),
    getDaysInUtcMonth(year, normalizedMonth)
  );

  return new Date(
    Date.UTC(
      year,
      normalizedMonth,
      day,
      source.getUTCHours(),
      source.getUTCMinutes(),
      source.getUTCSeconds(),
      source.getUTCMilliseconds()
    )
  );
}

function startOfCurrentUtcMonth(now: Date): Date {
  return new Date(
    Date.UTC(
      now.getUTCFullYear(),
      now.getUTCMonth(),
      1,
      0,
      0,
      0,
      0
    )
  );
}

export function resolveRealtimeVoiceQuotaPeriod(params: {
  accessPeriodStartedAt?: Date | null;
  now?: Date;
}) {
  const now = params.now ?? new Date();
  const accessStart = params.accessPeriodStartedAt ?? startOfCurrentUtcMonth(now);

  if (accessStart.getTime() > now.getTime()) {
    return {
      key: accessStart.toISOString(),
      startedAt: accessStart,
      endsAt: addUtcMonths(accessStart, 1),
    };
  }

  let startedAt = accessStart;
  let nextStart = addUtcMonths(startedAt, 1);

  while (nextStart.getTime() <= now.getTime()) {
    startedAt = nextStart;
    nextStart = addUtcMonths(nextStart, 1);
  }

  return {
    key: startedAt.toISOString(),
    startedAt,
    endsAt: nextStart,
  };
}

export function isRealtimeVoiceSessionStale(params: {
  startedAt: Date;
  lastActivityAt: Date | null;
  now?: Date;
  idleTimeoutSeconds: number;
  hardCeilingSeconds: number;
  staleGraceSeconds: number;
}) {
  const now = params.now ?? new Date();
  const lastActivityAt = params.lastActivityAt ?? params.startedAt;

  const idleDeadline =
    lastActivityAt.getTime() +
    (params.idleTimeoutSeconds + params.staleGraceSeconds) * 1000;
  if (now.getTime() > idleDeadline) {
    return true;
  }

  const hardDeadline =
    params.startedAt.getTime() +
    (params.hardCeilingSeconds + params.staleGraceSeconds) * 1000;
  return now.getTime() > hardDeadline;
}
