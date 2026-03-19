import { createHmac, timingSafeEqual } from 'node:crypto';
import {
  REALTIME_VOICE_HANDSHAKE_SECRET,
  REALTIME_VOICE_HANDSHAKE_TTL_SECONDS,
} from '../../config/realtime';

type RealtimeVoiceHandshakePayload = {
  v: 1;
  sessionId: string;
  userId: number;
  exp: number;
};

function createRealtimeHandshakeError(
  statusMessage: string,
  statusCode = 401
): Error & {
  statusCode: number;
  statusMessage: string;
} {
  const error = new Error(statusMessage) as Error & {
    statusCode: number;
    statusMessage: string;
  };
  error.statusCode = statusCode;
  error.statusMessage = statusMessage;
  return error;
}

function getHandshakeSecret(): string {
  const secret = String(REALTIME_VOICE_HANDSHAKE_SECRET || '').trim();
  if (!secret) {
    throw new Error('Realtime voice handshake secret is not configured');
  }

  return secret;
}

function encodeBase64Url(value: string): string {
  return Buffer.from(value, 'utf8').toString('base64url');
}

function decodeBase64Url(value: string): string {
  return Buffer.from(value, 'base64url').toString('utf8');
}

function signPayload(encodedPayload: string): string {
  return createHmac('sha256', getHandshakeSecret())
    .update(encodedPayload)
    .digest('base64url');
}

function assertValidHandshakePayload(
  payload: any
): asserts payload is RealtimeVoiceHandshakePayload {
  if (
    !payload ||
    payload.v !== 1 ||
    typeof payload.sessionId !== 'string' ||
    payload.sessionId.trim().length === 0 ||
    !Number.isInteger(payload.userId) ||
    payload.userId <= 0 ||
    !Number.isInteger(payload.exp) ||
    payload.exp <= 0
  ) {
    throw createRealtimeHandshakeError('Invalid realtime handshake token');
  }
}

export function createRealtimeVoiceHandshakeToken(params: {
  sessionId: string;
  userId: number;
  expiresAt?: Date;
}) {
  const sessionId = String(params.sessionId || '').trim();
  if (!sessionId) {
    throw new Error('Realtime voice session id is required');
  }

  if (!Number.isInteger(params.userId) || params.userId <= 0) {
    throw new Error('Realtime voice user id is invalid');
  }

  const defaultExpiresAt = new Date(
    Date.now() + REALTIME_VOICE_HANDSHAKE_TTL_SECONDS * 1000
  );
  const expiresAt =
    params.expiresAt instanceof Date &&
    Number.isFinite(params.expiresAt.getTime()) &&
    params.expiresAt.getTime() > Date.now()
      ? new Date(
          Math.min(params.expiresAt.getTime(), defaultExpiresAt.getTime())
        )
      : defaultExpiresAt;

  const payload: RealtimeVoiceHandshakePayload = {
    v: 1,
    sessionId,
    userId: params.userId,
    exp: expiresAt.getTime(),
  };
  const encodedPayload = encodeBase64Url(JSON.stringify(payload));
  const signature = signPayload(encodedPayload);

  return `${encodedPayload}.${signature}`;
}

export function verifyRealtimeVoiceHandshakeToken(params: {
  token: string;
  sessionId: string;
}) {
  const token = String(params.token || '').trim();
  const sessionId = String(params.sessionId || '').trim();

  if (!token || !sessionId) {
    throw createRealtimeHandshakeError('Realtime handshake token is required');
  }

  const [encodedPayload, actualSignature] = token.split('.');
  if (!encodedPayload || !actualSignature) {
    throw createRealtimeHandshakeError('Invalid realtime handshake token');
  }

  const expectedSignature = signPayload(encodedPayload);
  const actualSignatureBuffer = Buffer.from(actualSignature, 'utf8');
  const expectedSignatureBuffer = Buffer.from(expectedSignature, 'utf8');
  if (
    actualSignatureBuffer.length !== expectedSignatureBuffer.length ||
    !timingSafeEqual(actualSignatureBuffer, expectedSignatureBuffer)
  ) {
    throw createRealtimeHandshakeError('Invalid realtime handshake token');
  }

  let payload: RealtimeVoiceHandshakePayload;
  try {
    payload = JSON.parse(
      decodeBase64Url(encodedPayload)
    ) as RealtimeVoiceHandshakePayload;
  } catch {
    throw createRealtimeHandshakeError('Invalid realtime handshake token');
  }

  assertValidHandshakePayload(payload);

  if (payload.sessionId !== sessionId) {
    throw createRealtimeHandshakeError(
      'Realtime handshake token does not match session'
    );
  }

  if (payload.exp <= Date.now()) {
    throw createRealtimeHandshakeError('Realtime handshake token has expired');
  }

  return payload;
}
