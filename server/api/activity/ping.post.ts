import { setResponseStatus, type H3Event } from 'h3';
import { getSessionUser } from '@/server/application/auth/session';
import { getTimezoneFromRequest } from '@/server/application/notifications/timezone.utils';
import { recordUserEngagementActivity } from '@/server/application/activity/user-engagement.service';
import {
  ActivityPingRequestDto,
  ActivityPingResponseDto,
} from '@/shared/dto/activity';

type ErrorCode = 'E_AUTH' | 'E_VALIDATION' | 'E_UNKNOWN';

function errorResponse(
  event: H3Event,
  statusCode: number,
  code: ErrorCode,
  message: string
) {
  setResponseStatus(event, statusCode);
  return { error: { code, message } } as const;
}

export default defineEventHandler(async (event) => {
  try {
    const sessionResult = await getSessionUser(event);
    if (!sessionResult?.user?.id) {
      return errorResponse(event, 401, 'E_AUTH', 'Unauthorized');
    }

    const body = await readBody(event);
    const parsed = ActivityPingRequestDto.safeParse(body);
    if (!parsed.success) {
      return errorResponse(event, 400, 'E_VALIDATION', 'Invalid activity ping');
    }

    const timezone = getTimezoneFromRequest(event);
    const result = await recordUserEngagementActivity({
      userId: Number(sessionResult.user.id),
      event: parsed.data.event,
      timezone,
      clientVisible: parsed.data.clientVisible,
      clientFocused: parsed.data.clientFocused,
      source: parsed.data.source,
    });

    return ActivityPingResponseDto.parse({
      ok: true,
      lastSeenAt: result.lastSeenAt?.toISOString() ?? null,
      lastBackgroundedAt: result.lastBackgroundedAt?.toISOString() ?? null,
    });
  } catch (error) {
    console.error('[ActivityPing] Unexpected error:', error);
    return errorResponse(event, 500, 'E_UNKNOWN', 'Failed to record activity');
  }
});
