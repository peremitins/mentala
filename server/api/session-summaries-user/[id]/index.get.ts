import { setResponseStatus } from 'h3';
import { getSessionUserWithRole } from '@/server/utils/require-role';
import { GetSessionSummaryUserResponseDto } from '@/shared/dto/sessionSummaryUser';
import { getSessionSummaryUser } from '@/server/application/sessionSummaryUser.service';

type ErrorCode = 'E_VALIDATION' | 'E_AUTH' | 'E_NOT_FOUND' | 'E_UNKNOWN';

function errorResponse(
  event: Parameters<typeof setResponseStatus>[0],
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
 * GET /api/session-summaries-user/[id]
 * Деталь конкретного пользовательского итога.
 */
export default defineEventHandler(async (event) => {
  try {
    const sessionUser = await getSessionUserWithRole(event);
    if (!sessionUser?.id) {
      return errorResponse(event, 401, 'E_AUTH', 'Unauthorized');
    }

    const rawId = getRouterParam(event, 'id');
    const id = Number(rawId);
    if (!Number.isFinite(id) || id <= 0) {
      return errorResponse(event, 400, 'E_VALIDATION', 'Invalid id');
    }

    const userId = Number(sessionUser.id);
    const item = await getSessionSummaryUser({ userId, id });

    if (!item) {
      return errorResponse(event, 404, 'E_NOT_FOUND', 'Summary not found');
    }

    return GetSessionSummaryUserResponseDto.parse({ item });
  } catch (error) {
    console.error('[SessionSummaryUser GET by id] Unexpected error:', error);
    return errorResponse(event, 500, 'E_UNKNOWN', 'Failed to load summary');
  }
});
