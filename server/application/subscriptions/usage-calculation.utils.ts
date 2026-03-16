export type TherapySessionUsageRecord = {
  startedAt: Date;
  endedAt: Date | null;
  lastActivityAt: Date | null;
};

/**
 * Рассчитать минуты из секунд (округление вниз).
 * Важно: списываем только полные минуты, меньше минуты = 0.
 */
export function calculateSessionMinutes(durationSeconds: number): number {
  if (durationSeconds < 60) {
    return 0;
  }

  return Math.floor(durationSeconds / 60);
}

/**
 * Считает usage только внутри заданного окна.
 * Окно может быть уже календарной недели, если посреди недели сменился тариф.
 */
export function calculateUsageForSessionsInWindow(
  sessions: TherapySessionUsageRecord[],
  params: {
    windowStart: Date;
    windowEnd: Date;
    idleTimeoutMs: number;
    now?: Date;
  }
): number {
  const now = params.now ?? new Date();
  let usedMinutes = 0;

  for (const session of sessions) {
    let sessionDurationSeconds = 0;

    if (session.endedAt) {
      const sessionStart =
        session.startedAt < params.windowStart
          ? params.windowStart
          : session.startedAt;
      const sessionEnd =
        session.endedAt > params.windowEnd ? params.windowEnd : session.endedAt;
      sessionDurationSeconds = Math.floor(
        (sessionEnd.getTime() - sessionStart.getTime()) / 1000
      );
    } else {
      const lastActivityAt = session.lastActivityAt || session.startedAt;
      const actualDurationMs = now.getTime() - lastActivityAt.getTime();
      const effectiveEndTime =
        actualDurationMs > params.idleTimeoutMs
          ? new Date(lastActivityAt.getTime() + params.idleTimeoutMs)
          : now;

      const sessionStart =
        session.startedAt < params.windowStart
          ? params.windowStart
          : session.startedAt;
      const sessionEnd =
        effectiveEndTime > params.windowEnd
          ? params.windowEnd
          : effectiveEndTime;
      sessionDurationSeconds = Math.floor(
        (sessionEnd.getTime() - sessionStart.getTime()) / 1000
      );
    }

    usedMinutes += calculateSessionMinutes(sessionDurationSeconds);
  }

  return usedMinutes;
}
