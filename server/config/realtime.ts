import { DEFAULT_ASSISTANT_VOICE_ID } from '../../shared/constants/assistantVoiceCatalog';

function readPositiveInt(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }

  const normalized = Math.floor(parsed);
  return normalized > 0 ? normalized : fallback;
}

function readFloatInRange(
  value: string | undefined,
  fallback: number,
  min: number,
  max: number
): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }

  return Math.min(max, Math.max(min, parsed));
}

export const REALTIME_VOICE_MONTHLY_LIMIT_MINUTES = readPositiveInt(
  process.env.REALTIME_VOICE_MONTHLY_LIMIT_MINUTES,
  60
);

export const REALTIME_VOICE_HARD_CEILING_SECONDS = readPositiveInt(
  process.env.REALTIME_VOICE_HARD_CEILING_SECONDS,
  60 * 60
);

export const REALTIME_VOICE_IDLE_TIMEOUT_SECONDS = readPositiveInt(
  process.env.REALTIME_VOICE_IDLE_TIMEOUT_SECONDS,
  60
);

export const REALTIME_VOICE_STALE_GRACE_SECONDS = readPositiveInt(
  process.env.REALTIME_VOICE_STALE_GRACE_SECONDS,
  30
);

export const REALTIME_VOICE_OPENAI_MODEL =
  process.env.OPENAI_REALTIME_MODEL || 'gpt-realtime-mini';

export const REALTIME_VOICE_OPENAI_VOICE =
  process.env.OPENAI_REALTIME_VOICE || DEFAULT_ASSISTANT_VOICE_ID;

export const REALTIME_VOICE_TRANSCRIPTION_MODEL =
  process.env.OPENAI_REALTIME_TRANSCRIPTION_MODEL || 'gpt-4o-mini-transcribe';

export const REALTIME_VOICE_TURN_THRESHOLD = readFloatInRange(
  process.env.OPENAI_REALTIME_TURN_THRESHOLD,
  0.5,
  0.1,
  0.95
);

export const REALTIME_VOICE_PREFIX_PADDING_MS = readPositiveInt(
  process.env.OPENAI_REALTIME_PREFIX_PADDING_MS,
  300
);

export const REALTIME_VOICE_SILENCE_DURATION_MS = readPositiveInt(
  process.env.OPENAI_REALTIME_SILENCE_DURATION_MS,
  600
);

export const REALTIME_VOICE_CLIENT_SECRET_TIMEOUT_MS = readPositiveInt(
  process.env.OPENAI_REALTIME_CLIENT_SECRET_TIMEOUT_MS,
  15_000
);

export const REALTIME_VOICE_CLIENT_SECRET_TTL_SECONDS = readPositiveInt(
  process.env.OPENAI_REALTIME_CLIENT_SECRET_TTL_SECONDS,
  10 * 60
);

export const REALTIME_VOICE_PROVIDER_TIMEOUT_MS = readPositiveInt(
  process.env.OPENAI_REALTIME_TIMEOUT_MS,
  30_000
);

export const REALTIME_VOICE_HANDSHAKE_TTL_SECONDS = readPositiveInt(
  process.env.OPENAI_REALTIME_HANDSHAKE_TTL_SECONDS,
  5 * 60
);

export const REALTIME_VOICE_HANDSHAKE_SECRET =
  process.env.OPENAI_REALTIME_HANDSHAKE_SECRET ||
  process.env.AI_RELAY_AUTH_SECRET ||
  process.env.AUTH_EMAIL_CODE_SECRET ||
  process.env.EMAIL_HASH_PEPPER ||
  '';

export const REALTIME_VOICE_WEBRTC_URL =
  process.env.OPENAI_REALTIME_WEBRTC_URL ||
  'https://api.openai.com/v1/realtime/calls';
