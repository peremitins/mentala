import { createError } from 'h3';
import {
  REALTIME_VOICE_OPENAI_MODEL,
  REALTIME_VOICE_OPENAI_VOICE,
  REALTIME_VOICE_PROVIDER_TIMEOUT_MS,
  REALTIME_VOICE_PREFIX_PADDING_MS,
  REALTIME_VOICE_SILENCE_DURATION_MS,
  REALTIME_VOICE_TRANSCRIPTION_MODEL,
  REALTIME_VOICE_TURN_THRESHOLD,
} from '@/server/config/realtime';
import { CHAT_MEMORY_SOFT_INPUT_TOKENS } from '@/server/config/chatMemory';
import {
  isRelayEnabled,
  relayRealtimeCall,
} from '@/server/infrastructure/llm/relayClient';

const OPENAI_REALTIME_CALLS_URL = 'https://api.openai.com/v1/realtime/calls';

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
      turn_detection: {
        type: 'server_vad';
        threshold: number;
        prefix_padding_ms: number;
        silence_duration_ms: number;
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
        turn_detection: {
          type: 'server_vad',
          threshold: REALTIME_VOICE_TURN_THRESHOLD,
          prefix_padding_ms: REALTIME_VOICE_PREFIX_PADDING_MS,
          silence_duration_ms: REALTIME_VOICE_SILENCE_DURATION_MS,
          create_response: true,
          interrupt_response: false,
        },
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
      throw new Error(
        answerSdp.trim().length > 0
          ? `OpenAI realtime call failed: ${response.status} ${answerSdp}`
          : `OpenAI realtime call failed: ${response.status}`
      );
    }

    if (!answerSdp.trim()) {
      throw new Error('OpenAI realtime call returned empty SDP answer');
    }

    return answerSdp;
  } catch (error: any) {
    console.error('[RealtimeVoice] Failed to exchange realtime SDP:', {
      message: error?.message,
      sdpLength: sdp.length,
      endsWithCrLf: sdp.endsWith('\r\n'),
      usesUnifiedSessionConfig: Boolean(sessionConfig),
      usedRelay: isRelayEnabled(),
    });

    throw createError({
      statusCode: 502,
      statusMessage: 'Failed to complete realtime WebRTC handshake',
      data: {
        code: 'realtime_webrtc_handshake_failed',
      },
    });
  }
}
