import type { Job } from 'bullmq';
import { and, desc, eq, lt, sql } from 'drizzle-orm';
import {
  createWorker,
  registerWorker,
} from '@/server/infrastructure/redis/bullmqClient';
import {
  STALE_SESSION_SUMMARIZER_QUEUE,
  registerStaleSessionSummarizerSchedule,
  type StaleSessionSummarizerJobData,
} from '../queues/staleSessionSummarizer.queue';
import { db } from '@/server/infrastructure/db/client';
import {
  sessionSummariesUser,
  therapySessionMessages,
  therapySessions,
} from '@/server/infrastructure/db/schema';
import { endTherapySession } from '@/server/application/subscriptions/session-time.service';
import { createSessionSummaryUser } from '@/server/application/sessionSummaryUser.service';
import { CHAT_IDLE_TIMEOUT_MS } from '@/server/config/subscription';
import { cleanupUnsummarizedTextBacklogForUser } from '@/server/application/chat/restorableTextSession.service';

// Берём серверный idle timeout как источник истины для определения,
// что пользователь уже точно не ведёт текущий диалог.
const NIGHTLY_IDLE_THRESHOLD_MS = CHAT_IDLE_TIMEOUT_MS;
const INELIGIBLE_BACKLOG_RETENTION_MS = 7 * 24 * 60 * 60 * 1000;
// Ограничиваем размер батча, чтобы cron не забирал все ресурсы.
const MAX_SESSIONS_PER_RUN = 200;

async function findStaleSessions() {
  const threshold = new Date(Date.now() - NIGHTLY_IDLE_THRESHOLD_MS);
  const activityAtSql = sql<Date>`coalesce(${therapySessions.lastActivityAt}, ${therapySessions.startedAt})`;

  const rows = await db
    .selectDistinct({
      id: therapySessions.id,
      userId: therapySessions.userId,
      startedAt: therapySessions.startedAt,
      lastActivityAt: therapySessions.lastActivityAt,
      endedAt: therapySessions.endedAt,
      activityAt: activityAtSql,
      summaryStatus: sessionSummariesUser.status,
    })
    .from(therapySessions)
    .innerJoin(
      therapySessionMessages,
      and(
        eq(therapySessionMessages.therapySessionId, therapySessions.id),
        eq(therapySessionMessages.userId, therapySessions.userId)
      )
    )
    .leftJoin(
      sessionSummariesUser,
      and(
        eq(sessionSummariesUser.therapySessionId, therapySessions.id),
        eq(sessionSummariesUser.userId, therapySessions.userId)
      )
    )
    .where(
      and(
        // Берём только backlog, где последняя серверная активность уже старше idle timeout.
        lt(activityAtSql, threshold)
      )
    )
    .orderBy(desc(activityAtSql), desc(therapySessions.id))
    .limit(MAX_SESSIONS_PER_RUN * 5);

  const latestByUser = new Map<number, (typeof rows)[number]>();

  for (const row of rows) {
    if (!latestByUser.has(row.userId)) {
      latestByUser.set(row.userId, row);
    }
  }

  return Array.from(latestByUser.values())
    .filter(
      (row) => row.summaryStatus === null || row.summaryStatus === 'failed'
    )
    .slice(0, MAX_SESSIONS_PER_RUN);
}

export function startStaleSessionSummarizerWorker() {
  const worker = createWorker<StaleSessionSummarizerJobData>(
    STALE_SESSION_SUMMARIZER_QUEUE,
    async (job: Job<StaleSessionSummarizerJobData>) => {
      console.log(
        `[StaleSessionSummarizerWorker] Job ${job.id} started (triggeredAt=${job.data?.triggeredAt})`
      );
      const sessions = await findStaleSessions();

      const results = {
        scanned: sessions.length,
        summarized: 0,
        notEligible: 0,
        cleanedIneligible: 0,
        errors: 0,
        closed: 0,
      };

      for (const session of sessions) {
        // Если billing-сессия ещё активна — корректно завершаем её перед summary.
        if (!session.endedAt) {
          try {
            await endTherapySession(session.id);
            results.closed += 1;
          } catch (error) {
            console.error(
              '[StaleSessionSummarizerWorker] Failed to end session:',
              { sessionId: session.id, error }
            );
            results.errors += 1;
            continue;
          }
        }

        try {
          const result = await createSessionSummaryUser({
            userId: session.userId,
            therapySessionId: session.id,
            trigger: 'cron-nightly',
          });

          if (result.eligible) {
            results.summarized += 1;
          } else {
            results.notEligible += 1;

            const activityAt = session.lastActivityAt ?? session.startedAt;
            if (
              Date.now() - activityAt.getTime() >=
              INELIGIBLE_BACKLOG_RETENTION_MS
            ) {
              const cleanedSessionsCount =
                await cleanupUnsummarizedTextBacklogForUser(session.userId, {
                  upToSession: {
                    id: session.id,
                    startedAt: session.startedAt,
                  },
                });

              if (cleanedSessionsCount > 0) {
                results.cleanedIneligible += cleanedSessionsCount;
              }
            }
          }
        } catch (error) {
          console.error(
            '[StaleSessionSummarizerWorker] Failed to summarize session:',
            { sessionId: session.id, error }
          );
          results.errors += 1;
        }
      }

      console.log(
        '[StaleSessionSummarizerWorker] Run complete:',
        JSON.stringify(results)
      );

      return results;
    },
    {
      // Одновременно только один прогон — чтобы не дублировать нагрузку на LLM.
      concurrency: 1,
    }
  );

  registerWorker(worker);

  // Регистрируем repeatable расписание (идемпотентно).
  void registerStaleSessionSummarizerSchedule().catch((error) => {
    console.error(
      '[StaleSessionSummarizerWorker] Failed to register schedule:',
      error
    );
  });

  return worker;
}
