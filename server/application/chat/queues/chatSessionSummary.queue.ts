import { createQueue } from '@/server/infrastructure/redis/bullmqClient';

export const CHAT_SESSION_SUMMARY_QUEUE = 'chat-session-summary';

export type ChatSessionSummaryJobData = {
  therapySessionId: number;
  userId: number;
  model?: string;
};

export const chatSessionSummaryQueue = createQueue<ChatSessionSummaryJobData>(
  CHAT_SESSION_SUMMARY_QUEUE,
  {
    defaultJobOptions: {
      attempts: 4,
      backoff: {
        type: 'exponential',
        delay: 30_000,
      },
      removeOnComplete: true,
      removeOnFail: false,
    },
  }
);

function buildChatSessionSummaryJobId(therapySessionId: number): string {
  // BullMQ запрещает ":" в custom jobId, поэтому используем безопасный slug.
  return `chat-session-summary-${therapySessionId}`;
}

export async function enqueueChatSessionSummaryJob(
  data: ChatSessionSummaryJobData
) {
  try {
    await chatSessionSummaryQueue.add('session-summary', data, {
      jobId: buildChatSessionSummaryJobId(data.therapySessionId),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes('already exists')) {
      return;
    }

    throw error;
  }
}
