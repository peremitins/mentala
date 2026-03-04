import { and, isNotNull, sql } from 'drizzle-orm';
import { db } from '@/server/infrastructure/db/client';
import { chatResponseFeedback } from '@/server/infrastructure/db/schema';

const DEFAULT_COMMENT_RETENTION_DAYS = 60;

/**
 * Удаляет только текст комментариев, оставляя сам факт оценки.
 */
export async function cleanupChatFeedbackComments(params?: {
  retentionDays?: number;
}) {
  const retentionDays = Math.max(
    1,
    Math.floor(params?.retentionDays ?? DEFAULT_COMMENT_RETENTION_DAYS)
  );
  const now = new Date();

  const cleanedRows = await db
    .update(chatResponseFeedback)
    .set({
      comment: null,
      updatedAt: now,
    })
    .where(
      and(
        isNotNull(chatResponseFeedback.comment),
        sql`${chatResponseFeedback.createdAt} < now() - make_interval(days => ${retentionDays})`
      )
    )
    .returning({ id: chatResponseFeedback.id });

  return {
    cleaned: cleanedRows.length,
    retentionDays,
  };
}
