import type { TherapySessionTranscriptMessage } from '@/server/utils/therapySessionTranscriptStore';

type EligibilityTranscriptMessage = Pick<
  TherapySessionTranscriptMessage,
  'role' | 'content'
>;

// Константы eligibility зеркалят клиентские пороги.
// В dev-режиме сохраняем пониженные значения для удобного тестирования.
export const SESSION_SUMMARY_USER_MIN_USER_MESSAGES =
  process.env.NODE_ENV === 'development' ? 1 : 5;
export const SESSION_SUMMARY_USER_MIN_DURATION_SECONDS =
  process.env.NODE_ENV === 'development' ? 60 : 4 * 60;
export const SESSION_SUMMARY_USER_QUALIFYING_MIN_CHARS =
  process.env.NODE_ENV === 'development' ? 5 : 80;
export const SESSION_SUMMARY_USER_MIN_QUALIFYING_MESSAGES =
  process.env.NODE_ENV === 'development' ? 1 : 3;
// Отдельный bypass-порог: если пользователь накопил 15 сообщений в текущем
// backlog, summary разрешаем даже без набора временного критерия.
export const SESSION_SUMMARY_USER_FORCE_MIN_USER_MESSAGES = 15;

function countCharsWithoutSpaces(text: string): number {
  if (typeof text !== 'string') return 0;
  return text.replace(/\s+/g, '').length;
}

export interface EligibilityMetrics {
  userMessagesCount: number;
  qualifyingUserMessagesCount: number;
  durationSeconds: number;
}

export function computeEligibilityFromTranscript(
  messages: EligibilityTranscriptMessage[],
  sessionStartedAt: Date | null,
  sessionEndedAt: Date
): EligibilityMetrics {
  const userMessages = messages.filter((message) => message.role === 'user');
  const userMessagesCount = userMessages.length;
  const qualifyingUserMessagesCount = userMessages.filter(
    (message) =>
      countCharsWithoutSpaces(message.content) >=
      SESSION_SUMMARY_USER_QUALIFYING_MIN_CHARS
  ).length;

  let durationSeconds = 0;
  if (sessionStartedAt instanceof Date) {
    durationSeconds = Math.max(
      0,
      Math.floor((sessionEndedAt.getTime() - sessionStartedAt.getTime()) / 1000)
    );
  }

  return {
    userMessagesCount,
    qualifyingUserMessagesCount,
    durationSeconds,
  };
}

export function isEligibleForSummary(metrics: EligibilityMetrics): boolean {
  if (
    metrics.userMessagesCount >= SESSION_SUMMARY_USER_FORCE_MIN_USER_MESSAGES
  ) {
    return true;
  }

  return (
    metrics.userMessagesCount >= SESSION_SUMMARY_USER_MIN_USER_MESSAGES &&
    metrics.qualifyingUserMessagesCount >=
      SESSION_SUMMARY_USER_MIN_QUALIFYING_MESSAGES &&
    metrics.durationSeconds >= SESSION_SUMMARY_USER_MIN_DURATION_SECONDS
  );
}
