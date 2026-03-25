import { createError, getRequestURL, readBody } from 'h3';
import { getSessionUserWithRole } from '@/server/utils/require-role';
import {
  RealtimeVoiceSessionStartRequestDto,
  RealtimeVoiceSessionStartResponseDto,
} from '@/shared/dto';
import { resolveRealtimeVoicePlatform } from '@/server/application/realtime/realtime-voice-platform';
import { startRealtimeVoiceSession } from '@/server/application/realtime/realtime-voice-session.service';
import { createRealtimeVoiceHandshakeToken } from '@/server/application/realtime/realtime-voice-handshake-token';

export default defineEventHandler(async (event) => {
  const sessionUser = await getSessionUserWithRole(event);
  if (!sessionUser?.id) {
    throw createError({
      statusCode: 401,
      statusMessage: 'Unauthorized',
    });
  }

  const body = RealtimeVoiceSessionStartRequestDto.parse(
    (await readBody(event)) || {}
  );
  const response = await startRealtimeVoiceSession({
    userId: sessionUser.id,
    userRole: sessionUser.role,
    body,
    clientPlatform: resolveRealtimeVoicePlatform(
      event,
      body.clientPlatformHint
    ),
  });

  const handshakeUrl = new URL('/api/realtime/call', getRequestURL(event));
  handshakeUrl.searchParams.set('sessionId', response.session.id);
  handshakeUrl.searchParams.set(
    'handshakeToken',
    createRealtimeVoiceHandshakeToken({
      sessionId: response.session.id,
      userId: sessionUser.id,
      expiresAt: new Date(response.openai.expiresAt),
    })
  );
  response.openai.webrtcUrl = handshakeUrl.toString();

  return RealtimeVoiceSessionStartResponseDto.parse(response);
});
