import { CHAT_IDLE_TIMEOUT_MS } from '../../config/subscription';
import type { TherapySessionTranscriptMessage } from '@/server/utils/therapySessionTranscriptStore';

export type TranscriptBacklogAnchor = {
  id: number;
  startedAt: Date;
};

export function isSessionWithinRestoreWindow(
  activityAt: Date,
  now: Date = new Date()
): boolean {
  return now.getTime() - activityAt.getTime() <= CHAT_IDLE_TIMEOUT_MS;
}

function areMessagesEqual(
  left: Pick<TherapySessionTranscriptMessage, 'role' | 'content'>,
  right: Pick<TherapySessionTranscriptMessage, 'role' | 'content'>
): boolean {
  return left.role === right.role && left.content === right.content;
}

export function isTranscriptPrefix(
  prefix: Pick<TherapySessionTranscriptMessage, 'role' | 'content'>[],
  full: Pick<TherapySessionTranscriptMessage, 'role' | 'content'>[]
): boolean {
  if (prefix.length > full.length) {
    return false;
  }

  for (let index = 0; index < prefix.length; index += 1) {
    const prefixMessage = prefix[index];
    const fullMessage = full[index];

    if (!prefixMessage || !fullMessage) {
      return false;
    }

    if (!areMessagesEqual(prefixMessage, fullMessage)) {
      return false;
    }
  }

  return true;
}

export function mergeTranscriptSnapshots(
  snapshots: TherapySessionTranscriptMessage[][]
): TherapySessionTranscriptMessage[] {
  let merged: TherapySessionTranscriptMessage[] = [];

  for (const snapshot of snapshots) {
    if (!snapshot.length) {
      continue;
    }

    if (!merged.length) {
      merged = snapshot;
      continue;
    }

    if (isTranscriptPrefix(merged, snapshot)) {
      // Новый snapshot уже содержит весь старый backlog и продолжает его.
      merged = snapshot;
      continue;
    }

    if (isTranscriptPrefix(snapshot, merged)) {
      // Старый snapshot полностью содержится в текущем merged backlog.
      continue;
    }

    // Частичный/сломанный snapshot: аккуратно дописываем его в конец уже
    // собранного backlog, чтобы не потерять историю.
    merged = [...merged, ...snapshot];
  }

  return merged;
}

export function isSessionAtOrBeforeAnchor(
  session: TranscriptBacklogAnchor,
  anchor: TranscriptBacklogAnchor
): boolean {
  const sessionStartedAt = session.startedAt.getTime();
  const anchorStartedAt = anchor.startedAt.getTime();

  if (sessionStartedAt !== anchorStartedAt) {
    return sessionStartedAt < anchorStartedAt;
  }

  return session.id <= anchor.id;
}

export function sliceTranscriptBacklogSessionsUpToAnchor<
  T extends TranscriptBacklogAnchor,
>(sessions: T[], anchor: TranscriptBacklogAnchor | null): T[] {
  if (!anchor) {
    return sessions;
  }

  return sessions.filter((session) =>
    isSessionAtOrBeforeAnchor(session, anchor)
  );
}
