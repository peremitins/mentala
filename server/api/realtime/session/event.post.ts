import { createError, readBody } from 'h3';
import { getSessionUserWithRole } from '@/server/utils/require-role';
import {
  RealtimeVoiceSessionEventRequestDto,
  RealtimeVoiceSessionEventResponseDto,
} from '@/shared/dto';
import { recordRealtimeVoiceSessionEvent } from '@/server/application/realtime/realtime-voice-session.service';

export default defineEventHandler(async (event) => {
  const sessionUser = await getSessionUserWithRole(event);
  if (!sessionUser?.id) {
    throw createError({
      statusCode: 401,
      statusMessage: 'Unauthorized',
    });
  }

  const body = RealtimeVoiceSessionEventRequestDto.parse(
    (await readBody(event)) || {}
  );

  const response = await recordRealtimeVoiceSessionEvent({
    userId: sessionUser.id,
    body,
  });

  return RealtimeVoiceSessionEventResponseDto.parse(response);
});
