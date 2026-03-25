import {
  REALTIME_VOICE_HANDSHAKE_TTL_SECONDS,
  REALTIME_VOICE_HARD_CEILING_SECONDS,
} from '@/server/config/realtime';
import { redisConnection } from '@/server/infrastructure/redis/bullmqClient';
import type { OpenAiRealtimeSessionConfig } from '@/server/infrastructure/llm/openai-realtime';

type StoredRealtimeVoiceSessionConfig = {
  sessionConfig: OpenAiRealtimeSessionConfig;
  expiresAt: string;
};

type MemoryEntry = {
  payload: StoredRealtimeVoiceSessionConfig;
  expiresAtMs: number;
};

const REALTIME_VOICE_SESSION_CONFIG_KEY_PREFIX =
  'realtime:voice:session-config:';
const memoryStore = new Map<string, MemoryEntry>();

function buildRealtimeVoiceSessionConfigKey(sessionId: string): string {
  return `${REALTIME_VOICE_SESSION_CONFIG_KEY_PREFIX}${sessionId}`;
}

function getRealtimeVoiceSessionConfigTtlSeconds(
  maxDurationSeconds?: number
): number {
  const normalizedDuration = Number.isFinite(maxDurationSeconds)
    ? Math.max(0, Math.floor(Number(maxDurationSeconds)))
    : 0;

  return Math.max(
    REALTIME_VOICE_HANDSHAKE_TTL_SECONDS,
    Math.min(
      REALTIME_VOICE_HARD_CEILING_SECONDS,
      normalizedDuration || REALTIME_VOICE_HARD_CEILING_SECONDS
    )
  );
}

function canUseRedisStore(): boolean {
  return (
    Boolean(redisConnection) &&
    typeof (redisConnection as any).set === 'function' &&
    typeof (redisConnection as any).get === 'function'
  );
}

function cleanupExpiredMemoryEntries() {
  const now = Date.now();

  for (const [key, entry] of memoryStore.entries()) {
    if (entry.expiresAtMs <= now) {
      memoryStore.delete(key);
    }
  }
}

export async function saveRealtimeVoiceSessionConfig(params: {
  sessionId: string;
  sessionConfig: OpenAiRealtimeSessionConfig;
  maxDurationSeconds?: number;
}) {
  const sessionId = String(params.sessionId || '').trim();
  if (!sessionId) {
    throw new Error('Realtime voice session id is required');
  }

  const ttlSeconds = getRealtimeVoiceSessionConfigTtlSeconds(
    params.maxDurationSeconds
  );
  const expiresAt = new Date(Date.now() + ttlSeconds * 1000);
  const payload: StoredRealtimeVoiceSessionConfig = {
    sessionConfig: params.sessionConfig,
    expiresAt: expiresAt.toISOString(),
  };
  const key = buildRealtimeVoiceSessionConfigKey(sessionId);

  if (canUseRedisStore()) {
    await redisConnection.set(key, JSON.stringify(payload), 'EX', ttlSeconds);
    return payload;
  }

  cleanupExpiredMemoryEntries();
  memoryStore.set(key, {
    payload,
    expiresAtMs: expiresAt.getTime(),
  });

  return payload;
}

export async function getRealtimeVoiceSessionConfig(sessionId: string) {
  const normalizedSessionId = String(sessionId || '').trim();
  if (!normalizedSessionId) {
    return null;
  }

  const key = buildRealtimeVoiceSessionConfigKey(normalizedSessionId);

  if (canUseRedisStore()) {
    const raw = await redisConnection.get(key);
    if (!raw) {
      return null;
    }

    try {
      return JSON.parse(raw) as StoredRealtimeVoiceSessionConfig;
    } catch {
      await redisConnection.del(key);
      return null;
    }
  }

  cleanupExpiredMemoryEntries();
  const entry = memoryStore.get(key);
  if (!entry) {
    return null;
  }

  return entry.payload;
}

export async function deleteRealtimeVoiceSessionConfig(sessionId: string) {
  const normalizedSessionId = String(sessionId || '').trim();
  if (!normalizedSessionId) {
    return;
  }

  const key = buildRealtimeVoiceSessionConfigKey(normalizedSessionId);
  if (canUseRedisStore()) {
    await redisConnection.del(key);
  }

  memoryStore.delete(key);
}
