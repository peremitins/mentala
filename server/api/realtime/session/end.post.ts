import { createError, readBody } from 'h3';
import { getSessionUserWithRole } from '@/server/utils/require-role';
import {
  RealtimeVoiceSessionEndRequestDto,
  RealtimeVoiceSessionEndResponseDto,
} from '@/shared/dto';
import { endRealtimeVoiceSession } from '@/server/application/realtime/realtime-voice-session.service';

export default defineEventHandler(async (event) => {
  const sessionUser = await getSessionUserWithRole(event);
  if (!sessionUser?.id) {
    throw createError({
      statusCode: 401,
      statusMessage: 'Unauthorized',
    });
  }

  const body = RealtimeVoiceSessionEndRequestDto.parse(
    (await readBody(event)) || {}
  );
  const response = await endRealtimeVoiceSession({
    userId: sessionUser.id,
    sessionId: body.sessionId,
    reason: body.reason,
  });

  return RealtimeVoiceSessionEndResponseDto.parse(response);
});
