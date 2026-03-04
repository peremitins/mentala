import { and, eq } from 'drizzle-orm';
import { setResponseStatus } from 'h3';
import { db } from '@/server/infrastructure/db/client';
import {
  chatResponseFeedback,
  therapySessions,
} from '@/server/infrastructure/db/schema';
import {
  ChatFeedbackListQueryDto,
  ChatFeedbackListResponseDto,
} from '@/shared/dto';
import { getSessionUserWithRole } from '@/server/utils/require-role';

type FeedbackErrorCode =
  | 'E_VALIDATION'
  | 'E_AUTH'
  | 'E_NOT_FOUND'
  | 'E_UNKNOWN';

function errorResponse(
  event: Parameters<typeof setResponseStatus>[0],
  statusCode: number,
  code: FeedbackErrorCode,
  message: string,
  details?: unknown
) {
  setResponseStatus(event, statusCode);
  return {
    error: {
      code,
      message,
      ...(details !== undefined ? { details } : {}),
    },
  } as const;
}

export default defineEventHandler(async (event) => {
  try {
    const sessionUser = await getSessionUserWithRole(event);
    if (!sessionUser?.id) {
      return errorResponse(event, 401, 'E_AUTH', 'Unauthorized');
    }

    const parsedQuery = ChatFeedbackListQueryDto.safeParse(getQuery(event));
    if (!parsedQuery.success) {
      return errorResponse(
        event,
        400,
        'E_VALIDATION',
        'Invalid query params',
        parsedQuery.error.issues
      );
    }

    const { therapySessionId } = parsedQuery.data;
    const userId = Number(sessionUser.id);

    const therapySession = await db
      .select({ id: therapySessions.id })
      .from(therapySessions)
      .where(
        and(
          eq(therapySessions.id, therapySessionId),
          eq(therapySessions.userId, userId)
        )
      )
      .limit(1);

    if (!therapySession[0]) {
      return errorResponse(
        event,
        404,
        'E_NOT_FOUND',
        'Therapy session not found'
      );
    }

    const items = await db
      .select({
        assistantMessageClientId: chatResponseFeedback.assistantMessageClientId,
        rating: chatResponseFeedback.rating,
        topicCode: chatResponseFeedback.topicCode,
        assistantMessageText: chatResponseFeedback.assistantMessageText,
        updatedAt: chatResponseFeedback.updatedAt,
      })
      .from(chatResponseFeedback)
      .where(
        and(
          eq(chatResponseFeedback.userId, userId),
          eq(chatResponseFeedback.therapySessionId, therapySessionId)
        )
      );

    return ChatFeedbackListResponseDto.parse({
      items: items.map((item) => ({
        assistantMessageClientId: item.assistantMessageClientId,
        rating: item.rating,
        topicCode: item.topicCode,
        assistantMessageText: item.assistantMessageText,
        updatedAt: item.updatedAt.toISOString(),
      })),
    });
  } catch (error) {
    console.error('[ChatFeedback API] Unexpected error:', error);
    return errorResponse(event, 500, 'E_UNKNOWN', 'Failed to fetch feedback');
  }
});
