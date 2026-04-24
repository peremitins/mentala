import { setResponseStatus } from 'h3';
import { getSessionUserWithRole } from '@/server/utils/require-role';
import {
  ListSessionSummariesUserQueryDto,
  ListSessionSummariesUserResponseDto,
} from '@/shared/dto/sessionSummaryUser';
import { listSessionSummariesUser } from '@/server/application/sessionSummaryUser.service';

type ErrorCode = 'E_VALIDATION' | 'E_AUTH' | 'E_UNKNOWN';

function errorResponse(
  event: Parameters<typeof setResponseStatus>[0],
  statusCode: number,
  code: ErrorCode,
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

/**
 * GET /api/session-summaries-user
 * Список пользовательских итогов сессии (ТЗ редизайн главной, п.6).
 */
export default defineEventHandler(async (event) => {
  try {
    const sessionUser = await getSessionUserWithRole(event);
    if (!sessionUser?.id) {
      return errorResponse(event, 401, 'E_AUTH', 'Unauthorized');
    }

    const parsedQuery = ListSessionSummariesUserQueryDto.safeParse(
      getQuery(event)
    );
    if (!parsedQuery.success) {
      return errorResponse(
        event,
        400,
        'E_VALIDATION',
        'Invalid query',
        parsedQuery.error.issues
      );
    }

    const { page, pageSize } = parsedQuery.data;
    const userId = Number(sessionUser.id);

    const result = await listSessionSummariesUser({ userId, page, pageSize });

    return ListSessionSummariesUserResponseDto.parse(result);
  } catch (error) {
    console.error('[SessionSummaryUser GET] Unexpected error:', error);
    return errorResponse(event, 500, 'E_UNKNOWN', 'Failed to list summaries');
  }
});
