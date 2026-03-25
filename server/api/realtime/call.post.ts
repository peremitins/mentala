import { createError, getHeader, getQuery, readRawBody, setHeader } from 'h3';
import { assertRealtimeVoiceSessionCanHandshake } from '@/server/application/realtime/realtime-voice-session.service';
import { exchangeOpenAiRealtimeWebRtcSdp } from '@/server/infrastructure/llm/openai-realtime';
import { verifyRealtimeVoiceHandshakeToken } from '@/server/application/realtime/realtime-voice-handshake-token';
import { getRealtimeVoiceSessionConfig } from '@/server/application/realtime/realtime-voice-session-config.store';

function extractBearerToken(value: string | undefined): string {
  const normalized = String(value || '').trim();
  if (!normalized.toLowerCase().startsWith('bearer ')) {
    return '';
  }

  return normalized.slice(7).trim();
}

export default defineEventHandler(async (event) => {
  const query = getQuery(event);
  const sessionId = String(query.sessionId || '').trim();
  if (!sessionId) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Realtime voice session id is required',
    });
  }

  const handshakeToken = String(query.handshakeToken || '').trim();
  const handshakePayload = verifyRealtimeVoiceHandshakeToken({
    token: handshakeToken,
    sessionId,
  });

  await assertRealtimeVoiceSessionCanHandshake({
    userId: handshakePayload.userId,
    sessionId,
  });

  const clientSecret = extractBearerToken(getHeader(event, 'authorization'));
  const storedSessionConfig = await getRealtimeVoiceSessionConfig(sessionId);
  const sessionConfig = storedSessionConfig?.sessionConfig || null;

  const sdp = await readRawBody(event, 'utf8');
  if (!sdp?.trim()) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Realtime SDP offer is required',
    });
  }

  const answerSdp = await exchangeOpenAiRealtimeWebRtcSdp({
    clientSecret,
    sdp,
    sessionConfig,
  });

  setHeader(event, 'Content-Type', 'application/sdp');
  return answerSdp;
});
