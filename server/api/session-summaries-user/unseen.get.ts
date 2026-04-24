import { setResponseStatus, type H3Event } from 'h3';
import { getSessionUserWithRole } from '@/server/utils/require-role';
import { UnseenSessionSummaryUserResponseDto } from '@/shared/dto/sessionSummaryUser';
import { getUnseenSessionSummaryUser } from '@/server/application/sessionSummaryUser.service';

type ErrorCode = 'E_AUTH' | 'E_UNKNOWN';

function errorResponse(
  event: H3Event,
  statusCode: number,
  code: ErrorCode,
  message: string
) {
  setResponseStatus(event, statusCode);
  return {
    error: { code, message },
  } as const;
}

/**
 * GET /api/session-summaries-user/unseen
 * Возвращает последний непросмотренный completed-итог пользователя или null.
 * Используется UnseenSummaryModal при заходе на главную.
 */
export default defineEventHandler(async (event) => {
  try {
    const sessionUser = await getSessionUserWithRole(event);
    if (!sessionUser?.id) {
      return errorResponse(event, 401, 'E_AUTH', 'Unauthorized');
    }

    const userId = Number(sessionUser.id);
    const item = await getUnseenSessionSummaryUser({ userId });

    return UnseenSessionSummaryUserResponseDto.parse({ item });
  } catch (err) {
    console.error('[SessionSummaryUser UNSEEN] Unexpected error:', err);
    return errorResponse(
      event,
      500,
      'E_UNKNOWN',
      'Failed to load unseen summary'
    );
  }
});
