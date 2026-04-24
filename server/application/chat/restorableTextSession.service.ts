import { and, asc, eq } from 'drizzle-orm';
import { db } from '@/server/infrastructure/db/client';
import {
  therapySessionMessages,
  therapySessions,
} from '@/server/infrastructure/db/schema';
import { therapySessionTranscriptStore } from '@/server/utils/therapySessionTranscriptStore';
import type { RestorableTherapySessionDtoType } from '@/shared/dto/therapySessionRestore';
import {
  isSessionWithinRestoreWindow,
  mergeTranscriptSnapshots,
  sliceTranscriptBacklogSessionsUpToAnchor,
  type TranscriptBacklogAnchor,
} from './restorableTextSession.utils';

type TranscriptBacklogSession = {
  id: number;
  clientSessionId: string | null;
  startedAt: Date;
  lastActivityAt: Date | null;
  endedAt: Date | null;
};

export type UnsummarizedTextBacklog = {
  latestSession: TranscriptBacklogSession;
  sessions: TranscriptBacklogSession[];
  messages: Array<{ role: 'user' | 'assistant'; content: string }>;
};

async function listTranscriptBacklogSessions(
  userId: number
): Promise<TranscriptBacklogSession[]> {
  return db
    .selectDistinct({
      id: therapySessions.id,
      clientSessionId: therapySessions.clientSessionId,
      startedAt: therapySessions.startedAt,
      lastActivityAt: therapySessions.lastActivityAt,
      endedAt: therapySessions.endedAt,
    })
    .from(therapySessions)
    .innerJoin(
      therapySessionMessages,
      and(
        eq(therapySessionMessages.therapySessionId, therapySessions.id),
        eq(therapySessionMessages.userId, userId)
      )
    )
    .where(eq(therapySessions.userId, userId))
    .orderBy(asc(therapySessions.startedAt), asc(therapySessions.id))
    .limit(50);
}

export async function loadUnsummarizedTextBacklogForUser(
  userId: number,
  options?: {
    upToSession?: TranscriptBacklogAnchor | null;
  }
): Promise<UnsummarizedTextBacklog | null> {
  const sessions = await listTranscriptBacklogSessions(userId);
  if (!sessions.length) {
    return null;
  }

  const scopedSessions = sliceTranscriptBacklogSessionsUpToAnchor(
    sessions,
    options?.upToSession ?? null
  );
  if (!scopedSessions.length) {
    return null;
  }

  const snapshots = await Promise.all(
    scopedSessions.map((session) =>
      therapySessionTranscriptStore.getMessages(session.id, userId)
    )
  );

  const mergedMessages = mergeTranscriptSnapshots(
    snapshots.filter((snapshot) => snapshot.length > 0)
  );
  if (!mergedMessages.length) {
    return null;
  }

  const latestSession = scopedSessions[scopedSessions.length - 1];
  if (!latestSession) {
    return null;
  }

  return {
    latestSession,
    sessions: scopedSessions,
    messages: mergedMessages.map((message) => ({
      role: message.role,
      content: message.content,
    })),
  };
}

/**
 * Возвращает весь несуммаризованный backlog пользователя для восстановления чата.
 *
 * Модель такая:
 *  - billing режется по `therapySession`;
 *  - видимая история чата живёт как backlog до ближайшей summary;
 *  - каждый новый `therapySession` должен не терять старую историю и может
 *    продолжать её новым snapshot'ом.
 */
export async function getRestorableTextSessionForUser(
  userId: number
): Promise<RestorableTherapySessionDtoType | null> {
  const backlog = await loadUnsummarizedTextBacklogForUser(userId);
  if (!backlog) {
    return null;
  }

  const activityAt =
    backlog.latestSession.lastActivityAt ?? backlog.latestSession.startedAt;
  const isEnded =
    backlog.latestSession.endedAt !== null ||
    !isSessionWithinRestoreWindow(activityAt);

  return {
    therapySessionId: backlog.latestSession.id,
    clientSessionId: backlog.latestSession.clientSessionId ?? null,
    sessionStartedAt: backlog.latestSession.startedAt.toISOString(),
    lastActivityAt: backlog.latestSession.lastActivityAt?.toISOString() ?? null,
    messages: backlog.messages,
    isEnded,
  };
}

export async function cleanupUnsummarizedTextBacklogForUser(
  userId: number,
  options?: {
    upToSession?: TranscriptBacklogAnchor | null;
  }
): Promise<number> {
  const backlog = await loadUnsummarizedTextBacklogForUser(userId, options);
  const sessionIds = Array.from(
    new Set(backlog?.sessions.map((session) => session.id) ?? [])
  ).filter((sessionId) => Number.isInteger(sessionId) && sessionId > 0);

  if (!sessionIds.length) {
    return 0;
  }

  await therapySessionTranscriptStore.deleteByTherapySessionIds(
    sessionIds,
    userId
  );

  return sessionIds.length;
}
