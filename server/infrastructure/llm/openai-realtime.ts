import { createError } from 'h3';
import {
  REALTIME_VOICE_OPENAI_MODEL,
  REALTIME_VOICE_OPENAI_VOICE,
  REALTIME_VOICE_PROVIDER_TIMEOUT_MS,
  REALTIME_VOICE_PREFIX_PADDING_MS,
  REALTIME_VOICE_SILENCE_DURATION_MS,
  REALTIME_VOICE_TRANSCRIPTION_MODEL,
  REALTIME_VOICE_TURN_DETECTION_MODE,
  REALTIME_VOICE_TURN_THRESHOLD,
  REALTIME_VOICE_VAD_EAGERNESS,
  type RealtimeVoiceVadEagerness,
} from '@/server/config/realtime';
import { CHAT_MEMORY_SOFT_INPUT_TOKENS } from '@/server/config/chatMemory';
import {
  isRelayEnabled,
  relayRealtimeCall,
} from '@/server/infrastructure/llm/relayClient';

const OPENAI_REALTIME_CALLS_URL = 'https://api.openai.com/v1/realtime/calls';

type RealtimeWebRtcHandshakeErrorCode =
  | 'realtime_webrtc_handshake_timeout'
  | 'realtime_webrtc_handshake_network_error'
  | 'realtime_webrtc_handshake_service_unavailable'
  | 'realtime_webrtc_handshake_rate_limited'
  | 'realtime_webrtc_handshake_invalid_response'
  | 'realtime_webrtc_handshake_rejected';

type RealtimeWebRtcHandshakeFailure = Error & {
  statusCode: number;
  statusMessage: string;
  data: {
    code: RealtimeWebRtcHandshakeErrorCode;
    retryable: boolean;
    userMessage: string;
    failureKind:
      | 'timeout'
      | 'network'
      | 'service_unavailable'
      | 'rate_limited'
      | 'invalid_response'
      | 'rejected';
    upstreamStatus: number | null;
  };
};

function normalizeErrorMessage(error: any): string {
  if (typeof error?.message === 'string' && error.message.trim().length > 0) {
    return error.message.trim();
  }

  if (
    typeof error?.statusMessage === 'string' &&
    error.statusMessage.trim().length > 0
  ) {
    return error.statusMessage.trim();
  }

  return 'Unknown realtime handshake error';
}

function normalizeErrorStatusCode(error: any): number | null {
  const value =
    error?.statusCode ?? error?.status ?? error?.response?.status ?? null;

  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function buildRealtimeHandshakeFailure(params: {
  statusCode: number;
  code: RealtimeWebRtcHandshakeErrorCode;
  retryable: boolean;
  userMessage: string;
  statusMessage: string;
  failureKind: RealtimeWebRtcHandshakeFailure['data']['failureKind'];
  upstreamStatus?: number | null;
}): RealtimeWebRtcHandshakeFailure {
  return createError({
    statusCode: params.statusCode,
    statusMessage: params.statusMessage,
    data: {
      code: params.code,
      retryable: params.retryable,
      userMessage: params.userMessage,
      failureKind: params.failureKind,
      upstreamStatus:
        typeof params.upstreamStatus === 'number' &&
        Number.isFinite(params.upstreamStatus)
          ? params.upstreamStatus
          : null,
    },
  }) as RealtimeWebRtcHandshakeFailure;
}

function classifyRealtimeHandshakeError(
  error: any
): RealtimeWebRtcHandshakeFailure {
  const message = normalizeErrorMessage(error);
  const normalizedMessage = message.toLowerCase();
  const upstreamStatus = normalizeErrorStatusCode(error);
  const isTimeout =
    error?.name === 'AbortError' ||
    normalizedMessage.includes('timeout') ||
    normalizedMessage.includes('timed out') ||
    normalizedMessage.includes('aborted');

  if (isTimeout) {
    return buildRealtimeHandshakeFailure({
      statusCode: 504,
      statusMessage: 'Realtime WebRTC handshake timed out',
      code: 'realtime_webrtc_handshake_timeout',
      retryable: true,
      userMessage:
        'Не удалось быстро подключить голосовой чат. Похоже, сеть или голосовой сервер ответили слишком медленно. Попробуй ещё раз.',
      failureKind: 'timeout',
      upstreamStatus,
    });
  }

  const isNetworkError =
    normalizedMessage.includes('fetch failed') ||
    normalizedMessage.includes('failed to fetch') ||
    normalizedMessage.includes('network request failed') ||
    normalizedMessage.includes(
      'networkerror when attempting to fetch resource'
    ) ||
    normalizedMessage.includes('socket hang up') ||
    normalizedMessage.includes('econnreset') ||
    normalizedMessage.includes('enotfound') ||
    normalizedMessage.includes('ehostunreach') ||
    normalizedMessage.includes('eai_again');

  if (isNetworkError) {
    return buildRealtimeHandshakeFailure({
      statusCode: 503,
      statusMessage: 'Realtime WebRTC handshake network error',
      code: 'realtime_webrtc_handshake_network_error',
      retryable: true,
      userMessage:
        'Не удалось подключить голосовой чат из-за сетевого сбоя. Проверь интернет и попробуй ещё раз.',
      failureKind: 'network',
      upstreamStatus,
    });
  }

  if (upstreamStatus === 429) {
    return buildRealtimeHandshakeFailure({
      statusCode: 503,
      statusMessage: 'Realtime WebRTC handshake rate limited',
      code: 'realtime_webrtc_handshake_rate_limited',
      retryable: false,
      userMessage:
        'Голосовой сервер сейчас перегружен. Попробуй ещё раз чуть позже.',
      failureKind: 'rate_limited',
      upstreamStatus,
    });
  }

  if (typeof upstreamStatus === 'number' && upstreamStatus >= 500) {
    return buildRealtimeHandshakeFailure({
      statusCode: 503,
      statusMessage: 'Realtime WebRTC handshake service unavailable',
      code: 'realtime_webrtc_handshake_service_unavailable',
      retryable: true,
      userMessage:
        'Голосовой сервер временно недоступен. Обычно это разовый сбой, можно попробовать ещё раз.',
      failureKind: 'service_unavailable',
      upstreamStatus,
    });
  }

  if (
    normalizedMessage.includes('empty sdp answer') ||
    normalizedMessage.includes('returned empty sdp answer')
  ) {
    return buildRealtimeHandshakeFailure({
      statusCode: 502,
      statusMessage: 'Realtime WebRTC handshake returned invalid SDP answer',
      code: 'realtime_webrtc_handshake_invalid_response',
      retryable: true,
      userMessage:
        'Голосовой сервер вернул некорректный ответ. Обычно помогает повторная попытка.',
      failureKind: 'invalid_response',
      upstreamStatus,
    });
  }

  return buildRealtimeHandshakeFailure({
    statusCode: 502,
    statusMessage: 'Realtime WebRTC handshake was rejected',
    code: 'realtime_webrtc_handshake_rejected',
    retryable: false,
    userMessage:
      'Не удалось подготовить голосовой чат. Попробуй ещё раз чуть позже.',
    failureKind: 'rejected',
    upstreamStatus,
  });
}

export function isRealtimeWebRtcHandshakeFailure(
  error: unknown
): error is RealtimeWebRtcHandshakeFailure {
  const code = (error as RealtimeWebRtcHandshakeFailure | undefined)?.data
    ?.code;

  return typeof code === 'string' && code.startsWith('realtime_webrtc_');
}

export type OpenAiRealtimeSessionConfig = {
  type: 'realtime';
  model: string;
  instructions: string;
  truncation: {
    type: 'retention_ratio';
    retention_ratio: number;
    token_limits: {
      post_instructions: number;
    };
  };
  audio: {
    input: {
      noise_reduction: {
        type: 'near_field';
      };
      turn_detection:
        | {
            type: 'server_vad';
            threshold: number;
            prefix_padding_ms: number;
            silence_duration_ms: number;
            create_response: boolean;
            interrupt_response: boolean;
          }
        | {
            type: 'semantic_vad';
            eagerness: RealtimeVoiceVadEagerness;
            create_response: boolean;
            interrupt_response: boolean;
          };
      transcription: {
        model: string;
      };
    };
    output: {
      voice: string;
    };
  };
};

const REALTIME_VOICE_CONTEXT_RETENTION_RATIO = 0.8;

function buildRealtimeTurnDetectionConfig(): OpenAiRealtimeSessionConfig['audio']['input']['turn_detection'] {
  if (REALTIME_VOICE_TURN_DETECTION_MODE === 'server_vad') {
    return {
      type: 'server_vad',
      threshold: REALTIME_VOICE_TURN_THRESHOLD,
      prefix_padding_ms: REALTIME_VOICE_PREFIX_PADDING_MS,
      silence_duration_ms: REALTIME_VOICE_SILENCE_DURATION_MS,
      create_response: true,
      interrupt_response: false,
    };
  }

  return {
    // Semantic VAD меньше реагирует на короткие шорохи и паузы,
    // поэтому держим его основным режимом для voice UX.
    type: 'semantic_vad',
    eagerness: REALTIME_VOICE_VAD_EAGERNESS,
    create_response: true,
    interrupt_response: false,
  };
}

function getOpenAiProviderHeaders(apiKey: string): Record<string, string> {
  const organization =
    process.env.NUXT_OPENAI_ORG_ID || process.env.OPENAI_ORG_ID;
  const project =
    process.env.NUXT_OPENAI_PROJECT_ID || process.env.OPENAI_PROJECT_ID;

  return {
    Authorization: `Bearer ${apiKey}`,
    ...(organization ? { 'OpenAI-Organization': organization } : {}),
    ...(project ? { 'OpenAI-Project': project } : {}),
  };
}

export function buildOpenAiRealtimeSessionConfig(params: {
  instructions: string;
  voice?: string;
}) {
  return {
    type: 'realtime',
    model: REALTIME_VOICE_OPENAI_MODEL,
    instructions: params.instructions,
    truncation: {
      type: 'retention_ratio',
      retention_ratio: REALTIME_VOICE_CONTEXT_RETENTION_RATIO,
      token_limits: {
        post_instructions: CHAT_MEMORY_SOFT_INPUT_TOKENS,
      },
    },
    audio: {
      input: {
        noise_reduction: {
          type: 'near_field',
        },
        turn_detection: buildRealtimeTurnDetectionConfig(),
        transcription: {
          model: REALTIME_VOICE_TRANSCRIPTION_MODEL,
        },
      },
      output: {
        voice: String(params.voice || REALTIME_VOICE_OPENAI_VOICE).trim(),
      },
    },
  } satisfies OpenAiRealtimeSessionConfig;
}

export async function exchangeOpenAiRealtimeWebRtcSdp(params: {
  clientSecret?: string | null;
  sdp: string;
  sessionConfig?: OpenAiRealtimeSessionConfig | null;
}) {
  const clientSecret = String(params.clientSecret || '').trim();
  // ВАЖНО: SDP нельзя trim()'ить перед проксированием в OpenAI.
  // Удаление завершающих CRLF может сделать offer невалидным.
  const sdp =
    typeof params.sdp === 'string' ? params.sdp : String(params.sdp || '');
  const normalizedSdp = sdp.trim();

  if (!normalizedSdp) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Realtime SDP offer is required',
    });
  }

  const sessionConfig = params.sessionConfig || null;
  if (!sessionConfig && !clientSecret) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Realtime provider credentials are required',
    });
  }

  try {
    if (isRelayEnabled()) {
      const answerSdp = await relayRealtimeCall({
        sdp,
        clientSecret,
        session: sessionConfig
          ? (sessionConfig as unknown as Record<string, unknown>)
          : null,
        timeoutMs: REALTIME_VOICE_PROVIDER_TIMEOUT_MS,
      });

      if (!answerSdp.trim()) {
        throw new Error('Relay realtime call returned empty SDP answer');
      }

      return answerSdp;
    }

    const apiKey = process.env.NUXT_OPENAI_API_KEY;
    if (!apiKey) {
      throw createError({
        statusCode: 500,
        statusMessage: 'NUXT_OPENAI_API_KEY is not set',
      });
    }

    const requestInit: RequestInit = sessionConfig
      ? {
          method: 'POST',
          headers: getOpenAiProviderHeaders(apiKey),
          body: (() => {
            const formData = new FormData();
            formData.set('sdp', sdp);
            formData.set('session', JSON.stringify(sessionConfig));
            return formData;
          })(),
          signal: AbortSignal.timeout(REALTIME_VOICE_PROVIDER_TIMEOUT_MS),
        }
      : {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${clientSecret}`,
            'Content-Type': 'application/sdp',
          },
          body: sdp,
          signal: AbortSignal.timeout(REALTIME_VOICE_PROVIDER_TIMEOUT_MS),
        };

    const response = await fetch(OPENAI_REALTIME_CALLS_URL, requestInit);
    const answerSdp = await response.text();
    if (!response.ok) {
      const upstreamError = new Error(
        answerSdp.trim().length > 0
          ? `OpenAI realtime call failed: ${response.status} ${answerSdp}`
          : `OpenAI realtime call failed: ${response.status}`
      ) as Error & {
        statusCode?: number;
        status?: number;
      };
      upstreamError.statusCode = response.status;
      upstreamError.status = response.status;
      throw upstreamError;
    }

    if (!answerSdp.trim()) {
      throw new Error('OpenAI realtime call returned empty SDP answer');
    }

    return answerSdp;
  } catch (error: any) {
    console.error('[RealtimeVoice] Failed to exchange realtime SDP:', {
      message: error?.message,
      statusCode: normalizeErrorStatusCode(error),
      sdpLength: sdp.length,
      endsWithCrLf: sdp.endsWith('\r\n'),
      usesUnifiedSessionConfig: Boolean(sessionConfig),
      usedRelay: isRelayEnabled(),
    });

    throw classifyRealtimeHandshakeError(error);
  }
}
